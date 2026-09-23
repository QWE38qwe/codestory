import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import { dirname, extname, join, resolve } from "node:path";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import type { PrismaClient } from "@prisma/client";
import type { AppConfig } from "./config.js";
import { decryptSecret, encryptSecret, maskSecret } from "./services/credential.service.js";
import { testCompletion } from "./services/llm.service.js";
import { ensureWorkspaceRoot, safeRelativePath } from "./services/workspace.service.js";
import { isSupportedSource, shouldIgnorePath } from "./domain/ingest/filterFiles.js";
import { parseGithubUrl } from "./domain/ingest/parseGithubUrl.js";
import { runtimeProjectSchema } from "./schemas/story.js";

type Dependencies = { db: PrismaClient; config: AppConfig; staticRoot?: string };
type LocalManifest = { projectName?: string; files?: Array<{ index: number; path: string }> };
const llmSchema = z.object({ baseUrl: z.string().url().max(500), model: z.string().trim().min(1).max(120), apiKey: z.string().trim().min(1).max(500) });
const githubSchema = z.object({ repoUrl: z.string().trim().min(1).max(500), branch: z.string().trim().max(200).optional(), subdir: z.string().trim().max(500).optional() });
const MAX_FILE_BYTES = 200 * 1024;
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;
const MAX_FILES = 400;

