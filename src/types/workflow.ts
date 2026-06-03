/** Provider override from YAML (API keys are managed via CLI config, not in YAML) */
export interface ProviderConfig {
  /** Provider type: "anthropic" uses native SDK, "openai-compatible" (default) uses OpenAI-compatible API */
  type?: 'anthropic' | 'openai-compatible';
  /** Override base URL (optional — known providers have built-in URLs) */
  base_url?: string;
}

/** A single step in a workflow definition */
export interface StepDefinition {
  /** Unique step identifier */
  id: string;
  /** Agent type name (e.g. "coder", "reviewer", "tester") */
  agent: string;
  /** Model reference in "provider/model" format (e.g. "deepseek/deepseek-chat", "glm/glm-4-flash") */
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
  /** Working directory — tools resolve relative paths against this */
  workdir?: string;
  /** Optional provider overrides — API keys come from "agentflow config" */
  providers?: Record<string, ProviderConfig>;
  steps: StepDefinition[];
}

/** User input passed at workflow start */
export interface WorkflowInput {
  [key: string]: string;
}
