import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(process.cwd(), "../../.env") });

export type AppConfig = {
  port: number;
  host: string;
  workspacesDir: string;
  githubToken?: string;
  credentialKey: Buffer;
  allowedOrigins: string[];
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const encodedKey = env.CODESTORY_CREDENTIAL_KEY;
  if (!encodedKey) throw new Error("CODESTORY_CREDENTIAL_KEY must be a 32-byte base64 value.");
  const credentialKey = Buffer.from(encodedKey, "base64");
  if (credentialKey.length !== 32 || credentialKey.toString("base64") !== encodedKey) {
    throw new Error("CODESTORY_CREDENTIAL_KEY must be a valid 32-byte base64 value.");
  }
  return {
    port: Number(env.PORT || 3000),
    host: env.HOST || "127.0.0.1",
    workspacesDir: resolve(process.cwd(), "../../var/workspaces"),
    githubToken: env.GITHUB_TOKEN?.trim() || undefined,
    credentialKey,
    allowedOrigins: (env.LLM_ALLOWED_ORIGINS || "").split(",").map((item) => item.trim()).filter(Boolean),
  };
}
