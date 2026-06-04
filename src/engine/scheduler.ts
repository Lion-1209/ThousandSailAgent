import { buildDag } from '../parser/dag-builder.js';
import { ContextManager } from './context.js';
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
      // Skip steps whose dependencies failed
      const runnable = wave.filter((id) => {
        const deps = dag.getNode(id)?.dependencies ?? [];
        if (deps.some((d) => failedSteps.has(d))) return false;

        // Route filtering: if step declares a route, it must match an upstream route
        const step = dag.getNode(id)!.step;
        if (step.route) {
          const hasMatchingRoute = deps.some((d) => ctx.getStepRoute(d) === step.route);
          if (!hasMatchingRoute) return false;
        }

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

          // Extract route decision from tool calls
          const routeCall = result.toolCalls.find((tc) => tc.toolName === 'set_route');
          if (routeCall && typeof routeCall.input === 'object' && routeCall.input !== null) {
            const routeName = (routeCall.input as any).route;
            if (typeof routeName === 'string') {
              ctx.setStepRoute(id, routeName);
            }
          }
        } else {
          failedSteps.add(id);
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
