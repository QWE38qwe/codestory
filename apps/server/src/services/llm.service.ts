import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

function isPrivateAddress(address: string): boolean {
  if (address.includes(":")) {
    const normalized = address.toLowerCase();
    return normalized === "::1" || normalized === "::" || normalized.startsWith("fc") || normalized.startsWith("fd") || normalized.startsWith("fe8") || normalized.startsWith("fe9") || normalized.startsWith("fea") || normalized.startsWith("feb") || normalized.startsWith("ff") || normalized.startsWith("::ffff:");
  }
  const parts = address.split(".").map(Number);
  const first = parts[0] ?? 255;
  const second = parts[1] ?? 0;
  const third = parts[2] ?? 0;
  return first === 0 || first === 10 || first === 127 || first >= 224 || (first === 100 && second >= 64 && second <= 127) || (first === 169 && second === 254) || (first === 172 && second >= 16 && second <= 31) || (first === 192 && (second === 168 || second === 0 && third === 0 || second === 0 && third === 2)) || (first === 198 && (second === 18 || second === 19 || second === 51 && third === 100)) || (first === 203 && second === 0 && third === 113);
}

export async function validatePublicEndpoint(baseUrl: string, allowedOrigins: string[] = []): Promise<URL> {
  let url: URL;
  try { url = new URL(baseUrl); } catch { throw new Error("模型地址格式无效。"); }
  if (url.protocol !== "https:" || url.username || url.password || url.port && url.port !== "443") throw new Error("模型地址必须是公网 HTTPS 地址。");
  if (allowedOrigins.length && !allowedOrigins.includes(url.origin)) throw new Error("模型地址不在允许列表中。");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(host)) {
    if (isPrivateAddress(host)) throw new Error("模型地址不能指向本机或私有网络。");
  } else {
    const addresses = await lookup(host, { all: true, verbatim: true });
    if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) throw new Error("模型地址解析到不可访问的网络。");
  }
  return url;
}

export async function chatCompletion(input: { baseUrl: string; model: string; apiKey: string; messages: Array<{ role: string; content: string }> }, allowedOrigins: string[] = [], signal?: AbortSignal): Promise<string> {
  const url = await validatePublicEndpoint(input.baseUrl, allowedOrigins);
  let response: Response;
  try {
    response = await fetch(new URL(`${url.pathname.replace(/\/$/, "")}/chat/completions`, url.origin), {
      method: "POST", redirect: "error", signal,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${input.apiKey}` },
      body: JSON.stringify({ model: input.model, temperature: 0.2, messages: input.messages }),
    });
  } catch {
    throw Object.assign(new Error("模型服务连接失败或请求超时。"), { retryable: true });
  }
  if (!response.ok) {
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable) throw Object.assign(new Error(`模型服务暂时不可用（HTTP ${response.status}）。`), { retryable: true });
    throw new Error(`模型请求失败（HTTP ${response.status}）。`);
  }
  let payload: { choices?: Array<{ message?: { content?: string } }> };
  try {
    payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
  } catch (error) {
    if (error instanceof Error && /abort|timeout/i.test(`${error.name} ${error.message}`)) {
      throw Object.assign(new Error("模型服务响应超时。"), { retryable: true });
    }
    throw new Error("模型服务响应格式无效。");
  }
  return payload.choices?.[0]?.message?.content || "";
}

export async function testCompletion(input: { baseUrl: string; model: string; apiKey: string }, allowedOrigins: string[] = []): Promise<void> {
  let content = "";
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      content = await chatCompletion({ ...input, messages: [{ role: "system", content: "Return strict JSON only." }, { role: "user", content: "Reply with {\"ok\":true}." }] }, allowedOrigins, AbortSignal.timeout(15_000));
      break;
    } catch (error) {
      if (attempt || !(error as Error & { retryable?: boolean }).retryable) throw error;
    }
  }
  if (!content.includes('"ok"')) throw new Error("模型连接测试没有返回预期结果。");
}
