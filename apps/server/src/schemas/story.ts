import { z } from "zod";

const narration = z.object({ beginner: z.string(), product: z.string(), engineer: z.string() });
const node = z.object({ id: z.string(), label: z.string(), detail: z.string(), kind: z.string(), position: z.object({ x: z.number(), y: z.number() }) });
const edge = z.object({ id: z.string(), source: z.string(), target: z.string() });
const action = z.object({
  id: z.string(), verb: z.string(), meta: z.string(),
  steps: z.array(z.object({ nodeId: z.string(), edgeId: z.string().nullable(), narration })).min(2),
});
export const runtimeProjectSchema = z.object({
  id: z.string(), name: z.string(), category: z.string(), tech: z.string(), source: z.string(), description: z.string(), accent: z.string(),
  nodes: z.array(node).min(1), edges: z.array(edge), actions: z.array(action).min(1),
  implementationDetails: z.record(z.record(z.object({ evidenceType: z.enum(["SOURCE", "INFERRED", "MODEL"]), snippet: z.string() }).passthrough())),
  repoMeta: z.object({ origin: z.string(), commit: z.string().nullable(), stats: z.record(z.unknown()), generatedAt: z.string(), evidenceSummary: z.object({ sourceSteps: z.number().int().nonnegative() }) }).passthrough(),
});

export type RuntimeProject = z.infer<typeof runtimeProjectSchema>;
