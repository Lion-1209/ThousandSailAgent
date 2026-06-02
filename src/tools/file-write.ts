import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

export const fileWriteTool = tool({
  description: 'Write content to a file. Creates parent directories if they do not exist.',
  inputSchema: z.object({
    path: z.string().describe('Absolute or relative file path to write'),
    content: z.string().describe('The content to write to the file'),
  }),
  execute: async ({ path: filePath, content }) => {
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      await fs.writeFile(filePath, content, 'utf-8');
      return { success: true, path: filePath };
    } catch (e) {
      return { success: false, error: (e as Error).message };
    }
  },
});
