import { describe, it, expect } from 'vitest';
import { applyPlan } from '../../src/engine/planner.js';
import type { StepDefinition } from '../../src/types/workflow.js';

function makeStep(overrides: Partial<StepDefinition> & { id: string }): StepDefinition {
  return {
    agent: 'coder',
    model: 'deepseek/deepseek-chat',
    prompt: 'Do task',
    tools: ['file_read'],
    ...overrides,
  };
}

describe('applyPlan', () => {
  const templateSteps: StepDefinition[] = [
    makeStep({ id: 'planner', plan: true, prompt: 'Plan', tools: ['plan_steps'] }),
    makeStep({ id: 'code', prompt: 'Write code', tools: ['file_write'], depends_on: ['planner'] }),
    makeStep({ id: 'review', prompt: 'Review', tools: ['file_read'], depends_on: ['code'], optional: true }),
    makeStep({ id: 'test', prompt: 'Test', tools: ['terminal'], depends_on: ['code'], optional: true }),
  ];

  it('disables optional steps listed in disabled array', () => {
    const plan = { disabled: ['test'] };
    const result = applyPlan(templateSteps, plan);
    const ids = result.map(s => s.id);
    expect(ids).toContain('code');
    expect(ids).toContain('review');
    expect(ids).not.toContain('test');
  });

  it('keeps all steps when no plan changes', () => {
    const plan = {};
    const result = applyPlan(templateSteps, plan);
    expect(result.map(s => s.id)).toEqual(['code', 'review', 'test']);
  });

  it('applies prompt modifications', () => {
    const plan = { modifications: { code: { prompt: 'Use HAL library' } } };
    const result = applyPlan(templateSteps, plan);
    const codeStep = result.find(s => s.id === 'code');
    expect(codeStep?.prompt).toBe('Use HAL library');
  });

  it('adds new steps', () => {
    const plan = {
      new_steps: [
        { id: 'security', agent: 'reviewer', prompt: 'Security scan', tools: ['file_read'], depends_on: ['code'] },
      ],
    };
    const result = applyPlan(templateSteps, plan);
    const security = result.find(s => s.id === 'security');
    expect(security).toBeDefined();
    expect(security?.prompt).toBe('Security scan');
  });

  it('removes planner step from output', () => {
    const plan = {};
    const result = applyPlan(templateSteps, plan);
    expect(result.find(s => s.id === 'planner')).toBeUndefined();
  });

  it('handles combined enable/disable/modify/add', () => {
    const plan = {
      disabled: ['review'],
      modifications: { code: { prompt: 'Modified code step' } },
      new_steps: [
        { id: 'deploy', agent: 'coder', prompt: 'Deploy', tools: ['terminal'], depends_on: ['test'] },
      ],
    };
    const result = applyPlan(templateSteps, plan);
    const ids = result.map(s => s.id);
    expect(ids).not.toContain('planner');
    expect(ids).not.toContain('review');
    expect(ids).toContain('code');
    expect(ids).toContain('test');
    expect(ids).toContain('deploy');
    const codeStep = result.find(s => s.id === 'code');
    expect(codeStep?.prompt).toBe('Modified code step');
  });

  it('replaces dependencies that reference removed steps with the removed step\'s dependencies', () => {
    const steps: StepDefinition[] = [
      makeStep({ id: 'planner', plan: true, tools: ['plan_steps'] }),
      makeStep({ id: 'code', depends_on: ['planner'] }),
      makeStep({ id: 'review', depends_on: ['code'], optional: true }),
      makeStep({ id: 'deploy', depends_on: ['review'] }),
    ];
    const plan = { disabled: ['review'] };
    const result = applyPlan(steps, plan);
    const deploy = result.find(s => s.id === 'deploy');
    // deploy depended on review (removed), should now depend on review's dependency (code)
    expect(deploy?.depends_on).toEqual(['code']);
  });
});
