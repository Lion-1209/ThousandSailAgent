import { tool } from 'ai';
import { z } from 'zod';

const NewStepSchema = z.object({
  id: z.string().min(1),
  agent: z.string().min(1),
  prompt: z.string().min(1),
  tools: z.array(z.string()).min(1),
  depends_on: z.array(z.string()).optional(),
  model: z.string().optional(),
});

export function createPlanStepsTool() {
  return tool({
    description: 'Modify the workflow plan. Enable or disable template steps, modify step prompts, or add entirely new steps. Use this to adapt the workflow template to the specific task at hand.',
    inputSchema: z.object({
      enabled: z.array(z.string()).optional().describe('Step IDs from the template to enable (optional steps that should run)'),
      disabled: z.array(z.string()).optional().describe('Step IDs from the template to disable (skip these steps)'),
      modifications: z.record(z.object({
        prompt: z.string().optional(),
        tools: z.array(z.string()).optional(),
        model: z.string().optional(),
      })).optional().describe('Modifications to apply to existing steps, keyed by step ID'),
      new_steps: z.array(NewStepSchema).optional().describe('New steps to add to the workflow'),
    }),
    execute: async (input) => {
      return { success: true, plan: input };
    },
  });
}
