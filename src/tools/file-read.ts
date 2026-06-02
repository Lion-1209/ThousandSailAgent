import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';

export const fileReadTool = tool({
  description: 'Read the contents of a file at the given path. Returns the file content as a string.',
  inputSchema: z.object({
    path: z.string().describe('Absolute or relative file path to read'),
  }),
  execute: async ({ path }) => {
    try {
      const content = await fs.readFile(path, 'utf-8');
      return { success: true, content };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
});
