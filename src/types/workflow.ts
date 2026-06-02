/** A single step in a workflow definition */
export interface StepDefinition {
  /** Unique step identifier */
  id: string;
  /** Agent type name (e.g. "coder", "reviewer", "tester") */
  agent: string;
  /** LLM model identifier (e.g. "claude-sonnet-4-20250514", "gpt-4o") */
  model: string;
  /** Prompt template — may use {{input.xxx}} or {{steps.xxx.output}} references */
  prompt: string;
  /** List of tool names this agent is allowed to use */
  tools: string[];
  /** Step IDs that must complete before this step runs */
  depends_on?: string[];
  /** System prompt override */
  system?: string;
  /** Max LLM tool-use steps (default 10) */
  max_steps?: number;
}

/** Top-level workflow definition (parsed from YAML) */
export interface WorkflowDefinition {
  name: string;
  description?: string;
  steps: StepDefinition[];
}

/** User input passed at workflow start */
export interface WorkflowInput {
  [key: string]: string;
}
