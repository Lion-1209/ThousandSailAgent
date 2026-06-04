import { describe, it, expect } from 'vitest';
import { evaluateCondition } from '../../src/engine/evaluator.js';

describe('evaluateCondition', () => {
  const context = {
    input: { language: 'typescript', count: '5' },
    stepOutputs: {
      review: 'LGTM',
      test: '3 passed, 1 failed',
    },
    stepStatuses: {
      review: 'completed' as const,
      test: 'failed' as const,
    },
  };

  it('returns true when no condition is provided', () => {
    expect(evaluateCondition(undefined, context)).toBe(true);
  });

  it('checks input equality with ==', () => {
    expect(evaluateCondition('input.language == "typescript"', context)).toBe(true);
    expect(evaluateCondition('input.language == "python"', context)).toBe(false);
  });

  it('checks input inequality with !=', () => {
    expect(evaluateCondition('input.language != "python"', context)).toBe(true);
    expect(evaluateCondition('input.language != "typescript"', context)).toBe(false);
  });

  it('checks step status', () => {
    expect(evaluateCondition('steps.test.status == "failed"', context)).toBe(true);
    expect(evaluateCondition('steps.review.status == "completed"', context)).toBe(true);
  });

  it('checks step output contains text', () => {
    expect(evaluateCondition('steps.review.output contains "LGTM"', context)).toBe(true);
    expect(evaluateCondition('steps.test.output contains "passed"', context)).toBe(true);
    expect(evaluateCondition('steps.test.output contains "error"', context)).toBe(false);
  });

  it('supports AND (&&) operator', () => {
    expect(evaluateCondition('input.language == "typescript" && steps.test.status == "failed"', context)).toBe(true);
    expect(evaluateCondition('input.language == "python" && steps.test.status == "failed"', context)).toBe(false);
  });

  it('supports OR (||) operator', () => {
    expect(evaluateCondition('input.language == "python" || steps.test.status == "failed"', context)).toBe(true);
    expect(evaluateCondition('input.language == "python" || steps.review.status == "failed"', context)).toBe(false);
  });

  it('supports NOT (!) prefix', () => {
    expect(evaluateCondition('!(input.language == "python")', context)).toBe(true);
    expect(evaluateCondition('!(input.language == "typescript")', context)).toBe(false);
  });

  it('returns false for unresolved references', () => {
    expect(evaluateCondition('input.unknown == "anything"', context)).toBe(false);
    expect(evaluateCondition('steps.nonexistent.status == "completed"', context)).toBe(false);
  });

  it('throws on syntax error', () => {
    expect(() => evaluateCondition('!!invalid!!', context)).toThrow();
  });
});
