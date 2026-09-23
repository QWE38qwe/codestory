import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { encryptSecret, decryptSecret } from "../src/services/credential.service.js";
import { safeRelativePath } from "../src/services/workspace.service.js";
import { selectEvidencedFeatures } from "../src/domain/ingest/runIngest.js";
import { parseGithubUrl } from "../src/domain/ingest/parseGithubUrl.js";
import { fetchGithubRepo } from "../src/domain/ingest/fetchGithubRepo.js";
import { validateGeneratedStory } from "../src/domain/ingest/validateGenerated.js";
import { validatePublicEndpoint } from "../src/services/llm.service.js";
import { completeJson } from "../src/domain/ingest/callLlm.js";

const execFileAsync = promisify(execFile);

test("credential encryption uses authenticated ciphertext", () => {
  const key = Buffer.alloc(32, 7);
  const encrypted = encryptSecret("example-secret", key);
  assert.equal(decryptSecret(encrypted, key), "example-secret");
  assert.notEqual(encrypted.ciphertext, "example-secret");
  assert.throws(() => decryptSecret(encrypted, Buffer.alloc(32, 8)));
});

test("local paths reject traversal and normalize separators", () => {
  assert.equal(safeRelativePath("src\\main.ts"), "src/main.ts");
  assert.throws(() => safeRelativePath("../secret.ts"));
  assert.throws(() => safeRelativePath("C:/secret.ts"));
  assert.throws(() => safeRelativePath("/absolute.ts"));
});

test("GitHub parser accepts only github.com origins", () => {
  assert.deepEqual(parseGithubUrl("https://github.com/acme/demo"), { owner: "acme", repo: "demo", ref: "", subdir: "" });
  assert.throws(() => parseGithubUrl("https://github.com.attacker.example/acme/demo"));
});

test("feature selection requires repository evidence and is stable, capped at three", () => {
  const files = [{ path: "src/a.ts" }, { path: "src/b.ts" }, { path: "README.md" }];
  const drafts = [
    { id: "nope", evidenceFiles: ["missing.ts"], confidence: "high" },
    { id: "one", evidenceFiles: ["src/a.ts"], confidence: "low" },
    { id: "two", evidenceFiles: ["src/a.ts", "src/b.ts"], confidence: "low" },
    { id: "three", evidenceFiles: ["README.md"], confidence: "high" },
    { id: "four", evidenceFiles: ["src/a.ts"], confidence: "medium" },
  ];
  assert.deepEqual(selectEvidencedFeatures(drafts, files, 3).map((item) => item.id), ["two", "three", "four"]);
});

test("generated SOURCE snippets are relocated and actions without source are dropped", () => {
  const repo = { files: [{ path: "src/app.ts", content: "export function run() {\n  return true;\n}", language: "typescript" }] };
  const validated = validateGeneratedStory(repo, { actions: [
    { id: "valid", verb: "运行", steps: [{ file: "src/app.ts", symbol: "run", label: "入口" }, { file: null, label: "结束" }] },
    { id: "invalid", verb: "虚构", steps: [{ file: "missing.ts", label: "一步" }, { file: null, label: "两步" }] },
  ] });
  assert.deepEqual(validated.actions.map((item) => item.id), ["valid"]);
  const evidence = Object.values(validated.implementationDetails.valid);
  assert.equal(evidence.filter((item) => item.evidenceType === "SOURCE").length, 1);
  assert.ok(evidence.find((item) => item.evidenceType === "SOURCE")?.snippet.includes("function run"));
});

test("LLM requests require public HTTPS endpoints", async () => {
  await assert.rejects(validatePublicEndpoint("http://example.com/v1"));
  await assert.rejects(validatePublicEndpoint("https://127.0.0.1/v1"));
  await assert.rejects(validatePublicEndpoint("https://10.0.0.1/v1"));
});

