import { buildDigest, estimateTokens } from "./buildDigest";
import { buildStructuralIndex } from "./buildStructuralIndex";
import { completeJson } from "./callLlm";
import { fetchGithubRepo } from "./fetchGithubRepo";
import { parseGithubUrl } from "./parseGithubUrl";
import { featurePrompt, storyPrompt } from "./prompt";
import { toRuntimeProject } from "./projectAdapter";
import { readLocalFolder } from "./readLocalFolder";
import { validateGeneratedStory } from "./validateGenerated";

export async function scanRepository({ sourceType, githubUrl, branch, subdir, files, languages, githubToken }, onProgress) {
  onProgress?.("1/4 读取文件");
  const repo = sourceType === "local"
    ? await readLocalFolder(files, languages, onProgress)
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

export async function discoverFeatures({ repo, digest, structuralIndex, settings, maxFeatures = 6 }, onProgress) {
  onProgress?.("3/4 AI 识别核心功能");
  const featureDraft = await completeJson({
    settings,
    messages: featurePrompt({ repo, digest, structuralIndex, maxFeatures }),
  });
  const features = (featureDraft.features || []).slice(0, maxFeatures);
  if (!features.length) throw new Error("模型没有识别出可讲解的核心功能。可以换模型或缩小分析目录。");
  return { featureDraft, features };
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
