import path from 'node:path';
import { parseWorkflow } from '../parser/yaml-parser.js';
import { WorkflowScheduler } from './scheduler.js';
import { ToolRegistry } from '../tools/registry.js';
import { ProviderRegistry } from '../llm/provider.js';
import { createFileReadTool } from '../tools/file-read.js';
import { createFileWriteTool } from '../tools/file-write.js';
import { createTerminalTool } from '../tools/terminal.js';
import type { RunRecord } from '../types/execution.js';

export function createDefaultRegistry(workdir?: string): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register('file_read', createFileReadTool(workdir) as any);
  registry.register('file_write', createFileWriteTool(workdir) as any);
  registry.register('terminal', createTerminalTool(workdir) as any);
  return registry;
}

export function createProviderRegistry(
  providers?: Record<string, import('../types/workflow.js').ProviderConfig>
): ProviderRegistry {
  const registry = new ProviderRegistry();
  if (providers) {
    for (const [name, config] of Object.entries(providers)) {
      registry.register(name, { type: config.type ?? 'openai-compatible', base_url: config.base_url });
    }
  }
  return registry;
}

export async function runWorkflow(
  yamlContent: string,
  input: Record<string, string>
): Promise<RunRecord> {
  const definition = parseWorkflow(yamlContent);
  const workdir = definition.workdir
    ? path.resolve(process.cwd(), definition.workdir)
    : undefined;
  const toolRegistry = createDefaultRegistry(workdir);
  const providerRegistry = createProviderRegistry(definition.providers);
  const scheduler = new WorkflowScheduler(toolRegistry, providerRegistry);
  const record = await scheduler.run(definition.steps, input);
  record.workflowName = definition.name;
  return record;
}
