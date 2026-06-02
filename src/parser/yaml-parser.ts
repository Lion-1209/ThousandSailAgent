import yaml from 'js-yaml';
import { z } from 'zod';

const StepSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  model: z.string().min(1),
  prompt: z.string().min(1),
  tools: z.array(z.string()).min(1),
  depends_on: z.array(z.string()).optional(),
  system: z.string().optional(),
  max_steps: z.number().int().min(1).optional(),
});

const WorkflowSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  steps: z.array(StepSchema).min(1),
});

export type RawWorkflow = z.infer<typeof WorkflowSchema>;

export function parseWorkflow(yamlContent: string): import('../types/workflow.js').WorkflowDefinition {
  let parsed: unknown;
  try {
    parsed = yaml.load(yamlContent);
  } catch (e) {
    throw new Error(`Invalid YAML: ${(e as Error).message}`);
  }

  const result = WorkflowSchema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw new Error(`Invalid workflow schema: ${issues}`);
  }

  // Check for duplicate step IDs
  const ids = result.data.steps.map((s) => s.id);
  const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
  if (dupes.length > 0) {
    throw new Error(`Duplicate step IDs: ${[...new Set(dupes)].join(', ')}`);
  }

  return result.data;
}
