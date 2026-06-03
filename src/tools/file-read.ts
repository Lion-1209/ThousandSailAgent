import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

export function createFileReadTool(workdir?: string) {
  return tool({
    description: 'Read the contents of a file. Returns the file content as a string.',
    inputSchema: z.object({
      path: z.string().describe('File path to read (relative to workdir if not absolute)'),
    }),
    execute: async ({ path: filePath }) => {
      const resolved = resolvePath(filePath, workdir);
      try {
        const content = await fs.readFile(resolved, 'utf-8');
        return { success: true, content };
      } catch (e) {
        return { success: false, error: (e as Error).message };
      }
    },
  });
}

function resolvePath(filePath: string, workdir?: string): string {
  if (path.isAbsolute(filePath)) return filePath;
  if (workdir) return path.resolve(workdir, filePath);
  return path.resolve(filePath);
}

export const fileReadTool = createFileReadTool();
