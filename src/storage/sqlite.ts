import Database from 'better-sqlite3';
import type { RunRecord, StepRecord, ToolCallRecord } from '../types/execution.js';
import fs from 'node:fs';
import path from 'node:path';

export class RunStorage {
  private db: Database.Database;

  constructor(dbPath: string) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.migrate();
  }

  private migrate(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );

      CREATE TABLE IF NOT EXISTS steps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id TEXT NOT NULL,
        step_id TEXT NOT NULL,
        status TEXT NOT NULL,
        output TEXT NOT NULL DEFAULT '',
        tool_calls TEXT NOT NULL DEFAULT '[]',
        started_at TEXT NOT NULL DEFAULT '',
        completed_at TEXT,
        prompt_tokens INTEGER NOT NULL DEFAULT 0,
        completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        error TEXT,
        FOREIGN KEY (run_id) REFERENCES runs(run_id)
      );
    `);
  }

  saveRun(run: RunRecord): void {
    const insertRun = this.db.prepare(`
      INSERT OR REPLACE INTO runs (run_id, workflow_name, status, input, started_at, completed_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const deleteSteps = this.db.prepare('DELETE FROM steps WHERE run_id = ?');
    const insertStep = this.db.prepare(`
      INSERT INTO steps (run_id, step_id, status, output, tool_calls, started_at, completed_at,
                         prompt_tokens, completion_tokens, total_tokens, error)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      insertRun.run(
        run.runId,
        run.workflowName,
        run.status,
        JSON.stringify(run.input),
        run.startedAt,
        run.completedAt
      );
      // Clear old steps so INSERT OR REPLACE on runs doesn't leave stale steps
      deleteSteps.run(run.runId);
      for (const step of run.steps) {
        insertStep.run(
          run.runId,
          step.stepId,
          step.status,
          step.output,
          JSON.stringify(step.toolCalls),
          step.startedAt,
          step.completedAt,
          step.tokenUsage.promptTokens,
          step.tokenUsage.completionTokens,
          step.tokenUsage.totalTokens,
          step.error
        );
      }
    });
    transaction();
  }

  getRun(runId: string): RunRecord | null {
    const run = this.db.prepare('SELECT * FROM runs WHERE run_id = ?').get(runId) as any;
    if (!run) return null;

    const steps = (this.db.prepare('SELECT * FROM steps WHERE run_id = ? ORDER BY id')
      .all(runId) as any[])
      .map(this.rowToStep);

    return {
      runId: run.run_id,
      workflowName: run.workflow_name,
      status: run.status,
      input: JSON.parse(run.input),
      steps,
      startedAt: run.started_at,
      completedAt: run.completed_at,
    };
  }

  listRuns(limit = 50): Pick<RunRecord, 'runId' | 'workflowName' | 'status' | 'startedAt' | 'completedAt'>[] {
    return (this.db
      .prepare('SELECT run_id, workflow_name, status, started_at, completed_at FROM runs ORDER BY started_at DESC LIMIT ?')
      .all(limit) as any[])
      .map((r: any) => ({
        runId: r.run_id,
        workflowName: r.workflow_name,
        status: r.status,
        startedAt: r.started_at,
        completedAt: r.completed_at,
      }));
  }

  private rowToStep(row: any): StepRecord {
    return {
      stepId: row.step_id,
      status: row.status,
      output: row.output,
      toolCalls: JSON.parse(row.tool_calls) as ToolCallRecord[],
      startedAt: row.started_at,
      completedAt: row.completed_at,
      tokenUsage: {
        promptTokens: row.prompt_tokens,
        completionTokens: row.completion_tokens,
        totalTokens: row.total_tokens,
      },
      error: row.error,
    };
  }

  close(): void {
    this.db.close();
  }
}
