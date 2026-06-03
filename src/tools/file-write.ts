import { tool } from 'ai';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

export function createFileWriteTool(workdir?: string) {
  return tool({
    description: 'Write content to a file. Creates parent directories if they do not exist.',
    inputSchema: z.object({
      path: z.string().describe('File path to write (relative to workdir if not absolute)'),
      content: z.string().describe('The content to write to the file'),
    }),
    execute: async ({ path: filePath, content }) => {
      const resolved = resolvePath(filePath, workdir);
      try {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, content, 'utf-8');
        return { success: true, path: resolved };
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

export const fileWriteTool = createFileWriteTool();
