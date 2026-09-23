import { buildDigest, estimateTokens } from "./buildDigest.js";
import { buildStructuralIndex } from "./buildStructuralIndex.js";
import { completeJson } from "./callLlm.js";
import { fetchGithubRepo } from "./fetchGithubRepo.js";
import { parseGithubUrl } from "./parseGithubUrl.js";
import { featurePrompt, storyPrompt } from "./prompt.js";
import { toRuntimeProject } from "./projectAdapter.js";
import { validateGeneratedStory } from "./validateGenerated.js";

export async function scanRepository({ sourceType, githubUrl, branch, subdir, files, languages, githubToken }, onProgress) {
  onProgress?.("1/4 读取文件");
  const repo = sourceType === "local"
    ? files
    : await fetchGithubRepo({
      url: parseGithubUrl(githubUrl),
      branch,
      subdir,
      token: githubToken,
      languages,
    }, onProgress);

  onProgress?.("2/4 建立结构索引");
  const digest = buildDigest(repo);
  const structuralIndex = buildStructuralIndex(repo);
  return {
    repo,
    digest,
    structuralIndex,
    tokenEstimate: estimateTokens(digest.chars + structuralIndex.text.length),
  };
}

export async function discoverFeatures({ repo, digest, structuralIndex, settings, maxFeatures = 3 }, onProgress) {
  onProgress?.("3/4 AI 识别核心功能");
  const featureDraft = await completeJson({
    settings,
    messages: featurePrompt({ repo, digest, structuralIndex, maxFeatures }),
  });
  const features = selectEvidencedFeatures(featureDraft.features || [], repo.files, maxFeatures);
  if (!features.length) throw new Error("NO_EVIDENCED_FEATURES");
  return { featureDraft, features };
}

export function selectEvidencedFeatures(drafts, files, maxFeatures = 3) {
  const existing = new Set(files.map((file) => file.path));
  return drafts
    .map((feature, index) => ({ ...feature, _index: index, evidenceFiles: Array.isArray(feature.evidenceFiles) ? feature.evidenceFiles.filter((path) => existing.has(path)) : [] }))
    .filter((feature) => feature.evidenceFiles.length)
    .sort((a, b) => b.evidenceFiles.length - a.evidenceFiles.length || confidenceScore(b.confidence) - confidenceScore(a.confidence) || a._index - b._index)
    .slice(0, maxFeatures)
    .map(({ _index, ...feature }) => feature);
}

function confidenceScore(value) {
  return value === "high" ? 3 : value === "medium" ? 2 : value === "low" ? 1 : 0;
}

export async function generateStories({ repo, digest, structuralIndex, settings, features, featureDraft, maxSteps = 7 }, onProgress) {
  onProgress?.("4/4 生成实现 Story");
  const storyDraft = await completeJson({
    settings,
    messages: storyPrompt({ repo, digest, structuralIndex, features, maxSteps }),
  });

  const validated = validateGeneratedStory(repo, storyDraft);
  if (!validated.actions.length) throw new Error("没有生成可验证的 Story。请换一个功能或缩小目录后重试。");

  return {
    project: toRuntimeProject({ repo, featureDraft, validated }),
    validated,
  };
}
