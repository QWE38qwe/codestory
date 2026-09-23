import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";

const edgePath = join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe");
const chromePath = join(process.env.ProgramFiles || "C:/Program Files", "Google/Chrome/Application/chrome.exe");
const installedBrowser = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || [edgePath, chromePath].find(existsSync);

export default defineConfig({
  testDir: "./e2e",
  use: { baseURL: "http://127.0.0.1:5173", browserName: "chromium", launchOptions: installedBrowser ? { executablePath: installedBrowser } : {} },
  webServer: { command: "npm run dev --workspace @codestory/web -- --host 127.0.0.1 --port 5173 --strictPort", url: "http://127.0.0.1:5173", reuseExistingServer: !process.env.CI, timeout: 30_000 },
});
