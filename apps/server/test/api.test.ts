import test from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "../src/app.js";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const config = { port: 3000, host: "127.0.0.1", workspacesDir: "C:/temporary/workspaces", credentialKey: Buffer.alloc(32, 1), allowedOrigins: [] };
function fakeDb() {
  return {
    llmCredential: { findUnique: async () => null, deleteMany: async () => ({ count: 0 }) },
    analysisJob: { findUnique: async () => null },
    project: { findUnique: async () => null },
    story: { findFirst: async () => null },
  };
}

test("health and settings endpoints remain usable without a configured model", async () => {
  const app = await buildApp({ db: fakeDb() as never, config });
  try {
    const health = await app.inject({ method: "GET", url: "/api/health" });
    assert.equal(health.statusCode, 200);
    assert.deepEqual(health.json(), { status: "ok" });
    const settings = await app.inject({ method: "GET", url: "/api/settings/llm" });
    assert.equal(settings.statusCode, 200);
    assert.equal(settings.json().configured, false);
    assert.equal(JSON.stringify(settings.json()).includes("ciphertext"), false);
  } finally { await app.close(); }
});

test("invalid GitHub hosts and unknown jobs return stable API errors", async () => {
  const app = await buildApp({ db: fakeDb() as never, config });
  try {
    const repository = await app.inject({ method: "POST", url: "/api/projects/analyze/github", payload: { repoUrl: "https://github.com.evil.invalid/acme/app" } });
    assert.equal(repository.statusCode, 400);
    assert.equal(repository.json().error.code, "INVALID_REPOSITORY");
    const job = await app.inject({ method: "GET", url: "/api/jobs/missing" });
    assert.equal(job.statusCode, 404);
    assert.equal(job.json().error.code, "JOB_NOT_FOUND");
  } finally { await app.close(); }
});

function multipartPayload(metadata: unknown, files: Array<{ index: number; content: string }> = []) {
  const boundary = "codestory-test-boundary";
  const chunks = [
    `--${boundary}\r\nContent-Disposition: form-data; name="metadata"\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(metadata)}\r\n`,
    ...files.map(({ index, content }) => `--${boundary}\r\nContent-Disposition: form-data; name="files"; filename="${index}"\r\nContent-Type: application/octet-stream\r\n\r\n${content}\r\n`),
    `--${boundary}--\r\n`,
  ];
  return { boundary, body: chunks.join("") };
}

test("local multipart uploads stream into an isolated workspace and reject traversal", async () => {
  const root = await mkdtemp(join(tmpdir(), "codestory-upload-"));
  let creates = 0;
  const db = {
    ...fakeDb(),
    llmCredential: { findUnique: async () => ({ id: "default" }) },
    project: { create: async ({ data }: any) => { creates += 1; return { id: "project-1", jobs: [{ id: data.jobs.create.id, status: "queued" }] }; } },
  };
  const app = await buildApp({ db: db as never, config: { ...config, workspacesDir: root } });
  try {
    const valid = multipartPayload({ projectName: "sample", files: [{ index: 0, path: "src/app.ts" }] }, [{ index: 0, content: "export function run() { return true; }" }]);
    const accepted = await app.inject({ method: "POST", url: "/api/projects/analyze/local", headers: { "content-type": `multipart/form-data; boundary=${valid.boundary}` }, payload: valid.body });
    assert.equal(accepted.statusCode, 202, accepted.body);
    const body = accepted.json();
    assert.equal(await readFile(join(root, body.jobId, "source", "src", "app.ts"), "utf8"), "export function run() { return true; }");
    const invalid = multipartPayload({ projectName: "bad", files: [{ index: 0, path: "../escape.ts" }] });
    const rejected = await app.inject({ method: "POST", url: "/api/projects/analyze/local", headers: { "content-type": `multipart/form-data; boundary=${invalid.boundary}` }, payload: invalid.body });
    assert.equal(rejected.statusCode, 400);
    assert.equal(creates, 1);
    assert.equal((await readdir(root)).length, 1);
  } finally { await app.close(); await rm(root, { recursive: true, force: true }); }
});
