import type { AgentContext } from '../agent/executor.js';
import type { WorkflowInput } from '../types/workflow.js';

export class ContextManager {
  private input: WorkflowInput = {};
  private stepOutputs: Record<string, string> = {};

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

  getAgentContext(): AgentContext {
    return {
      input: { ...this.input },
      stepOutputs: { ...this.stepOutputs },
    };
  }
}
