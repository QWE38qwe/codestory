import { getProvider } from "../settings/llmSettings";

function joinUrl(base, path) {
  return `${base.replace(/\/$/, "")}${path}`;
}

function extractJson(text) {
  if (!text) throw new Error("模型没有返回内容。");
  const fenced = text.match(/```json\s*([\s\S]*?)```/i);
  const raw = (fenced ? fenced[1] : text).trim();
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("模型返回的不是 JSON，请换模型或重试。");
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch {
    throw new Error("模型返回的 JSON 解析失败，请重试。");
  }
}

async function request(url, options) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = payload.error?.message || payload.message || `HTTP ${response.status}`;
    throw new Error(`模型请求失败：${detail}`);
  }
  return payload;
}

async function chatOpenAI({ baseUrl, model, apiKey, messages }) {
  const proxyUrl = "/__codestory/llm/openai";
  const urls = [proxyUrl, joinUrl(baseUrl, "/chat/completions")];
  let lastError;
  for (const url of urls) {
    try {
      const payload = await request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-CodeStory-Target": joinUrl(baseUrl, "/chat/completions"),
        },
        body: JSON.stringify({ model, temperature: 0.2, messages }),
      });
      return payload.choices?.[0]?.message?.content || "";
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

async function chatAnthropic({ baseUrl, model, apiKey, messages }) {
  const system = messages.filter((item) => item.role === "system").map((item) => item.content).join("\n");
  const userMessages = messages.filter((item) => item.role !== "system");
  const proxyUrl = "/__codestory/llm/anthropic";
  const urls = [proxyUrl, joinUrl(baseUrl, "/v1/messages")];
  let lastError;
  for (const url of urls) {
    try {
      const payload = await request(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
          "X-CodeStory-Target": joinUrl(baseUrl, "/v1/messages"),
        },
        body: JSON.stringify({ model, max_tokens: 4000, temperature: 0.2, system, messages: userMessages }),
      });
      return payload.content?.map((item) => item.text || "").join("\n") || "";
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
}

export async function completeJson({ settings, messages }) {
  if (!settings?.apiKey) throw new Error("先在右上角设置里填 API Key。");
  const provider = getProvider(settings.provider);
  const content = provider.kind === "anthropic"
    ? await chatAnthropic({ ...settings, messages })
    : await chatOpenAI({ ...settings, messages });
  return extractJson(content);
}

export async function testConnection(settings) {
  const result = await completeJson({
    settings,
    messages: [
      { role: "system", content: "只返回 JSON。" },
      { role: "user", content: "回复 {\"ok\": true}，不要其他文字。" },
    ],
  });
  if (!result?.ok) throw new Error("测连成功但返回内容异常。");
  return true;
}
