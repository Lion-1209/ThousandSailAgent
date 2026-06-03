import { generateText } from 'ai';
import { ProviderRegistry } from '../llm/provider.js';

const DEFAULT_MAX_CHARS = 4000;
const DEFAULT_SUMMARY_MODEL = 'deepseek/deepseek-chat';

let providerRegistry: ProviderRegistry | null = null;

export function setSummaryProvider(registry: ProviderRegistry): void {
  providerRegistry = registry;
}

/**
 * If text exceeds maxChars, use LLM to summarize it.
 * Otherwise return text as-is.
 * If no provider is set, truncate to maxChars.
 */
export async function summarizeIfNeeded(
  text: string,
  maxChars: number = DEFAULT_MAX_CHARS,
  modelRef: string = DEFAULT_SUMMARY_MODEL,
): Promise<string> {
  if (text.length <= maxChars) return text;
  if (!providerRegistry) return text.slice(0, maxChars);

  const model = providerRegistry.createModel(modelRef);
  const result = await generateText({
    model,
    prompt: `请将以下内容压缩为简洁的摘要，保留关键信息和结论，不超过${Math.floor(maxChars / 2)}个字符：\n\n${text}`,
  });
  return result.text;
}
