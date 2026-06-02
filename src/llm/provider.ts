import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModelV1 } from '@ai-sdk/provider';

const CLAUDE_PREFIXES = ['claude-', 'anthropic/'];
const OPENAI_PREFIXES = ['gpt-', 'o1-', 'o3-', 'openai/'];

export function createModel(modelId: string): LanguageModelV1 {
  if (CLAUDE_PREFIXES.some((p) => modelId.startsWith(p))) {
    return anthropic(modelId);
  }
  if (OPENAI_PREFIXES.some((p) => modelId.startsWith(p))) {
    return openai(modelId);
  }
  throw new Error(
    `Unknown model: "${modelId}". Supported prefixes: ${[...CLAUDE_PREFIXES, ...OPENAI_PREFIXES].join(', ')}`
  );
}
