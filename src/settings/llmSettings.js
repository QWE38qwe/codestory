const STORAGE_KEY = "codestory:llm";

export const PROVIDERS = [
  {
    id: "openrouter",
    label: "OpenRouter",
    defaultBaseUrl: "https://openrouter.ai/api/v1",
    defaultModel: "anthropic/claude-sonnet-4",
    kind: "openai",
  },
  {
    id: "openai",
    label: "OpenAI",
    defaultBaseUrl: "https://api.openai.com/v1",
    defaultModel: "gpt-4.1-mini",
    kind: "openai",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    defaultBaseUrl: "https://api.anthropic.com",
    defaultModel: "claude-sonnet-4-20250514",
    kind: "anthropic",
  },
  {
    id: "custom",
    label: "自定义 OpenAI 兼容接口",
    defaultBaseUrl: "https://api.example.com/v1",
    defaultModel: "gpt-4o-mini",
    kind: "openai",
  },
];

const fallback = {
  provider: "openrouter",
  baseUrl: PROVIDERS[0].defaultBaseUrl,
  model: PROVIDERS[0].defaultModel,
  apiKey: "",
  githubToken: "",
};

export function loadLlmSettings() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...fallback };
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return { ...fallback };
  }
}

export function saveLlmSettings(settings) {
  const next = {
    provider: settings.provider || fallback.provider,
    baseUrl: (settings.baseUrl || "").trim().replace(/\/$/, ""),
    model: (settings.model || "").trim(),
    apiKey: (settings.apiKey || "").trim(),
    githubToken: (settings.githubToken || "").trim(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

export function maskSecret(value) {
  if (!value) return "未填写";
  if (value.length <= 4) return "••••";
  return `••••${value.slice(-4)}`;
}

export function getProvider(id) {
  return PROVIDERS.find((item) => item.id === id) || PROVIDERS[0];
}

export function hasApiKey(settings = loadLlmSettings()) {
  return Boolean(settings.apiKey);
}
