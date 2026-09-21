import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

function proxyPlugin() {
  return {
    name: "codestory-llm-proxy",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/__codestory/llm/")) return next();
        const chunks = [];
        req.on("data", (chunk) => chunks.push(chunk));
        req.on("end", async () => {
          try {
            const target = req.headers["x-codestory-target"];
            if (!target) {
              res.statusCode = 400;
              res.end(JSON.stringify({ message: "缺少 X-CodeStory-Target" }));
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
            });
            const text = await response.text();
            res.statusCode = response.status;
            res.setHeader("Content-Type", "application/json");
            res.end(text);
          } catch (error) {
            res.statusCode = 500;
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
