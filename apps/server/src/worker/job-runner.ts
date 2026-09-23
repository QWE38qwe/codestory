import { existsSync } from "node:fs";
import { join } from "node:path";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { AppConfig } from "../config.js";
import { decryptSecret } from "../services/credential.service.js";
import { readLocalRepository, removeWorkspace } from "../services/workspace.service.js";
import { scanRepository, discoverFeatures, generateStories } from "../domain/ingest/runIngest.js";
import { fetchGithubRepo } from "../domain/ingest/fetchGithubRepo.js";
import { parseGithubUrl } from "../domain/ingest/parseGithubUrl.js";
import { runtimeProjectSchema } from "../schemas/story.js";

function safeError(error: unknown): { code: string; message: string } {
  const message = error instanceof Error ? error.message : "分析任务失败。";
  if (message === "LLM_CREDENTIAL_REQUIRED") return { code: "LLM_CREDENTIAL_REQUIRED", message: "请先配置模型 API Key。" };
  if (message === "NO_EVIDENCED_FEATURES") return { code: "NO_EVIDENCED_FEATURES", message: "没有找到能对应到真实源码文件的核心功能，请缩小目录或换一个项目。" };
  if (message.startsWith("没有生成可验证的 Story")) return { code: "NO_VALID_STORY", message: "生成结果缺少可验证的源码证据，请缩小目录或稍后重试。" };
  if (/rate limit|rate_limit|HTTP 429|403/i.test(message)) return { code: "UPSTREAM_RATE_LIMIT", message: "服务请求过于频繁，请稍后重试。" };
  if (/超时|timeout|aborted/i.test(message)) return { code: "UPSTREAM_TIMEOUT", message: "模型服务响应超时，请稍后重试。" };
  if (/子目录|截断|仓库较大/i.test(message)) return { code: "REPOSITORY_TOO_LARGE", message: "仓库范围较大，请指定更小的子目录后重试。" };
  if (/JSON|模型/i.test(message)) return { code: "LLM_RESPONSE_INVALID", message: "模型未能生成可验证的 Story，请稍后重试。" };
  return { code: "ANALYSIS_FAILED", message: message.replace(/Bearer\s+\S+|sk-[\w-]+/gi, "[REDACTED]").slice(0, 300) };
}

export class JobRunner {
  private stopped = false;
  private active = false;
  constructor(private db: PrismaClient, private config: AppConfig) {}

  async recover(): Promise<void> {
    const running = await this.db.analysisJob.findMany({ where: { status: { in: ["queued", "running"] } }, include: { project: true } });
    for (const job of running) {
      if (job.project.sourceType === "local" && (!job.sourcePath || !existsSync(job.sourcePath))) {
        await this.db.analysisJob.update({ where: { id: job.id }, data: { status: "failed", stage: "failed", errorCode: "SOURCE_WORKSPACE_MISSING", errorMessage: "本地源码工作区已不存在，请重新上传。", completedAt: new Date() } });
      } else if (job.status === "running") {
        await this.db.analysisJob.update({ where: { id: job.id }, data: { status: "queued", stage: "queued", progress: 0 } });
      }
    }
  }

  async start(): Promise<void> { await this.recover(); void this.loop(); }
  stop(): void { this.stopped = true; }

  private async loop(): Promise<void> {
    while (!this.stopped) {
      if (!this.active) {
        const job = await this.db.analysisJob.findFirst({ where: { status: "queued" }, orderBy: { createdAt: "asc" }, include: { project: true } });
        if (job) {
          this.active = true;
          void this.process(job).finally(() => { this.active = false; });
        }
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  private async setStage(jobId: string, stage: string, progress: number): Promise<void> {
    await this.db.analysisJob.update({ where: { id: jobId }, data: { status: "running", stage, progress: { set: progress } } });
  }

  private async process(job: any): Promise<void> {
    try {
      await this.db.analysisJob.update({ where: { id: job.id }, data: { status: "running", stage: "fetching_repository", progress: 10, startedAt: new Date(), errorCode: null, errorMessage: null } });
      const repo = job.project.sourceType === "local"
        ? await readLocalRepository(join(job.sourcePath, "source"), job.project.name)
        : await fetchGithubRepo({ url: parseGithubUrl(job.project.repoUrl), branch: job.project.branch, subdir: job.project.subdir, token: this.config.githubToken, languages: { js: true, python: true } });
      if (job.project.sourceType === "github") await this.db.project.update({ where: { id: job.projectId }, data: { commitSha: repo.commit } });
      await this.setStage(job.id, "building_structure", 35);
      const scan = await scanRepository({ sourceType: "local", files: repo, githubUrl: "", branch: "", subdir: "", languages: { js: true, python: true }, githubToken: "" });
      await this.setStage(job.id, "discovering_features", 55);
      const stored = await this.db.llmCredential.findUnique({ where: { id: "default" } });
      if (!stored) throw new Error("LLM_CREDENTIAL_REQUIRED");
      const apiKey = decryptSecret(stored, this.config.credentialKey);
      const settings = { baseUrl: stored.baseUrl, model: stored.model, apiKey, allowedOrigins: this.config.allowedOrigins };
      const featureDraft = await discoverFeatures({ ...scan, settings, maxFeatures: 3 });
      await this.setStage(job.id, "generating_story", 80);
      const result = await generateStories({ ...scan, settings, features: featureDraft.features, featureDraft: featureDraft.featureDraft });
      if (!result.project.actions.length) throw new Error("没有生成可验证的 Story。请换一个仓库或缩小分析目录。");
      const runtimeProject = runtimeProjectSchema.parse(result.project);
      await this.setStage(job.id, "validating", 92);
      const completedAt = new Date();
      await this.setStage(job.id, "persisting", 97);
      await this.db.$transaction([
        this.db.story.create({ data: { projectId: job.projectId, jobId: job.id, content: JSON.parse(JSON.stringify(runtimeProject)) as Prisma.InputJsonValue } }),
        this.db.project.update({ where: { id: job.projectId }, data: { status: "completed" } }),
        this.db.analysisJob.update({ where: { id: job.id }, data: { status: "completed", stage: "completed", progress: 100, completedAt, errorCode: null, errorMessage: null } }),
      ]);
    } catch (error) {
      const safe = safeError(error);
      await this.db.analysisJob.update({ where: { id: job.id }, data: { status: "failed", stage: "failed", errorCode: safe.code, errorMessage: safe.message, completedAt: new Date() } }).catch(() => undefined);
      await this.db.project.update({ where: { id: job.projectId }, data: { status: "failed" } }).catch(() => undefined);
    } finally {
      if (job.sourcePath) await removeWorkspace(job.sourcePath).catch((error) => console.error("Workspace cleanup failed", { jobId: job.id, message: error instanceof Error ? error.message : "unknown" }));
    }
  }
}
