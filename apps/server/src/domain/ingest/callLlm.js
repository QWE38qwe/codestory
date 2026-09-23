import { chatCompletion } from "../../services/llm.service.js";

function extractJson(text) {
  const content = String(text || "").trim();
  const fenced = content.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return JSON.parse(fenced ? fenced[1] : content);
}

export async function completeJson({ settings, messages }) {
  if (!settings?.apiKey) throw new Error("LLM_CREDENTIAL_REQUIRED");
  let content = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      content = await chatCompletion({ ...settings, messages }, settings.allowedOrigins || [], AbortSignal.timeout(120_000));
    } catch (error) {
      if (attempt === 0 && error?.retryable) continue;
      throw error;
    }
    try { return extractJson(content); } catch (error) {
      if (attempt) throw new Error("模型返回内容无法解析为 JSON。");
      messages = [...messages, { role: "assistant", content }, { role: "user", content: "仅修复上一条内容为严格 JSON，不要增加新信息。" }];
    }
  }
  throw new Error("模型返回内容无法解析为 JSON。");
}
