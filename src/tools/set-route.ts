import { tool } from 'ai';
import { z } from 'zod';

export function createSetRouteTool() {
  return tool({
    description: 'Set the routing decision for this step. Downstream steps with a matching "route" field will execute; others will be skipped. Use this after gathering information or making a decision to control which path the workflow takes.',
    inputSchema: z.object({
      route: z.string().describe('The route name to set (e.g. "embedded", "web", "approved", "rejected")'),
    }),
    execute: async ({ route }: { route: string }) => {
      return { success: true, route };
    },
  });
}
