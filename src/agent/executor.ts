import { generateText, stepCountIs } from 'ai';
import type { StepDefinition } from '../types/workflow.js';
import type { StepRecord, ToolCallRecord } from '../types/execution.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ProviderRegistry } from '../llm/provider.js';
import { getAgentConfig } from './agents.js';

export interface AgentContext {
  input: Record<string, string>;
  stepOutputs: Record<string, string>;
}

export interface ExecuteStepOptions {
  step: StepDefinition;
  registry: ToolRegistry;
  providers: ProviderRegistry;
  context: AgentContext;
}

/** Resolve {{input.xxx}} and {{steps.xxx.output}} in prompt templates */
function resolvePrompt(template: string, context: AgentContext): string {
  return template
    .replace(/\{\{input\.(\w+)\}\}/g, (_, key) => context.input[key] ?? '')
    .replace(/\{\{steps\.(\w+)\.output\}\}/g, (_, stepId) => context.stepOutputs[stepId] ?? '');
}

export async function executeStep(options: ExecuteStepOptions): Promise<StepRecord> {
  const { step, registry, context } = options;
  const startedAt = new Date().toISOString();

  try {
    const resolvedPrompt = resolvePrompt(step.prompt, context);
    const tools = registry.getSubset(step.tools);
    const model = options.providers.createModel(step.model);

    // Agent system prompt: step.system override > agent type default
    const agentConfig = getAgentConfig(step.agent);
    const system = step.system ?? agentConfig.systemPrompt;

    const result = await generateText({
      model,
      system,
      prompt: resolvedPrompt,
      tools,
      stopWhen: stepCountIs(step.max_steps ?? 10),
    });

    // Collect tool call records from all steps
    const toolCalls: ToolCallRecord[] = result.steps.flatMap((s: any) =>
      (s.toolCalls ?? []).map((tc: any) => ({
        toolName: tc.toolName,
        input: tc.args,
        output: result.steps
          .flatMap((s2: any) => s2.toolResults ?? [])
          .find((tr: any) => tr.toolCallId === tc.toolCallId)?.output ?? null,
      }))
    );

    return {
      stepId: step.id,
      status: 'completed',
      output: result.text,
      toolCalls,
      startedAt,
      completedAt: new Date().toISOString(),
      tokenUsage: {
        promptTokens: result.totalUsage.inputTokens ?? 0,
        completionTokens: result.totalUsage.outputTokens ?? 0,
        totalTokens: (result.totalUsage.inputTokens ?? 0) + (result.totalUsage.outputTokens ?? 0),
      },
      error: null,
    };
  } catch (e) {
    return {
      stepId: step.id,
      status: 'failed',
      output: '',
      toolCalls: [],
      startedAt,
      completedAt: new Date().toISOString(),
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error: (e as Error).message,
    };
  }
}
