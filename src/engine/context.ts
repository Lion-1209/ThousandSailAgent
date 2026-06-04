import type { AgentContext } from '../agent/executor.js';
import type { WorkflowInput } from '../types/workflow.js';
import type { EvalContext } from './evaluator.js';

export class ContextManager {
  private input: WorkflowInput = {};
  private stepOutputs: Record<string, string> = {};
  private stepStatuses: Record<string, string> = {};

  setInput(input: WorkflowInput): void {
    this.input = input;
  }

  getInput(): WorkflowInput {
    return { ...this.input };
  }

  setStepOutput(stepId: string, output: string): void {
    this.stepOutputs[stepId] = output;
  }

  getStepOutput(stepId: string): string {
    return this.stepOutputs[stepId] ?? '';
  }

  setStepStatus(stepId: string, status: string): void {
    this.stepStatuses[stepId] = status;
  }

  getStepStatus(stepId: string): string | undefined {
    return this.stepStatuses[stepId];
  }

  getAgentContext(): AgentContext {
    return {
      input: { ...this.input },
      stepOutputs: { ...this.stepOutputs },
    };
  }

  getEvalContext(): EvalContext {
    return {
      input: { ...this.input },
      stepOutputs: { ...this.stepOutputs },
      stepStatuses: { ...this.stepStatuses },
    };
  }
}
