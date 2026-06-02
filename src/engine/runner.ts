import { parseWorkflow } from '../parser/yaml-parser.js';
import { WorkflowScheduler } from './scheduler.js';
import { ToolRegistry } from '../tools/registry.js';
import { ProviderRegistry } from '../llm/provider.js';
import { fileReadTool } from '../tools/file-read.js';
import { fileWriteTool } from '../tools/file-write.js';
import { terminalTool } from '../tools/terminal.js';
import type { RunRecord } from '../types/execution.js';

export function createDefaultRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register('file_read', fileReadTool as any);
  registry.register('file_write', fileWriteTool as any);
  registry.register('terminal', terminalTool as any);
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
  const toolRegistry = createDefaultRegistry();
  const providerRegistry = createProviderRegistry(definition.providers);
  const scheduler = new WorkflowScheduler(toolRegistry, providerRegistry);
  const record = await scheduler.run(definition.steps, input);
  record.workflowName = definition.name;
  return record;
}
