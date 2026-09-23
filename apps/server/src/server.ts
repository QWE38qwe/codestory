import "dotenv/config";
import { existsSync } from "node:fs";
import { readdir, rm, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { prisma } from "./db/prisma.js";
import { JobRunner } from "./worker/job-runner.js";

const config = loadConfig();
const webDist = resolve(fileURLToPath(new URL("../../web/dist", import.meta.url)));
const app = await buildApp({ db: prisma, config, staticRoot: existsSync(webDist) ? webDist : undefined });
const runner = new JobRunner(prisma, config);

async function sweepWorkspaces(): Promise<void> {
  const root = config.workspacesDir;
  await import("node:fs/promises").then(({ mkdir }) => mkdir(root, { recursive: true }));
  const active = new Set((await prisma.analysisJob.findMany({ where: { status: { in: ["queued", "running"] }, sourcePath: { not: null } }, select: { sourcePath: true } })).map((job) => job.sourcePath));
  for (const entry of await readdir(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const path = resolve(root, entry.name);
    if (active.has(path)) continue;
    const info = await stat(path).catch(() => null);
    if (info && Date.now() - info.mtimeMs > 24 * 60 * 60 * 1000) await rm(path, { recursive: true, force: true });
  }
}

await prisma.$connect();
await sweepWorkspaces();
await app.listen({ host: config.host, port: config.port });
await runner.start();
app.log.info({ host: config.host, port: config.port }, "CodeStory server ready");

async function shutdown(): Promise<void> {
  runner.stop();
  await app.close();
  await prisma.$disconnect();
}
process.once("SIGINT", () => void shutdown());
process.once("SIGTERM", () => void shutdown());
