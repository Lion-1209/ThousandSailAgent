import { describe, it, expect, afterEach } from 'vitest';
import { RunStorage } from '../../src/storage/sqlite.js';
import type { RunRecord, StepRecord } from '../../src/types/execution.js';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

let dbPath: string;
let storage: RunStorage;

function createTestStorage(): RunStorage {
  dbPath = path.join(os.tmpdir(), `agentflow-test-${Date.now()}.db`);
  storage = new RunStorage(dbPath);
  return storage;
}

afterEach(() => {
  storage?.close();
  if (dbPath && fs.existsSync(dbPath)) {
    fs.unlinkSync(dbPath);
  }
});

function makeRun(overrides?: Partial<RunRecord>): RunRecord {
  return {
    runId: 'test-run-1',
    workflowName: 'test-workflow',
    status: 'completed',
    input: { task: 'test' },
    steps: [],
    startedAt: '2026-06-02T00:00:00.000Z',
    completedAt: '2026-06-02T00:01:00.000Z',
    ...overrides,
  };
}

describe('RunStorage', () => {
  it('saves and retrieves a run by ID', () => {
    const s = createTestStorage();
    const run = makeRun();
    s.saveRun(run);
    const loaded = s.getRun('test-run-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.runId).toBe('test-run-1');
    expect(loaded!.workflowName).toBe('test-workflow');
    expect(loaded!.input).toEqual({ task: 'test' });
  });

  it('returns null for nonexistent run', () => {
    const s = createTestStorage();
    expect(s.getRun('nonexistent')).toBeNull();
  });

  it('lists runs sorted by start time descending', () => {
    const s = createTestStorage();
    s.saveRun(makeRun({ runId: 'r1', startedAt: '2026-06-01T00:00:00.000Z' }));
    s.saveRun(makeRun({ runId: 'r2', startedAt: '2026-06-02T00:00:00.000Z' }));
    s.saveRun(makeRun({ runId: 'r3', startedAt: '2026-06-01T12:00:00.000Z' }));
    const list = s.listRuns();
    expect(list.map((r) => r.runId)).toEqual(['r2', 'r3', 'r1']);
  });

  it('saves and retrieves steps within a run', () => {
    const s = createTestStorage();
    const steps: StepRecord[] = [
      {
        stepId: 'code',
        status: 'completed',
        output: 'function hello() {}',
        toolCalls: [{ toolName: 'file_write', input: { path: 'a.ts' }, output: { success: true } }],
        startedAt: '2026-06-02T00:00:00.000Z',
        completedAt: '2026-06-02T00:00:30.000Z',
        tokenUsage: { promptTokens: 100, completionTokens: 200, totalTokens: 300 },
        error: null,
      },
    ];
    const run = makeRun({ steps });
    s.saveRun(run);
    const loaded = s.getRun('test-run-1');
    expect(loaded!.steps).toHaveLength(1);
    expect(loaded!.steps[0].stepId).toBe('code');
    expect(loaded!.steps[0].toolCalls).toHaveLength(1);
  });

  it('limits list results', () => {
    const s = createTestStorage();
    for (let i = 0; i < 5; i++) {
      s.saveRun(makeRun({ runId: `r${i}`, startedAt: `2026-06-0${i + 1}T00:00:00.000Z` }));
    }
    expect(s.listRuns(3)).toHaveLength(3);
  });
});
