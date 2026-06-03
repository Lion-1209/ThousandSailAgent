import { describe, it, expect, vi, beforeEach } from 'vitest';
import { summarizeIfNeeded, setSummaryProvider } from '../../src/agent/summarizer.js';
import { ProviderRegistry } from '../../src/llm/provider.js';

// Mock AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
}));

// Mock provider SDKs
vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: () => (modelId: string) => `mock-anthropic:${modelId}`,
}));
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: () => ({ chat: (modelId: string) => `mock-openai:${modelId}` }),
}));

// Mock config
vi.mock('../../src/config/providers.js', () => ({
  getApiKey: () => 'test-key',
  loadConfig: () => ({ providers: {} }),
  KNOWN_PROVIDERS: [
    { name: 'deepseek', type: 'openai-compatible', base_url: 'https://api.deepseek.com' },
  ],
}));

import { generateText } from 'ai';
const mockedGenerateText = vi.mocked(generateText);

describe('summarizer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns original text when under max length', async () => {
    const result = await summarizeIfNeeded('short text', 100);
    expect(result).toBe('short text');
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('truncates when over max length and no provider set', async () => {
    const longText = 'x'.repeat(5000);
    const result = await summarizeIfNeeded(longText, 100);
    expect(result).toBe('x'.repeat(100));
    expect(mockedGenerateText).not.toHaveBeenCalled();
  });

  it('calls LLM to summarize when over max length and provider is set', async () => {
    const providers = new ProviderRegistry();
    providers.register('deepseek', {
      type: 'openai-compatible',
      base_url: 'https://api.deepseek.com',
    });
    setSummaryProvider(providers);

    const longText = 'x'.repeat(5000);
    mockedGenerateText.mockResolvedValue({
      text: 'summarized version',
      steps: [],
      totalUsage: { inputTokens: 100, outputTokens: 50 },
      finishReason: 'stop',
    } as any);

    const result = await summarizeIfNeeded(longText, 4000, 'deepseek/deepseek-chat');
    expect(result).toBe('summarized version');
    expect(mockedGenerateText).toHaveBeenCalledOnce();
  });
});
