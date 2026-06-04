import { tool } from 'ai';
import { z } from 'zod';
import { createInterface } from 'readline/promises';

export function createHumanInputTool() {
  return tool({
    description: 'Ask the user a question and wait for their text response. Use this when you need information or a decision from the user to proceed.',
    inputSchema: z.object({
      question: z.string().describe('The question to ask the user'),
    }),
    execute: async ({ question }: { question: string }) => {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const answer = await rl.question(`\n❓ ${question}\n> `);
      rl.close();
      return answer;
    },
  });
}
