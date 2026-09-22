function sanitizeId(value, fallback) {
  const cleaned = String(value || "").toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || fallback;
}

function locateEvidence(file, symbol, hintedLine) {
  if (!file) return null;
  const lines = file.content.split("\n");
  let line = Number(hintedLine);

  if (symbol) {
    const index = lines.findIndex((item) => item.includes(symbol));
    if (index >= 0) line = index + 1;
  }

  if (!Number.isFinite(line) || line < 1 || line > lines.length) return null;
  const start = Math.max(1, line - 3);
  const end = Math.min(lines.length, line + 8);
  return {
    line,
    start,
    end,
    code: lines.slice(start - 1, end).join("\n"),
    language: file.language || "text",
  };
}

function narrationOf(step) {
  const base = step.role || step.process || step.label || "处理这一环节";
  return {
    beginner: step.narration?.beginner || base,
    product: step.narration?.product || base,
    engineer: step.narration?.engineer || base,
  };
}

export function validateGeneratedStory(repo, generated) {
  const byPath = new Map(repo.files.map((file) => [file.path, file]));
  const nodes = [];
  const edges = [];
  const implementationDetails = {};
  const actions = [];

  (generated.actions || []).forEach((rawAction, actionIndex) => {
    const rawSteps = (rawAction.steps || []).slice(0, 8);
    if (rawSteps.length < 2) return;

    const actionId = sanitizeId(rawAction.id || rawAction.verb, `feature-${actionIndex + 1}`);
    const steps = [];
    implementationDetails[actionId] = {};

    rawSteps.forEach((rawStep, stepIndex) => {
      const nodeId = `${actionId}-step-${stepIndex + 1}`;
      const requestedPath = rawStep.file || "";
      const file = byPath.get(requestedPath);
      const evidence = locateEvidence(file, rawStep.symbol, rawStep.line);
      const evidenceType = evidence ? "SOURCE" : requestedPath ? "INFERRED" : "MODEL";

      nodes.push({
        id: nodeId,
        label: rawStep.label || `步骤 ${stepIndex + 1}`,
        detail: rawStep.detail || rawStep.symbol || rawStep.file || "实现步骤",
        kind: rawStep.kind || (stepIndex === 0 ? "person" : "logic"),
        position: { x: 40 + stepIndex * 250, y: 110 + (stepIndex % 2) * 150 },
      });

      const edgeId = stepIndex === 0 ? null : `${actionId}-edge-${stepIndex}`;
      if (edgeId) {
        edges.push({
          id: edgeId,
          source: `${actionId}-step-${stepIndex}`,
          target: nodeId,
        });
      }

      steps.push({ nodeId, edgeId, narration: narrationOf(rawStep) });

      implementationDetails[actionId][nodeId] = {
        layer: rawStep.detail || rawStep.kind || "实现环节",
        role: rawStep.role || "承接上一环节并把结果交给下一环节。",
        input: rawStep.input || "上一环节的输入",
        process: rawStep.process || "执行当前步骤的核心处理",
        output: rawStep.output || "交给下一环节的结果",
        functionName: rawStep.symbol || (evidence ? `L${evidence.line}` : "未确认具体 Symbol"),
        file: evidence ? requestedPath : null,
        lines: evidence ? `${evidence.start}–${evidence.end}` : null,
        evidence: evidenceType === "SOURCE" ? "真实源码" : evidenceType === "INFERRED" ? "源码推断" : "模型解释",
        evidenceType,
        snippet: evidence?.code || rawStep.process || rawStep.role || "当前没有足够源码证据。",
        codeBlock: evidence ? { language: evidence.language, startLine: evidence.start, code: evidence.code } : null,
        dependencies: Array.isArray(rawStep.dependencies) ? rawStep.dependencies.slice(0, 6) : [],
        failure: rawStep.failure || "当前未识别到明确失败路径。",
      };
    });

    actions.push({
      id: actionId,
      verb: rawAction.verb || `功能 ${actionIndex + 1}`,
      meta: `${steps.length} 个环节 · ${steps.filter((step) => implementationDetails[actionId][step.nodeId].evidenceType === "SOURCE").length} 个源码证据`,
      steps,
    });
  });

  return {
    actions,
    nodes: Array.from(new Map(nodes.map((node) => [node.id, node])).values()),
    edges,
    implementationDetails,
  };
}
