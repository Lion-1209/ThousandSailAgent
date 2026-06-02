export type StepStatus = 'pending' | 'running' | 'completed' | 'failed' | 'skipped';

/** Record of a single step execution */
export interface StepRecord {
  stepId: string;
  status: StepStatus;
  output: string;
  toolCalls: ToolCallRecord[];
  startedAt: string;
  completedAt: string | null;
  tokenUsage: TokenUsage;
  error: string | null;
}

/** Record of a tool call within a step */
export interface ToolCallRecord {
  toolName: string;
  input: unknown;
  output: unknown;
}

/** Token usage for a single step */
export interface TokenUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

/** Record of a full workflow run */
export interface RunRecord {
  runId: string;
  workflowName: string;
  status: StepStatus;
  input: Record<string, string>;
  steps: StepRecord[];
  startedAt: string;
  completedAt: string | null;
}
