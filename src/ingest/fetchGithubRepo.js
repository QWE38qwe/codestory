import {
  guessRole,
  isOversized,
  isSupportedSource,
  languageOf,
  normalizePath,
  shouldIgnorePath,
} from "./filterFiles";

function headers(token) {
  return {
    Accept: "application/vnd.github+json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function githubJson(url, token) {
  const response = await fetch(url, { headers: headers(token) });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    const message = payload.message || `HTTP ${response.status}`;
    if (response.status === 404) throw new Error("仓库不存在、无访问权限，或 Token 没有该私有仓的只读权限。");
    if (response.status === 403) throw new Error(`GitHub 拒绝访问：${message}`);
    throw new Error(`GitHub 读取失败：${message}`);
  }
  return response.json();
}

function decodeBase64Utf8(value = "") {
  const binary = atob(value.replace(/\n/g, ""));
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
}

function candidateScore(item) {
  const role = guessRole(item.path);
  let score = role === "entry" ? 100 : role === "config" ? 80 : role === "doc" ? 70 : 20;
  if (/(route|api|service|controller|handler|auth|login|upload|search|chat|agent)/i.test(item.path)) score += 30;
  return score;
}

export async function fetchGithubRepo({ url, branch, subdir, token, languages }, onProgress) {
  const { owner, repo, ref: urlRef, subdir: urlSubdir } = url;
  const metadata = await githubJson(`https://api.github.com/repos/${owner}/${repo}`, token);
  const ref = branch?.trim() || urlRef || metadata.default_branch;
  const root = normalizePath(subdir || urlSubdir || "");
  const tree = await githubJson(
    `https://api.github.com/repos/${owner}/${repo}/git/trees/${encodeURIComponent(ref)}?recursive=1`,
    token,
  );

  if (tree.truncated) throw new Error("GitHub 返回的仓库树被截断。请指定更小的子目录后重试。");

  const blobs = (tree.tree || [])
    .filter((item) => item.type === "blob")
    .filter((item) => !root || normalizePath(item.path).startsWith(`${root}/`) || normalizePath(item.path) === root)
    .map((item) => ({ ...item, path: root ? normalizePath(item.path).slice(root.length).replace(/^\//, "") : normalizePath(item.path) }))
    .filter((item) => item.path)
    .filter((item) => !shouldIgnorePath(item.path))
    .filter((item) => isSupportedSource(item.path, languages))
    .filter((item) => !isOversized(item.size))
    .sort((a, b) => candidateScore(b) - candidateScore(a));

  if (!blobs.length) throw new Error("过滤后没有可分析的 JS / TS / Python 源码。");

  const loadLimit = Math.min(blobs.length, 90);
  const files = [];
  for (let index = 0; index < loadLimit; index += 1) {
    const item = blobs[index];
    onProgress?.(`正在读取 ${item.path}（${index + 1}/${loadLimit}）`);
    const blob = await githubJson(`https://api.github.com/repos/${owner}/${repo}/git/blobs/${item.sha}`, token);
    if (blob.encoding !== "base64") continue;
    const content = decodeBase64Utf8(blob.content);
    if (!content.trim()) continue;
    files.push({ path: item.path, language: languageOf(item.path), bytes: item.size || content.length, content, role: guessRole(item.path), sha: item.sha });
  }

  return {
    name: repo,
    origin: `https://github.com/${owner}/${repo}`,
    originKind: "github",
    owner,
    repo,
    ref,
    commit: tree.sha || ref,
    description: metadata.description || "",
    files,
    stats: {
      scanned: blobs.length,
      loaded: files.length,
      ignored: Math.max(0, (tree.tree || []).length - blobs.length),
      truncated: blobs.length > loadLimit,
    },
  };
}
