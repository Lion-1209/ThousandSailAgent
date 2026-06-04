import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/agent/executor.js', () => ({
  executeStep: vi.fn(),
}));
vi.mock('../../src/agent/summarizer.js', () => ({
  summarizeIfNeeded: vi.fn((text: string) => Promise.resolve(text)),
  setSummaryProvider: vi.fn(),
}));
vi.mock('../../src/tools/file-read.js', () => ({ createFileReadTool: () => ({}) }));
vi.mock('../../src/tools/file-write.js', () => ({ createFileWriteTool: () => ({}) }));
vi.mock('../../src/tools/terminal.js', () => ({ createTerminalTool: () => ({}) }));
vi.mock('../../src/tools/human-input.js', () => ({ createHumanInputTool: () => ({}) }));
vi.mock('../../src/tools/set-route.js', () => ({ createSetRouteTool: () => ({}) }));
vi.mock('../../src/tools/plan-steps.js', () => ({ createPlanStepsTool: () => ({}) }));

import { applyPlan, extractPlan } from '../../src/engine/planner.js';

describe('runWorkflow with planner', () => {
  it('executes planner first and applies plan to remaining steps', async () => {
    const plan = {
      disabled: ['review'],
      modifications: { code: { prompt: 'Use HAL library' } },
    };

    const templateSteps = [
      { id: 'planner', agent: 'planner', model: 'deepseek/deepseek-chat', prompt: 'Plan', tools: ['plan_steps'], plan: true as const },
      { id: 'code', agent: 'coder', model: 'deepseek/deepseek-chat', prompt: 'Write code', tools: ['file_write'], depends_on: ['planner'] },
      { id: 'review', agent: 'reviewer', model: 'glm/glm-4-flash', prompt: 'Review', tools: ['file_read'], depends_on: ['code'], optional: true },
    ];

    const modifiedSteps = applyPlan(templateSteps, plan);
    expect(modifiedSteps.find(s => s.id === 'planner')).toBeUndefined();
    expect(modifiedSteps.find(s => s.id === 'review')).toBeUndefined();
    expect(modifiedSteps.find(s => s.id === 'code')?.prompt).toBe('Use HAL library');
  });

  it('extracts plan from tool calls', () => {
    const toolCalls = [
      { toolName: 'plan_steps', input: { disabled: ['test'], modifications: { code: { prompt: 'New prompt' } } } },
    ];
    const plan = extractPlan(toolCalls);
    expect(plan?.disabled).toEqual(['test']);
    expect(plan?.modifications?.code?.prompt).toBe('New prompt');
  });

  it('returns null when no plan_steps call found', () => {
    const toolCalls = [
      { toolName: 'file_read', input: { path: 'test.ts' } },
    ];
    expect(extractPlan(toolCalls)).toBeNull();
  });
});
