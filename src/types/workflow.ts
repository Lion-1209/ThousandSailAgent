/** Provider configuration — defines how to connect to an LLM API */
export interface ProviderConfig {
  /** Provider type: "anthropic" uses native SDK, "openai-compatible" (default) uses OpenAI-compatible API */
  type?: 'anthropic' | 'openai-compatible';
  /** Base URL for OpenAI-compatible providers (e.g. "https://api.deepseek.com") */
  base_url?: string;
  /** Environment variable name holding the API key (default: OPENAI_API_KEY or ANTHROPIC_API_KEY) */
  api_key_env?: string;
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
  /** Named provider configurations — steps reference via "provider/model" format */
  providers?: Record<string, ProviderConfig>;
  steps: StepDefinition[];
}

/** User input passed at workflow start */
export interface WorkflowInput {
  [key: string]: string;
}
