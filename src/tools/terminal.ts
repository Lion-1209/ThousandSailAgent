import { tool } from 'ai';
import { z } from 'zod';
import { exec } from 'node:child_process';

export const terminalTool = tool({
  description: 'Execute a shell command and return its stdout and stderr. Times out after 30 seconds by default.',
  inputSchema: z.object({
    command: z.string().describe('The shell command to execute'),
    timeout: z.number().optional().describe('Timeout in milliseconds (default 30000)'),
  }),
  execute: async ({ command, timeout = 30_000 }) => {
    return new Promise((resolve) => {
      exec(command, { timeout }, (error, stdout, stderr) => {
        resolve({
          success: !error,
          exitCode: error?.code ?? 0,
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          error: error?.message ?? null,
        });
      });
    });
  },
});
