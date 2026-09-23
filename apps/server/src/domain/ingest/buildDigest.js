import { CODE_EXTENSIONS, extensionOf } from "./filterFiles.js";

const MAX_DIGEST_CHARS = 80000;
const MAX_FILE_CHARS = 8000;

function scoreFile(file) {
  let score = 0;
  if (file.role === "entry") score += 80;
  if (file.role === "doc") score += 70;
  if (file.role === "config") score += 60;
  if (CODE_EXTENSIONS.has(extensionOf(file.path))) score += 20;
  if (/(route|auth|login|order|upload|api|service|handler|controller)/i.test(file.path)) score += 25;
  score += Math.min(20, Math.floor((file.content.match(/export |function |def |class /g) || []).length));
  return score;
}

function clip(content, limit = MAX_FILE_CHARS) {
  if (content.length <= limit) return content;
  return `${content.slice(0, limit)}\n\n/* ... truncated ... */`;
}

export function buildDigest(repo) {
  const ranked = [...repo.files].sort((a, b) => scoreFile(b) - scoreFile(a));
  const selected = [];
  let used = 0;

  for (const file of ranked) {
    const chunk = clip(file.content);
    if (used + chunk.length > MAX_DIGEST_CHARS && selected.length >= 8) break;
    selected.push({ ...file, excerpt: chunk });
    used += chunk.length;
  }

  const text = selected
    .map((file) => `=== ${file.path} ===\n${file.excerpt}`)
    .join("\n\n");

  const folders = {};
  for (const file of repo.files) {
    const folder = file.path.includes("/") ? file.path.split("/").slice(0, -1).join("/") : ".";
    folders[folder] = (folders[folder] || 0) + 1;
  }

  return {
    text,
    chars: text.length,
    fileCount: selected.length,
    folders: Object.entries(folders)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([path, count]) => ({ path, count })),
    entries: repo.files.filter((file) => file.role === "entry").map((file) => file.path),
    docs: repo.files.filter((file) => file.role === "doc").map((file) => file.path),
  };
}

export function estimateTokens(chars) {
  return Math.max(1, Math.round(chars / 4));
}
