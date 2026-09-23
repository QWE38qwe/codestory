const IGNORED_DIR_PARTS = [
  "/.git/",
  "/node_modules/",
  "/dist/",
  "/build/",
  "/coverage/",
  "/.next/",
  "/out/",
  "/.vite/",
  "/.cache/",
  "/vendor/",
  "/__pycache__/",
  "/.idea/",
  "/.vscode/",
];

const IGNORED_NAMES = new Set([
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "bun.lock",
  "bun.lockb",
  ".ds_store",
  ".env",
  ".env.local",
]);

const IGNORED_EXTENSIONS = new Set([
  "png", "jpg", "jpeg", "gif", "webp", "ico", "svg", "bmp",
  "mp4", "mov", "webm", "mp3", "wav",
  "pdf", "zip", "gz", "tgz", "woff", "woff2", "ttf", "otf",
  "wasm", "map", "lock",
]);

export const SOURCE_EXTENSIONS = {
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  ts: "typescript",
  tsx: "typescript",
  py: "python",
  md: "markdown",
  json: "json",
};

export const CODE_EXTENSIONS = new Set(["js", "jsx", "mjs", "cjs", "ts", "tsx", "py"]);

const MAX_FILE_BYTES = 200 * 1024;

export function normalizePath(path = "") {
  return path.replaceAll("\\", "/").replace(/^\.\//, "").replace(/^\/+/, "");
}

export function extensionOf(path) {
  const name = normalizePath(path).split("/").pop() || "";
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

export function shouldIgnorePath(path) {
  const normalized = `/${normalizePath(path).toLowerCase()}/`;
  if (IGNORED_DIR_PARTS.some((part) => normalized.includes(part))) return true;
  const name = normalizePath(path).split("/").pop()?.toLowerCase() || "";
  if (IGNORED_NAMES.has(name)) return true;
  if (name.endsWith(".min.js") || name.endsWith(".min.css")) return true;
  const ext = extensionOf(path);
  return IGNORED_EXTENSIONS.has(ext);
}

export function isSupportedSource(path, languages = { js: true, python: true }) {
  const ext = extensionOf(path);
  if (ext === "md" || ext === "json") return true;
  if ((ext === "js" || ext === "jsx" || ext === "mjs" || ext === "cjs" || ext === "ts" || ext === "tsx") && languages.js) {
    return true;
  }
  if (ext === "py" && languages.python) return true;
  return false;
}

export function languageOf(path) {
  return SOURCE_EXTENSIONS[extensionOf(path)] || "text";
}

export function isOversized(bytes) {
  return Number(bytes || 0) > MAX_FILE_BYTES;
}

export function guessRole(path) {
  const normalized = normalizePath(path).toLowerCase();
  const name = normalized.split("/").pop() || "";
  if (name.startsWith("readme")) return "doc";
  if (name === "package.json" || name === "pyproject.toml") return "config";
  if (/(^|\/)(main|index|app|server|cli)(\.|$)/.test(normalized)) return "entry";
  return "source";
}
