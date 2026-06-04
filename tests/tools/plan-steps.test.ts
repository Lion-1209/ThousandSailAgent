import { describe, it, expect } from 'vitest';
import { createPlanStepsTool } from '../../src/tools/plan-steps.js';

describe('createPlanStepsTool', () => {
  it('returns the plan as-is', async () => {
    const tool = createPlanStepsTool();
    const plan = {
      enabled: ['code', 'review'],
      disabled: ['test'],
      modifications: { code: { prompt: 'Use HAL library' } },
      new_steps: [
        { id: 'security', agent: 'reviewer', prompt: 'Security scan', tools: ['file_read'], depends_on: ['code'] },
      ],
    };
    const result = await tool.execute(plan);
    expect(result).toEqual({ success: true, plan });
  });

  it('has description mentioning workflow', () => {
    const tool = createPlanStepsTool();
    expect(tool.description).toContain('workflow');
  });
});
