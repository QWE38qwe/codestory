import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function isSafeTarget(value) {
  try {
    const url = new URL(String(value || ""));
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    if (host === "localhost" || host === "127.0.0.1" || host === "::1") return false;
    if (/^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host)) return false;
    const match172 = host.match(/^172\.(\d+)\./);
    if (match172 && Number(match172[1]) >= 16 && Number(match172[1]) <= 31) return false;
    return true;
  } catch {
    return false;
  }
}

function proxyPlugin() {
  return {
    name: "codestory-llm-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__codestory/llm/")) return next();
        if (req.method !== "POST") {
          res.statusCode = 405;
          res.end(JSON.stringify({ message: "Only POST is allowed" }));
          return;
        }

        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const target = req.headers["x-codestory-target"];
            if (!target || !isSafeTarget(target)) {
              res.statusCode = 400;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ message: "模型目标地址必须是公网 HTTPS 地址。" }));
              return;
            }

            const headers = { "Content-Type": "application/json" };
            if (req.headers.authorization) headers.Authorization = req.headers.authorization;
            if (req.headers["x-api-key"]) headers["x-api-key"] = req.headers["x-api-key"];
            if (req.headers["anthropic-version"]) headers["anthropic-version"] = req.headers["anthropic-version"];

            const response = await fetch(target, {
              method: "POST",
              headers,
              body: Buffer.concat(chunks),
              redirect: "error",
            });
            const text = await response.text();
            res.statusCode = response.status;
            res.setHeader("Content-Type", "application/json");
            res.end(text);
          } catch (error) {
            res.statusCode = 500;
            res.setHeader("Content-Type", "application/json");
            res.end(JSON.stringify({ message: error.message || "代理失败" }));
          }
        });
      });
    },
  };
}

export default defineConfig({
  base: "/codestory/",
  plugins: [react(), proxyPlugin()],
});
