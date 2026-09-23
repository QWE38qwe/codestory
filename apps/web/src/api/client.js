async function request(path, options = {}) {
  const response = await fetch(path, { ...options, headers: options.body instanceof FormData ? options.headers : { "Content-Type": "application/json", ...options.headers } });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.error?.message || "请求失败，请稍后重试。");
    error.code = payload.error?.code;
    error.retryable = Boolean(payload.error?.retryable);
    throw error;
  }
  return payload;
}

export const getLlmSettings = (signal) => request("/api/settings/llm", { signal });
export const saveLlmSettings = (settings, signal) => request("/api/settings/llm", { method: "PUT", body: JSON.stringify(settings), signal });
export const deleteLlmSettings = (signal) => request("/api/settings/llm", { method: "DELETE", signal });
export const createGithubJob = (payload, signal) => request("/api/projects/analyze/github", { method: "POST", body: JSON.stringify(payload), signal });
export const createLocalJob = (form, signal) => request("/api/projects/analyze/local", { method: "POST", body: form, signal });
export const getJob = (id, signal) => request(`/api/jobs/${encodeURIComponent(id)}`, { signal });
export const getStory = (id, signal) => request(`/api/projects/${encodeURIComponent(id)}/story`, { signal });
