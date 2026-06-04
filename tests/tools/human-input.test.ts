import { describe, it, expect, vi } from 'vitest';

vi.mock('readline/promises', () => ({
  createInterface: vi.fn(() => ({
    question: vi.fn().mockResolvedValue('STM32'),
    close: vi.fn(),
  })),
}));

import { createHumanInputTool } from '../../src/tools/human-input.js';

describe('createHumanInputTool', () => {
  it('returns user input from readline', async () => {
    const tool = createHumanInputTool();
    const result = await tool.execute({ question: '目标平台是什么？' });
    expect(result).toBe('STM32');
  });

  it('has description mentioning user question', () => {
    const tool = createHumanInputTool();
    expect(tool.description).toContain('user');
  });
});