function apiError(code: string, message: string, retryable = false) { return { error: { code, message, retryable } }; }
function safeName(value: string): string { return value.replace(/[\\/:*?"<>|\x00-\x1f]/g, "-").trim().slice(0, 100) || "local-project"; }

export async function buildApp({ db, config, staticRoot }: Dependencies): Promise<FastifyInstance> {
  const app = Fastify({ logger: { level: "info", redact: { paths: ["req.headers.authorization", "req.headers.x-api-key", "req.body.apiKey", "req.body.githubToken", "req.body.ciphertext"], censor: "[REDACTED]" } } });
  await app.register(multipart, { limits: { files: MAX_FILES, fileSize: MAX_FILE_BYTES, fields: 1, parts: MAX_FILES + 1, fieldSize: 1024 * 1024 } });

  app.setErrorHandler((error, request, reply) => {
    const requestError = error as Error & { code?: string; statusCode?: number };
    request.log.error({ err: { name: requestError.name, code: requestError.code } }, "request failed");
    if (requestError.statusCode === 413 || requestError.code === "FST_REQ_FILE_TOO_LARGE") return reply.code(413).send(apiError("UPLOAD_LIMIT_EXCEEDED", "上传内容超过大小限制。"));
    if (requestError.statusCode === 415) return reply.code(415).send(apiError("UNSUPPORTED_MEDIA_TYPE", "请使用 multipart/form-data 上传本地项目。"));
    return reply.code(500).send(apiError("INTERNAL_ERROR", "服务器暂时无法处理请求。", true));
  });

  app.get("/api/health", async () => ({ status: "ok" }));

  app.get("/api/settings/llm", async () => {
    const row = await db.llmCredential.findUnique({ where: { id: "default" } });
    if (!row) return { configured: false, baseUrl: "", model: "", maskedKey: "" };
    try { return { configured: true, baseUrl: row.baseUrl, model: row.model, maskedKey: maskSecret(decryptSecret(row, config.credentialKey)) }; }
    catch { return { configured: false, baseUrl: row.baseUrl, model: row.model, maskedKey: "" }; }
  });

  app.put("/api/settings/llm", async (request, reply) => {
    const parsed = llmSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(apiError("INVALID_LLM_SETTINGS", "请填写有效的模型地址、名称和 API Key。"));
    const settings = parsed.data;
    try { await testCompletion(settings, config.allowedOrigins); }
    catch { return reply.code(400).send(apiError("LLM_CONNECTION_FAILED", "模型连接测试失败；现有配置未更改。", true)); }
    const encrypted = encryptSecret(settings.apiKey, config.credentialKey);
    await db.llmCredential.upsert({ where: { id: "default" }, create: { id: "default", baseUrl: settings.baseUrl.replace(/\/$/, ""), model: settings.model, ...encrypted }, update: { baseUrl: settings.baseUrl.replace(/\/$/, ""), model: settings.model, ...encrypted } });
    return { configured: true, baseUrl: settings.baseUrl.replace(/\/$/, ""), model: settings.model, maskedKey: maskSecret(settings.apiKey) };
  });

  app.delete("/api/settings/llm", async (_request, reply) => { await db.llmCredential.deleteMany({ where: { id: "default" } }); return reply.code(204).send(); });

  app.post("/api/projects/analyze/github", async (request, reply) => {
    const parsed = githubSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(apiError("INVALID_REPOSITORY", "GitHub 仓库信息不完整。"));
    let repo;
    try { repo = parseGithubUrl(parsed.data.repoUrl); }
    catch { return reply.code(400).send(apiError("INVALID_REPOSITORY", "仅支持有效的 github.com 仓库地址或 owner/repo。")); }
    if (!await db.llmCredential.findUnique({ where: { id: "default" } })) return reply.code(400).send(apiError("LLM_CREDENTIAL_REQUIRED", "请先配置模型 API Key。"));
    const project = await db.project.create({ data: { name: repo.repo, sourceType: "github", repoUrl: `https://github.com/${repo.owner}/${repo.repo}`, branch: parsed.data.branch || repo.ref || null, subdir: parsed.data.subdir || repo.subdir || null, status: "queued", jobs: { create: { status: "queued", stage: "queued" } } }, include: { jobs: true } });
    const job = project.jobs[0]!;
    return reply.code(202).send({ jobId: job.id, projectId: project.id, status: job.status });
  });

  app.post("/api/projects/analyze/local", async (request, reply) => {
    const jobId = `job_${randomUUID()}`;
    const workspace = resolve(config.workspacesDir, jobId);
    const sourceRoot = join(workspace, "source");
    const seen = new Set<string>();
    let metadata: LocalManifest | null = null;
    let totalBytes = 0;
    try {
      await ensureWorkspaceRoot(sourceRoot);
      for await (const part of request.parts()) {
        if (part.type === "field" && part.fieldname === "metadata") {
          try { metadata = (typeof part.value === "string" ? JSON.parse(part.value) : part.value) as LocalManifest; } catch { throw Object.assign(new Error("INVALID_METADATA"), { statusCode: 400 }); }
          if (!metadata || !Array.isArray(metadata.files) || metadata.files.length < 1 || metadata.files.length > MAX_FILES) throw Object.assign(new Error("INVALID_METADATA"), { statusCode: 400 });
          const indexes = new Set<number>();
          for (const item of metadata.files) {
            if (!Number.isInteger(item.index) || item.index < 0 || indexes.has(item.index)) throw Object.assign(new Error("INVALID_METADATA"), { statusCode: 400 });
            indexes.add(item.index);
            const path = safeRelativePath(item.path);
            if (!isSupportedSource(path) || shouldIgnorePath(path) || seen.has(path.toLowerCase())) throw Object.assign(new Error("INVALID_FILE_PATH"), { statusCode: 400 });
            seen.add(path.toLowerCase());
            item.path = path;
          }
          seen.clear();
          continue;
        }
        if (part.type !== "file" || part.fieldname !== "files") throw Object.assign(new Error("INVALID_UPLOAD"), { statusCode: 400 });
        if (!metadata) throw Object.assign(new Error("METADATA_REQUIRED"), { statusCode: 400 });
        const index = Number(part.filename);
        const item = metadata.files!.find((entry) => entry.index === index);
        if (!item || !Number.isSafeInteger(index) || seen.has(item.path.toLowerCase())) throw Object.assign(new Error("INVALID_UPLOAD_FILE"), { statusCode: 400 });
        seen.add(item.path.toLowerCase());
        const target = resolve(sourceRoot, item.path);
        if (!target.startsWith(`${sourceRoot}${process.platform === "win32" ? "\\" : "/"}`)) throw Object.assign(new Error("INVALID_FILE_PATH"), { statusCode: 400 });
        await mkdir(dirname(target), { recursive: true });
        let fileBytes = 0;
        part.file.on("data", (chunk: Buffer) => { fileBytes += chunk.length; totalBytes += chunk.length; if (totalBytes > MAX_TOTAL_BYTES) part.file.destroy(Object.assign(new Error("UPLOAD_LIMIT_EXCEEDED"), { statusCode: 413 })); });
        await pipeline(part.file, createWriteStream(target, { flags: "wx" }));
        if (fileBytes > MAX_FILE_BYTES || part.file.truncated) throw Object.assign(new Error("UPLOAD_LIMIT_EXCEEDED"), { statusCode: 413 });
      }
      const expectedFiles = metadata?.files;
      if (!expectedFiles || seen.size !== expectedFiles.length) throw Object.assign(new Error("UPLOAD_INCOMPLETE"), { statusCode: 400 });
      if (!await db.llmCredential.findUnique({ where: { id: "default" } })) throw Object.assign(new Error("LLM_CREDENTIAL_REQUIRED"), { statusCode: 400 });
      const project = await db.project.create({ data: { name: safeName(metadata?.projectName || "local-project"), sourceType: "local", status: "queued", jobs: { create: { id: jobId, status: "queued", stage: "queued", sourcePath: workspace } } }, include: { jobs: true } });
      const job = project.jobs[0]!;
      return reply.code(202).send({ jobId: job.id, projectId: project.id, status: job.status });
    } catch (error) {
      await rm(workspace, { recursive: true, force: true }).catch(() => undefined);
      const status = Number((error as any).statusCode) || 400;
      const code = error instanceof Error && error.message === "LLM_CREDENTIAL_REQUIRED" ? "LLM_CREDENTIAL_REQUIRED" : status === 413 ? "UPLOAD_LIMIT_EXCEEDED" : "INVALID_LOCAL_UPLOAD";
      const message = code === "LLM_CREDENTIAL_REQUIRED" ? "请先配置模型 API Key。" : code === "UPLOAD_LIMIT_EXCEEDED" ? "上传内容超过大小限制。" : "本地项目清单或文件路径无效。";
      return reply.code(status).send(apiError(code, message));
    }
  });

  app.get<{ Params: { jobId: string } }>("/api/jobs/:jobId", async (request, reply) => {
    const job = await db.analysisJob.findUnique({ where: { id: request.params.jobId } });
    if (!job) return reply.code(404).send(apiError("JOB_NOT_FOUND", "找不到该分析任务。"));
    return { jobId: job.id, projectId: job.projectId, status: job.status, stage: job.stage, progress: job.progress, storyReady: job.status === "completed", error: job.errorCode ? { code: job.errorCode, message: job.errorMessage, retryable: ["LLM_RESPONSE_INVALID", "UPSTREAM_RATE_LIMIT", "UPSTREAM_TIMEOUT"].includes(job.errorCode) } : null, createdAt: job.createdAt.toISOString(), updatedAt: job.updatedAt.toISOString() };
  });

  app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/story", async (request, reply) => {
    const project = await db.project.findUnique({ where: { id: request.params.projectId } });
    if (!project) return reply.code(404).send(apiError("PROJECT_NOT_FOUND", "找不到该项目。"));
    const story = await db.story.findFirst({ where: { projectId: project.id }, orderBy: { createdAt: "desc" } });
    if (!story) return reply.code(409).send(apiError("STORY_NOT_READY", "Story 尚未生成完成。", true));
    const validated = runtimeProjectSchema.safeParse(story.content);
    if (!validated.success) return reply.code(500).send(apiError("STORY_INVALID", "生成的 Story 数据不完整。"));
    return validated.data;
  });

  if (staticRoot) {
    await app.register(fastifyStatic, { root: staticRoot, prefix: "/", wildcard: false });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) return reply.code(404).send(apiError("NOT_FOUND", "找不到该 API。"));
      return reply.sendFile("index.html");
    });
  }
  return app;
}
