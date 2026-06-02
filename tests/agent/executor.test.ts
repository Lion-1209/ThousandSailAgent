import { describe, it, expect, vi, beforeEach } from 'vitest';
import { executeStep } from '../../src/agent/executor.js';
import type { StepDefinition } from '../../src/types/workflow.js';
import { ToolRegistry } from '../../src/tools/registry.js';

// Mock the AI SDK
vi.mock('ai', () => ({
  generateText: vi.fn(),
  stepCountIs: (n: number) => n,
}));

vi.mock('../../src/llm/provider.js', () => ({
  createModel: vi.fn(() => 'mock-model'),
}));

import { generateText } from 'ai';
const mockedGenerateText = vi.mocked(generateText);

describe('executeStep', () => {
  let registry: ToolRegistry;

  beforeEach(() => {
    // Create a registry with a mock tool
    registry = new ToolRegistry();
    registry.register('file_read', {
      description: 'read file',
      inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
      execute: async () => ({ success: true, content: 'file content' }),
    } as any);
    vi.clearAllMocks();
  });

  it('calls generateText with correct model, prompt, and tools', async () => {
    const step: StepDefinition = {
      id: 'test-step',
      agent: 'coder',
      model: 'claude-sonnet-4-20250514',
      prompt: 'Write a hello world function',
      tools: ['file_read'],
      max_steps: 5,
    };

    mockedGenerateText.mockResolvedValue({
      text: 'done',
      steps: [],
      totalUsage: { promptTokens: 10, completionTokens: 20 },
      finishReason: 'stop',
    } as any);

    const result = await executeStep({
      step,
      registry,
      context: { input: { requirement: 'test' }, stepOutputs: {} },
    });

    expect(result.output).toBe('done');
    expect(result.status).toBe('completed');
    expect(mockedGenerateText).toHaveBeenCalledOnce();
    const callArgs = mockedGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toBe('Write a hello world function');
    expect(callArgs.tools).toHaveProperty('file_read');
  });

  it('resolves template variables in prompt', async () => {
    const step: StepDefinition = {
      id: 'step2',
      agent: 'reviewer',
      model: 'gpt-4o',
      prompt: 'Review code from step: {{steps.code.output}}',
      tools: ['file_read'],
    };

    mockedGenerateText.mockResolvedValue({
      text: 'looks good',
      steps: [],
      totalUsage: { promptTokens: 5, completionTokens: 10 },
      finishReason: 'stop',
    } as any);

    await executeStep({
      step,
      registry,
      context: { input: {}, stepOutputs: { code: 'print("hello")' } },
    });

    const callArgs = mockedGenerateText.mock.calls[0][0];
    expect(callArgs.prompt).toBe('Review code from step: print("hello")');
  });

  it('returns failed status on LLM error', async () => {
    const step: StepDefinition = {
      id: 'bad-step',
      agent: 'coder',
      model: 'claude-sonnet-4-20250514',
      prompt: 'do something',
      tools: ['file_read'],
    };

    mockedGenerateText.mockRejectedValue(new Error('API rate limit'));

    const result = await executeStep({
      step,
      registry,
      context: { input: {}, stepOutputs: {} },
    });

    expect(result.status).toBe('failed');
    expect(result.error).toContain('API rate limit');
  });
});
