import path from 'node:path';
import { parseWorkflow } from '../parser/yaml-parser.js';
import { WorkflowScheduler } from './scheduler.js';
import { ToolRegistry } from '../tools/registry.js';
import { ProviderRegistry } from '../llm/provider.js';
import { createFileReadTool } from '../tools/file-read.js';
import { createFileWriteTool } from '../tools/file-write.js';
import { createTerminalTool } from '../tools/terminal.js';
import { createHumanInputTool } from '../tools/human-input.js';
import { createSetRouteTool } from '../tools/set-route.js';
import { createPlanStepsTool } from '../tools/plan-steps.js';
import { extractPlan, applyPlan } from './planner.js';
import type { RunRecord } from '../types/execution.js';

export function createDefaultRegistry(workdir?: string): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register('file_read', createFileReadTool(workdir) as any);
  registry.register('file_write', createFileWriteTool(workdir) as any);
  registry.register('terminal', createTerminalTool(workdir) as any);
  registry.register('human_input', createHumanInputTool() as any);
  registry.register('set_route', createSetRouteTool() as any);
  registry.register('plan_steps', createPlanStepsTool() as any);
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

  const steps = definition.steps;
  const plannerStep = steps.find(s => s.plan === true);

  let finalSteps = steps;
  let plannerRecord: RunRecord | null = null;

  if (plannerStep) {
    // Execute planner step first
    const plannerScheduler = new WorkflowScheduler(toolRegistry, providerRegistry);
    plannerRecord = await plannerScheduler.run([plannerStep], input);

    // Extract plan from planner's tool calls
    const plan = extractPlan(plannerRecord.steps[0].toolCalls);

    if (plan) {
      finalSteps = applyPlan(steps, plan);
    } else {
      // No plan output — remove planner step, keep rest as-is
      finalSteps = steps.filter(s => !s.plan);
    }
  }

  // Run the (possibly modified) steps through the scheduler
  const scheduler = new WorkflowScheduler(toolRegistry, providerRegistry);
  const record = await scheduler.run(finalSteps, input);
  record.workflowName = definition.name;

  // Prepend planner record if it ran
  if (plannerRecord) {
    record.steps = [...plannerRecord.steps, ...record.steps];
  }

  return record;
}
