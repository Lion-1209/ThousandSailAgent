import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { runWorkflow } from '../../src/engine/runner.js';
import { RunStorage } from '../../src/storage/sqlite.js';

// Mock the AI SDK to avoid real API calls
vi.mock('ai', async (importOriginal) => {
  const actual = await importOriginal() as any;
  return {
    ...actual,
    generateText: vi.fn(),
    stepCountIs: (n: number) => n,
  };
});

// Mock the LLM provider so createModel does not need real API keys
vi.mock('../../src/llm/provider.js', () => ({
  createModel: vi.fn(() => 'mock-model'),
}));

import { generateText } from 'ai';
const mockedGenerateText = vi.mocked(generateText);

let dbPath: string;
let storage: RunStorage;

beforeEach(() => {
  dbPath = path.join(os.tmpdir(), `agentflow-e2e-${Date.now()}.db`);
  storage = new RunStorage(dbPath);
  vi.clearAllMocks();
});

afterEach(() => {
  storage.close();
  if (fs.existsSync(dbPath)) fs.unlinkSync(dbPath);
});

const SIMPLE_WORKFLOW_YAML = `
name: simple-pipeline
steps:
  - id: step1
    agent: coder
    model: claude-sonnet-4-20250514
    prompt: "Generate code for: {{input.task}}"
    tools: [file_write]

  - id: step2
    agent: reviewer
    model: gpt-4o
    prompt: "Review this code: {{steps.step1.output}}"
    depends_on: [step1]
    tools: [file_read]
`;

describe('End-to-end workflow', () => {
  it('runs a full pipeline and stores results', async () => {
    mockedGenerateText.mockImplementation(async (opts: any) => {
      if (opts.prompt.includes('Generate code')) {
        return {
          text: 'function hello() { return "world"; }',
          steps: [],
          totalUsage: { promptTokens: 50, completionTokens: 100 },
          finishReason: 'stop',
        } as any;
      }
      return {
        text: 'Code looks good. No issues found.',
        steps: [],
        totalUsage: { promptTokens: 30, completionTokens: 60 },
        finishReason: 'stop',
      } as any;
    });

    const record = await runWorkflow(SIMPLE_WORKFLOW_YAML, { task: 'hello world function' });

    expect(record.workflowName).toBe('simple-pipeline');
    expect(record.status).toBe('completed');
    expect(record.steps).toHaveLength(2);

    expect(record.steps[0].stepId).toBe('step1');
    expect(record.steps[0].output).toBe('function hello() { return "world"; }');
    expect(record.steps[0].status).toBe('completed');

    expect(record.steps[1].stepId).toBe('step2');
    expect(record.steps[1].status).toBe('completed');

    // Verify step2 prompt included step1 output
    const step2Call = mockedGenerateText.mock.calls[1][0];
    expect(step2Call.prompt).toContain('function hello() { return "world"; }');

    // Verify token usage tracked
    expect(record.steps[0].tokenUsage.totalTokens).toBe(150);
    expect(record.steps[1].tokenUsage.totalTokens).toBe(90);

    // Save and reload from storage
    storage.saveRun(record);
    const loaded = storage.getRun(record.runId);
    expect(loaded).not.toBeNull();
    expect(loaded!.workflowName).toBe('simple-pipeline');
    expect(loaded!.steps).toHaveLength(2);
    expect(loaded!.steps[0].output).toBe('function hello() { return "world"; }');
  });

  it('handles parallel steps correctly', async () => {
    const PARALLEL_YAML = `
name: parallel-pipeline
steps:
  - id: task_a
    agent: coder
    model: claude-sonnet-4-20250514
    prompt: "Task A"
    tools: [file_write]

  - id: task_b
    agent: coder
    model: claude-sonnet-4-20250514
    prompt: "Task B"
    tools: [file_write]

  - id: merge
    agent: coder
    model: claude-sonnet-4-20250514
    prompt: "Merge A: {{steps.task_a.output}} and B: {{steps.task_b.output}}"
    depends_on: [task_a, task_b]
    tools: [file_write]
`;

    mockedGenerateText.mockImplementation(async (opts: any) => {
      if (opts.prompt === 'Task A') return { text: 'result-a', steps: [], totalUsage: { promptTokens: 10, completionTokens: 10 }, finishReason: 'stop' } as any;
      if (opts.prompt === 'Task B') return { text: 'result-b', steps: [], totalUsage: { promptTokens: 10, completionTokens: 10 }, finishReason: 'stop' } as any;
      return { text: 'merged', steps: [], totalUsage: { promptTokens: 10, completionTokens: 10 }, finishReason: 'stop' } as any;
    });

    const record = await runWorkflow(PARALLEL_YAML, {});

    expect(record.status).toBe('completed');
    expect(record.steps).toHaveLength(3);

    const mergeCall = mockedGenerateText.mock.calls[2][0];
    expect(mergeCall.prompt).toContain('result-a');
    expect(mergeCall.prompt).toContain('result-b');
  });
});
