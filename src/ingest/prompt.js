const SYSTEM = `You are CodeStory, a code-reading assistant for non-engineers.
Explain how user-facing product features are implemented.
Never invent file paths, symbols, APIs, or line numbers.
Only cite evidence that exists in the supplied repository context.
If evidence is incomplete, mark it as inferred.
Return strict JSON only, with no markdown fences.`;

export function featurePrompt({ repo, digest, structuralIndex, maxFeatures }) {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Identify up to ${maxFeatures} core user-facing features in this repository.

Repository: ${repo.name}
Description: ${repo.description || "-"}
Entrypoints: ${digest.entries.join(", ") || "-"}
Folders: ${digest.folders.map((item) => `${item.path}(${item.count})`).join(", ")}

STRUCTURAL_INDEX:
${structuralIndex.text}

CODE_CONTEXT:
${digest.text}

Return:
{
  "summary": "one sentence product summary in Chinese",
  "tech": "short tech stack string",
  "features": [
    {
      "id": "stable-kebab-id",
      "verb": "Chinese user action",
      "description": "what the user accomplishes",
      "evidenceFiles": ["real/path.ext"],
      "confidence": "high|medium|low"
    }
  ]
}

Prefer product actions over technical modules. Do not return generic items like initialize app.`,
    },
  ];
}

export function storyPrompt({ repo, digest, structuralIndex, features, maxSteps }) {
  return [
    { role: "system", content: SYSTEM },
    {
      role: "user",
      content: `Generate an implementation story for each selected feature.
Use 4-${maxSteps} steps per feature and follow the main happy path from user action to result.
Do not include trivial helper calls.

Repository: ${repo.name}
Features:
${JSON.stringify(features, null, 2)}

STRUCTURAL_INDEX:
${structuralIndex.text}

CODE_CONTEXT:
${digest.text}

Return:
{
  "actions": [
    {
      "id": "same-feature-id",
      "verb": "same feature verb",
      "steps": [
        {
          "label": "short Chinese node label",
          "detail": "short technical subtitle",
          "kind": "person|screen|logic|storage|service|system",
          "file": "real/path.ext or null",
          "symbol": "real symbol name or null",
          "line": 123,
          "role": "responsibility",
          "input": "input",
          "process": "processing",
          "output": "output",
          "dependencies": ["dependency"],
          "failure": "main failure mode",
          "narration": {
            "beginner": "plain Chinese explanation",
            "product": "product-oriented explanation",
            "engineer": "technical explanation"
          }
        }
      ]
    }
  ]
}

file/symbol/line are evidence hints only. If unsure, use null instead of guessing.`,
    },
  ];
}
