export function parseGithubUrl(input) {
  const raw = (input || "").trim();
  if (!raw) throw new Error("请先粘贴 GitHub 链接或 owner/repo。");

  let owner = "";
  let repo = "";
  let ref = "";
  let subdir = "";

  const short = raw.match(/^([\w.-]+)\/([\w.-]+)(?:\/(.*))?$/);
  if (!raw.includes("github.com") && short) {
    owner = short[1];
    repo = short[2].replace(/\.git$/, "");
    if (short[3]) subdir = short[3].replace(/^tree\/[^/]+\//, "");
  } else {
    let url;
    try {
      url = new URL(raw.includes("://") ? raw : `https://${raw}`);
    } catch {
      throw new Error("GitHub 链接格式不对。");
    }
    if (url.hostname.toLowerCase() !== "github.com") {
      throw new Error("目前只支持 github.com 链接。");
    }
    const parts = url.pathname.replace(/^\/+|\/+$/g, "").split("/");
    owner = parts[0] || "";
    repo = (parts[1] || "").replace(/\.git$/, "");
    if (parts[2] === "tree" || parts[2] === "blob") {
      ref = parts[3] || "";
      subdir = parts.slice(parts[2] === "blob" ? 5 : 4).join("/");
    }
  }

  if (!/^[\w.-]+$/.test(owner) || !/^[\w.-]+$/.test(repo)) throw new Error("GitHub owner 或仓库名无效。");
  return { owner, repo, ref, subdir: subdir.replace(/^\/+|\/+$/g, "") };
}
