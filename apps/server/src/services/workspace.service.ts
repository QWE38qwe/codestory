import { mkdir, readdir, readFile, rm, stat } from "node:fs/promises";
import { extname, join, relative, resolve, sep } from "node:path";
import { guessRole, isSupportedSource, languageOf, normalizePath, shouldIgnorePath, isOversized } from "../domain/ingest/filterFiles.js";

export function safeRelativePath(input: string): string {
  if (!input || input.includes("\0") || input.includes(":") || input.startsWith("/") || input.startsWith("\\")) throw new Error("上传文件路径无效。");
  const normalized = normalizePath(input);
  const segments = normalized.split("/");
  if (segments.some((part) => !part || part === "." || part === "..")) throw new Error("上传文件路径不能逃出项目目录。");
  return normalized;
}

export async function readLocalRepository(sourcePath: string, projectName: string) {
  const root = resolve(sourcePath);
  const files: Array<{ path: string; language: string; bytes: number; content: string; role: string }> = [];
  async function visit(dir: string): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (!shouldIgnorePath(`${relative(root, full).split(sep).join(sep)}/x`)) await visit(full);
      } else if (entry.isFile()) {
        const path = relative(root, full).split(sep).join("/");
        if (shouldIgnorePath(path) || !isSupportedSource(path) ) continue;
        const metadata = await stat(full);
        if (isOversized(metadata.size)) continue;
        const content = await readFile(full, "utf8");
        if (!content.trim()) continue;
        files.push({ path, language: languageOf(path), bytes: metadata.size, content, role: guessRole(path) });
      }
    }
  }
  await visit(root);
  if (!files.length) throw new Error("没有找到可分析的 JS / TS / Python 文件。");
  files.sort((a, b) => a.path.localeCompare(b.path));
  return { name: projectName, origin: `local:${projectName}`, originKind: "local", owner: "", repo: projectName, ref: "local", commit: null, description: "来自本机文件夹", files: files.slice(0, 90), stats: { scanned: files.length, loaded: Math.min(files.length, 90), ignored: 0, truncated: files.length > 90 } };
}

export async function ensureWorkspaceRoot(path: string): Promise<void> { await mkdir(path, { recursive: true }); }
export async function removeWorkspace(path: string): Promise<void> { await rm(path, { recursive: true, force: true }); }
