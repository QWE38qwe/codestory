export function toRuntimeProject({ repo, featureDraft, validated }) {
  const tech = featureDraft.tech || Array.from(new Set(repo.files.map((file) => file.language))).join(" · ");
  return {
    id: `repo-${repo.owner || "local"}-${repo.repo}-${Date.now()}`,
    name: repo.name,
    category: repo.originKind === "github" ? "GitHub 项目" : "本地项目",
    tech,
    source: repo.originKind === "github" ? `${repo.origin} @ ${repo.ref}` : "本地文件夹",
    description: featureDraft.summary || repo.description || "从真实源码生成的 CodeStory。",
    accent: "#8be0c4",
    nodes: validated.nodes,
    edges: validated.edges,
    actions: validated.actions,
    implementationDetails: validated.implementationDetails,
    repoMeta: { origin: repo.origin, commit: repo.commit, stats: repo.stats },
  };
}
