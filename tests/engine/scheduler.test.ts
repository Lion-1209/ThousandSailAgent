import { describe, it, expect, vi } from 'vitest';
import { WorkflowScheduler } from '../../src/engine/scheduler.js';
import type { StepDefinition } from '../../src/types/workflow.js';
import { ToolRegistry } from '../../src/tools/registry.js';
import { ProviderRegistry } from '../../src/llm/provider.js';

// Mock the agent executor
vi.mock('../../src/agent/executor.js', () => ({
  executeStep: vi.fn(),
}));

// Mock the summarizer
vi.mock('../../src/agent/summarizer.js', () => ({
  summarizeIfNeeded: vi.fn((text: string) => Promise.resolve(text)),
  setSummaryProvider: vi.fn(),
}));

import { executeStep } from '../../src/agent/executor.js';
const mockedExecuteStep = vi.mocked(executeStep);

function makeStep(overrides: Partial<StepDefinition> & { id: string }): StepDefinition {
  return {
    agent: 'coder',
    model: 'deepseek/deepseek-chat',
    prompt: `Do task`,
    tools: ['file_read'],
    ...overrides,
  };
}

function makeProviders(): ProviderRegistry {
  const p = new ProviderRegistry();
  p.register('deepseek', { base_url: 'https://api.deepseek.com', api_key_env: 'TEST_KEY' });
  return p;
}

describe('WorkflowScheduler', () => {
  it('executes steps in dependency order', async () => {
    const steps = [
      makeStep({ id: 'first', prompt: 'Step 1' }),
      makeStep({ id: 'second', prompt: 'Step 2', depends_on: ['first'] }),
    ];

    const callOrder: string[] = [];
    mockedExecuteStep.mockImplementation(async (opts) => {
      callOrder.push(opts.step.id);
      return {
        stepId: opts.step.id,
        status: 'completed' as const,
        output: `output-${opts.step.id}`,
        toolCalls: [],
        startedAt: '',
        completedAt: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        error: null,
      };
    });

    const scheduler = new WorkflowScheduler(new ToolRegistry(), makeProviders());
    const result = await scheduler.run(steps, { task: 'test' });

    expect(callOrder).toEqual(['first', 'second']);
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].stepId).toBe('first');
    expect(result.steps[1].stepId).toBe('second');
  });

  it('runs independent steps in parallel', async () => {
    const steps = [
      makeStep({ id: 'a', prompt: 'A' }),
      makeStep({ id: 'b', prompt: 'B' }),
    ];

    mockedExecuteStep.mockImplementation(async (opts) => ({
      stepId: opts.step.id,
      status: 'completed' as const,
      output: `output-${opts.step.id}`,
      toolCalls: [],
      startedAt: '',
      completedAt: '',
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error: null,
    }));

    const scheduler = new WorkflowScheduler(new ToolRegistry(), makeProviders());
    const result = await scheduler.run(steps, {});
    expect(result.steps).toHaveLength(2);
    expect(result.status).toBe('completed');
  });

  it('marks workflow as failed if any step fails', async () => {
    const steps = [
      makeStep({ id: 'a', prompt: 'A' }),
      makeStep({ id: 'b', prompt: 'B', depends_on: ['a'] }),
    ];

    mockedExecuteStep.mockImplementation(async (opts) => {
      if (opts.step.id === 'a') {
        return {
          stepId: 'a',
          status: 'failed' as const,
          output: '',
          toolCalls: [],
          startedAt: '',
          completedAt: '',
          tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
          error: 'API error',
        };
      }
      return {
        stepId: 'b',
        status: 'skipped' as const,
        output: '',
        toolCalls: [],
        startedAt: '',
        completedAt: '',
        tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
        error: null,
      };
    });

    const scheduler = new WorkflowScheduler(new ToolRegistry(), makeProviders());
    const result = await scheduler.run(steps, {});
    expect(result.status).toBe('failed');
    const stepB = result.steps.find((s) => s.stepId === 'b');
    expect(stepB?.status).toBe('skipped');
  });

  it('skips steps whose route does not match upstream routing', async () => {
    const steps = [
      makeStep({ id: 'analyze', prompt: 'Analyze', tools: ['file_read', 'human_input', 'set_route'] }),
      makeStep({ id: 'embedded', prompt: 'Embedded impl', route: 'embedded', depends_on: ['analyze'] }),
      makeStep({ id: 'web', prompt: 'Web impl', route: 'web', depends_on: ['analyze'] }),
    ];

    mockedExecuteStep.mockImplementation(async (opts) => ({
      stepId: opts.step.id,
      status: 'completed' as const,
      output: `output-${opts.step.id}`,
      toolCalls: opts.step.id === 'analyze'
        ? [{ toolName: 'set_route', input: { route: 'embedded' }, output: { success: true, route: 'embedded' } }]
        : [],
      startedAt: '',
      completedAt: '',
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error: null,
    }));

    const scheduler = new WorkflowScheduler(new ToolRegistry(), makeProviders());
    const result = await scheduler.run(steps, {});

    const embedded = result.steps.find((s) => s.stepId === 'embedded');
    const web = result.steps.find((s) => s.stepId === 'web');
    expect(embedded?.status).toBe('completed');
    expect(web?.status).toBe('skipped');
  });

  it('runs steps without route field regardless of upstream routing', async () => {
    const steps = [
      makeStep({ id: 'analyze', prompt: 'Analyze', tools: ['file_read', 'set_route'] }),
      makeStep({ id: 'always', prompt: 'Always runs', depends_on: ['analyze'] }),
    ];

    mockedExecuteStep.mockImplementation(async (opts) => ({
      stepId: opts.step.id,
      status: 'completed' as const,
      output: `output-${opts.step.id}`,
      toolCalls: opts.step.id === 'analyze'
        ? [{ toolName: 'set_route', input: { route: 'embedded' }, output: { success: true, route: 'embedded' } }]
        : [],
      startedAt: '',
      completedAt: '',
      tokenUsage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      error: null,
    }));

    const scheduler = new WorkflowScheduler(new ToolRegistry(), makeProviders());
    const result = await scheduler.run(steps, {});
    expect(result.steps.find((s) => s.stepId === 'always')?.status).toBe('completed');
  });
});
