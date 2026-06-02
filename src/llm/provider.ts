import { anthropic } from '@ai-sdk/anthropic';
import { openai } from '@ai-sdk/openai';
import type { LanguageModel } from 'ai';

const CLAUDE_PREFIXES = ['claude-', 'anthropic/'];
const OPENAI_PREFIXES = ['gpt-', 'o1-', 'o3-', 'openai/'];

export function createModel(modelId: string) {
  if (CLAUDE_PREFIXES.some((p) => modelId.startsWith(p))) {
    return anthropic(modelId) as any;
  }
  if (OPENAI_PREFIXES.some((p) => modelId.startsWith(p))) {
    return openai(modelId) as any;
  }
  throw new Error(
    `Unknown model: "${modelId}". Supported prefixes: ${[...CLAUDE_PREFIXES, ...OPENAI_PREFIXES].join(', ')}`
  );
}