test("JSON completion forwards prompt messages to the model request", async () => {
  const originalFetch = globalThis.fetch;
  const messages = [{ role: "user", content: "expected prompt" }];
  let requestBody: { messages?: Array<{ role: string; content: string }> } = {};
  globalThis.fetch = async (_input, init) => {
    requestBody = JSON.parse(String(init?.body));
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  try {
    await completeJson({ settings: { baseUrl: "https://1.1.1.1/v1", model: "demo", apiKey: "test" }, messages });
    assert.deepEqual(requestBody.messages, messages);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("JSON completion retries when the model response body times out", async () => {
  const originalFetch = globalThis.fetch;
  let attempts = 0;
  globalThis.fetch = async () => {
    attempts += 1;
    if (attempts === 1) {
      return { ok: true, status: 200, json: async () => { throw Object.assign(new Error("The operation was aborted due to timeout"), { name: "TimeoutError" }); } } as Response;
    }
    return Response.json({ choices: [{ message: { content: '{"ok":true}' } }] });
  };
  try {
    const result = await completeJson({ settings: { baseUrl: "https://1.1.1.1/v1", model: "demo", apiKey: "test" }, messages: [{ role: "user", content: "prompt" }] });
    assert.deepEqual(result, { ok: true });
    assert.equal(attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("GitHub blob loading is parallel but capped at five requests", async () => {
  const originalFetch = globalThis.fetch;
  let activeBlobs = 0;
  let maximumActiveBlobs = 0;
  const paths = Array.from({ length: 8 }, (_, index) => `src/file-${index}.ts`);
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.endsWith("/repos/acme/demo")) return Response.json({ default_branch: "main", description: "demo" });
    if (url.includes("/commits/")) return Response.json({ sha: "commit-sha" });
    if (url.includes("/git/trees/")) return Response.json({ truncated: false, tree: paths.map((path, index) => ({ type: "blob", path, sha: `sha-${index}`, size: 24 })) });
    if (url.includes("/git/blobs/")) {
      activeBlobs += 1;
      maximumActiveBlobs = Math.max(maximumActiveBlobs, activeBlobs);
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 10));
      activeBlobs -= 1;
      return Response.json({ encoding: "base64", content: Buffer.from("export const value = true;").toString("base64") });
    }
    throw new Error(`Unexpected GitHub request: ${url}`);
  };
  try {
    const repository = await fetchGithubRepo({ url: { owner: "acme", repo: "demo", ref: "", subdir: "" }, branch: "", subdir: "", token: "", languages: { js: true, python: true } });
    assert.equal(repository.files.length, 8);
    assert.equal(repository.commit, "commit-sha");
    assert.equal(maximumActiveBlobs, 5);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("migration runner initializes a fresh SQLite database idempotently", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codestory-migration-"));
  const databasePath = join(temporaryRoot, "codestory.db");
  const testDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(testDir, "..");
  const script = resolve(serverRoot, "scripts", "apply-migrations.mjs");
  const environment = { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}` };
  try {
    await execFileAsync(process.execPath, [script], { cwd: serverRoot, env: environment });
    await execFileAsync(process.execPath, [script], { cwd: serverRoot, env: environment });
    const database = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const migrations = database.prepare('SELECT "migration_name" FROM "_prisma_migrations"').all();
      const stories = database.prepare('SELECT count(*) AS count FROM "Story"').get() as { count: number };
      assert.deepEqual(migrations.map((row) => row.migration_name), ["20260923000000_init"]);
      assert.equal(stories.count, 0);
    } finally {
      database.close();
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("migration runner safely baselines a complete pre-migration schema", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codestory-baseline-"));
  const databasePath = join(temporaryRoot, "codestory.db");
  const testDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(testDir, "..");
  const script = resolve(serverRoot, "scripts", "apply-migrations.mjs");
  const migrationPath = resolve(serverRoot, "prisma", "migrations", "20260923000000_init", "migration.sql");
  const environment = { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}` };
  try {
    const database = new DatabaseSync(databasePath);
    database.exec(await readFile(migrationPath, "utf8"));
    database.close();
    await execFileAsync(process.execPath, [script], { cwd: serverRoot, env: environment });
    const verified = new DatabaseSync(databasePath, { readOnly: true });
    try {
      const migrations = verified.prepare('SELECT "migration_name" FROM "_prisma_migrations"').all();
      assert.deepEqual(migrations.map((row) => row.migration_name), ["20260923000000_init"]);
    } finally {
      verified.close();
    }
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});

test("migration runner refuses to baseline a partial existing schema", async () => {
  const temporaryRoot = await mkdtemp(join(tmpdir(), "codestory-partial-"));
  const databasePath = join(temporaryRoot, "codestory.db");
  const testDir = dirname(fileURLToPath(import.meta.url));
  const serverRoot = resolve(testDir, "..");
  const script = resolve(serverRoot, "scripts", "apply-migrations.mjs");
  const environment = { ...process.env, DATABASE_URL: `file:${databasePath.replaceAll("\\", "/")}` };
  try {
    const database = new DatabaseSync(databasePath);
    database.exec('CREATE TABLE "Project" ("id" TEXT NOT NULL PRIMARY KEY)');
    database.close();
    await assert.rejects(
      execFileAsync(process.execPath, [script], { cwd: serverRoot, env: environment }),
      /refusing to baseline a partial or incompatible database/,
    );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
});
