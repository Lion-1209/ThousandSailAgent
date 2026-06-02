import { describe, it, expect } from 'vitest';
import { buildDag, type DagNode } from '../../src/parser/dag-builder.js';
import type { StepDefinition } from '../../src/types/workflow.js';

const steps: StepDefinition[] = [
  { id: 'code', agent: 'coder', model: 'gpt-4o', prompt: 'write', tools: ['file_write'] },
  { id: 'review', agent: 'reviewer', model: 'gpt-4o', prompt: 'review', tools: ['file_read'], depends_on: ['code'] },
  { id: 'test', agent: 'tester', model: 'gpt-4o', prompt: 'test', tools: ['terminal'], depends_on: ['code'] },
  { id: 'refine', agent: 'coder', model: 'gpt-4o', prompt: 'fix', tools: ['file_write'], depends_on: ['review', 'test'] },
];

describe('buildDag', () => {
  it('returns topological execution order', () => {
    const dag = buildDag(steps);
    const order = dag.getExecutionOrder();
    const codeIdx = order.indexOf('code');
    const reviewIdx = order.indexOf('review');
    const testIdx = order.indexOf('test');
    const refineIdx = order.indexOf('refine');
    expect(codeIdx).toBeLessThan(reviewIdx);
    expect(codeIdx).toBeLessThan(testIdx);
    expect(reviewIdx).toBeLessThan(refineIdx);
    expect(testIdx).toBeLessThan(refineIdx);
  });

  it('identifies parallel-ready steps (no mutual dependency)', () => {
    const dag = buildDag(steps);
    const parallelGroups = dag.getParallelGroups();
    expect(parallelGroups).toEqual([
      ['code'],
      expect.arrayContaining(['review', 'test']),
      ['refine'],
    ]);
  });

  it('throws on cycle detection', () => {
    const cyclic: StepDefinition[] = [
      { id: 'a', agent: 'x', model: 'gpt-4o', prompt: 'a', tools: ['file_read'], depends_on: ['b'] },
      { id: 'b', agent: 'x', model: 'gpt-4o', prompt: 'b', tools: ['file_read'], depends_on: ['a'] },
    ];
    expect(() => buildDag(cyclic)).toThrow(/cycle/i);
  });

  it('throws on missing dependency', () => {
    const bad: StepDefinition[] = [
      { id: 'a', agent: 'x', model: 'gpt-4o', prompt: 'a', tools: ['file_read'], depends_on: ['nonexistent'] },
    ];
    expect(() => buildDag(bad)).toThrow(/not found/i);
  });

  it('handles single-step workflow', () => {
    const single: StepDefinition[] = [
      { id: 'only', agent: 'x', model: 'gpt-4o', prompt: 'do it', tools: ['file_read'] },
    ];
    const dag = buildDag(single);
    expect(dag.getExecutionOrder()).toEqual(['only']);
    expect(dag.getParallelGroups()).toEqual([['only']]);
  });
});
