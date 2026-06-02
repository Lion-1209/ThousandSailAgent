import { parseWorkflow } from '../parser/yaml-parser.js';
import { WorkflowScheduler } from './scheduler.js';
import { ToolRegistry } from '../tools/registry.js';
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

export async function runWorkflow(
  yamlContent: string,
  input: Record<string, string>
): Promise<RunRecord> {
  const definition = parseWorkflow(yamlContent);
  const registry = createDefaultRegistry();
  const scheduler = new WorkflowScheduler(registry);
  const record = await scheduler.run(definition.steps, input);
  record.workflowName = definition.name;
  return record;
}
