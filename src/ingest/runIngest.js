import { buildDigest, estimateTokens } from "./buildDigest";
import { completeJson } from "./callLlm";
import { fetchGithubRepo } from "./fetchGithubRepo";
import { parseGithubUrl } from "./parseGithubUrl";
import { featurePrompt, storyPrompt } from "./prompt";
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

  onProgress?.("2/4 过滤并裁剪");
  const digest = buildDigest(repo);
  return {
    repo,
    digest,
    tokenEstimate: estimateTokens(digest.chars),
  };
}

export async function generateStories({ repo, digest, settings, maxFeatures = 5, maxSteps = 6 }, onProgress) {
  onProgress?.("3/4 调用模型：识别功能");
  const featureDraft = await completeJson({
    settings,
    messages: featurePrompt({ repo, digest, maxFeatures }),
  });
  const features = (featureDraft.features || []).slice(0, maxFeatures);
  if (!features.length) throw new Error("模型没有给出可播放的功能，请换模型或缩小目录后重试。");

  onProgress?.("3/4 调用模型：生成步骤");
  const storyDraft = await completeJson({
    settings,
    messages: storyPrompt({ repo, digest, features, maxSteps }),
  });

  onProgress?.("4/4 核对文件证据");
  const merged = {
    summary: featureDraft.summary,
    tech: featureDraft.tech,
    actions: (storyDraft.actions || []).map((action) => {
      const feature = features.find((item) => item.id === action.id || item.verb === action.verb);
      return {
        ...action,
        id: action.id || feature?.id,
        verb: action.verb || feature?.verb,
      };
    }),
  };
  const validated = validateGeneratedStory(repo, merged);
  if (!validated.actions.length) throw new Error("没能把功能对上真实文件，换子目录或换模型再试。");
  return { features, validated };
}
