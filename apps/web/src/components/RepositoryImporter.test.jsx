import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import RepositoryImporter from "./RepositoryImporter";

afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), { status, headers: { "Content-Type": "application/json" } });
}

describe("RepositoryImporter", () => {
  it("sends credentials to the server and opens a completed Story without browser persistence", async () => {
    const calls = [];
    const project = { id: "p1", name: "Demo", category: "GitHub 项目", tech: "TypeScript", source: "repo", description: "demo", accent: "#8be0c4", nodes: [{ id: "n1", label: "start", detail: "start", kind: "logic", position: { x: 0, y: 0 } }], edges: [], actions: [{ id: "a", verb: "demo", meta: "2 steps", steps: [{ nodeId: "n1", edgeId: null, narration: { beginner: "a", product: "a", engineer: "a" } }, { nodeId: "n1", edgeId: null, narration: { beginner: "b", product: "b", engineer: "b" } }] }], implementationDetails: {}, repoMeta: { origin: "repo", commit: null, stats: {}, generatedAt: "now", evidenceSummary: { sourceSteps: 1 } } };
    vi.stubGlobal("fetch", vi.fn(async (url, options = {}) => {
      calls.push([url, options]);
      if (url === "/api/settings/llm" && !options.method) return jsonResponse({ configured: false, baseUrl: "https://api.openai.com/v1", model: "gpt-test", maskedKey: "" });
      if (url === "/api/settings/llm" && options.method === "PUT") return jsonResponse({ configured: true, baseUrl: "https://api.openai.com/v1", model: "gpt-test", maskedKey: "••••1234" });
      if (url === "/api/projects/analyze/github") return jsonResponse({ jobId: "j1", projectId: "p1", status: "queued" }, 202);
      if (url === "/api/jobs/j1") return jsonResponse({ jobId: "j1", projectId: "p1", status: "completed", stage: "completed", progress: 100, storyReady: true });
      if (url === "/api/projects/p1/story") return jsonResponse(project);
      throw new Error(`Unexpected request: ${url}`);
    }));
    const onProjectReady = vi.fn();
    const onClose = vi.fn();
    render(<RepositoryImporter open onClose={onClose} onProjectReady={onProjectReady} />);
    fireEvent.change(await screen.findByLabelText("GitHub 仓库"), { target: { value: "https://github.com/acme/demo" } });
    fireEvent.change(screen.getByLabelText("API Key"), { target: { value: "secret-1234" } });
    fireEvent.click(screen.getByRole("button", { name: "自动分析并生成 Story" }));
    await waitFor(() => expect(onProjectReady).toHaveBeenCalledWith(project), { timeout: 5000 });
    const credentialRequest = calls.find(([url, options]) => url === "/api/settings/llm" && options.method === "PUT");
    expect(credentialRequest[1].body).toContain("secret-1234");
    expect(calls.filter(([url]) => url !== "/api/settings/llm").some(([, options]) => options.body?.includes("secret-1234"))).toBe(false);
    expect(localStorage.length).toBe(0);
    expect(onClose).toHaveBeenCalled();
  });
});
