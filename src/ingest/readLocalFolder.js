import {
  guessRole,
  isOversized,
  isSupportedSource,
  languageOf,
  normalizePath,
  shouldIgnorePath,
} from "./filterFiles";

function relativePath(file) {
  return normalizePath(file.webkitRelativePath || file.name);
}

export async function readLocalFolder(fileList, languages, onProgress) {
  const incoming = Array.from(fileList || []);
  if (!incoming.length) throw new Error("没有选到文件夹。");

  const rootName = relativePath(incoming[0]).split("/")[0] || "local-project";
  const candidates = incoming.filter((file) => {
    const path = relativePath(file);
    return !shouldIgnorePath(path) && isSupportedSource(path, languages) && !isOversized(file.size);
  });

  if (!candidates.length) {
    throw new Error("过滤后没有 js/ts/py 源码，换一个目录。");
  }

  if (candidates.length > 400) {
    throw new Error(`源码文件太多（${candidates.length}）。请改选更小的子目录。`);
  }

  const files = [];
  const limit = Math.min(candidates.length, 80);
  for (let index = 0; index < limit; index += 1) {
    const file = candidates[index];
    const path = relativePath(file).replace(new RegExp(`^${rootName}/`), "");
    onProgress?.(`正在读取 ${path}（${index + 1}/${limit}）`);
    const content = await file.text();
    if (!content.trim()) continue;
    files.push({
      path,
      language: languageOf(path),
      bytes: file.size,
      content,
      role: guessRole(path),
    });
  }

  return {
    name: rootName,
    origin: `local:${rootName}`,
    originKind: "local",
    owner: "",
    repo: rootName,
    ref: "local",
    commit: null,
    description: "来自本机文件夹",
    files,
    stats: {
      scanned: candidates.length,
      loaded: files.length,
      ignored: incoming.length - candidates.length,
    },
  };
}
