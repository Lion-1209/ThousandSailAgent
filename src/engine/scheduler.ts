import { buildDag } from '../parser/dag-builder.js';
import { ContextManager } from './context.js';
import { evaluateCondition } from './evaluator.js';
import { executeStep } from '../agent/executor.js';
import { summarizeIfNeeded, setSummaryProvider } from '../agent/summarizer.js';
import { ToolRegistry } from '../tools/registry.js';
import type { ProviderRegistry } from '../llm/provider.js';
import type { StepDefinition, WorkflowInput } from '../types/workflow.js';
import type { RunRecord, StepRecord, StepStatus } from '../types/execution.js';
import { v4 as uuid } from 'uuid';

export class WorkflowScheduler {
  constructor(
    private registry: ToolRegistry,
    private providers: ProviderRegistry,
  ) {
    setSummaryProvider(providers);
  }

  async run(steps: StepDefinition[], input: WorkflowInput): Promise<RunRecord> {
    const runId = uuid();
    const startedAt = new Date().toISOString();
    const dag = buildDag(steps);
    const ctx = new ContextManager();
    ctx.setInput(input);

    const stepResults: StepRecord[] = [];
    const failedSteps = new Set<string>();

    for (const wave of dag.getParallelGroups()) {
      // Skip steps whose condition is false; if no condition, skip those with failed deps
      const runnable = wave.filter((id) => {
        const step = dag.getNode(id)!.step;

        // Evaluate condition first — an explicit condition can override dep-failure logic
        if (step.condition !== undefined && step.condition !== '') {
          if (!evaluateCondition(step.condition, ctx.getEvalContext())) return false;
          return true; // condition passed, run even if deps failed
        }

        // No condition: skip if any dependency failed
        const deps = dag.getNode(id)?.dependencies ?? [];
        if (deps.some((d) => failedSteps.has(d))) return false;

        return true;
      });

      const skipped = wave.filter((id) => !runnable.includes(id));

      // Record skipped steps
      for (const id of skipped) {
        stepResults.push(makeSkippedRecord(id));
      }

      // Execute runnable steps in parallel
      const promises = runnable.map(async (id) => {
        const node = dag.getNode(id)!;
        const result = await executeStep({
          step: node.step,
          registry: this.registry,
          providers: this.providers,
          context: ctx.getAgentContext(),
        });
        if (result.status === 'completed') {
          const summarized = await summarizeIfNeeded(result.output);
          ctx.setStepOutput(id, summarized);
          ctx.setStepStatus(id, 'completed');
        } else {
          failedSteps.add(id);
          ctx.setStepStatus(id, 'failed');
        }
        return result;
      });

      const results = await Promise.all(promises);
      stepResults.push(...results);
    }

    const overallStatus: StepStatus = failedSteps.size > 0 ? 'failed' : 'completed';

    return {
      runId,
      workflowName: '',
      status: overallStatus,
      input,
      steps: stepResults,
      startedAt,
      completedAt: new Date().toISOString(),
    };
  }
}

function makeSkippedRecord(stepId: string): StepRecord {
  return {
    stepId,
    status: 'skipped',
    output: '',
    toolCalls: [],
    startedAt: '',
    completedAt: '',
    tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
    error: null,
  };
}
