import initSqlJs from 'sql.js';
import type { RunRecord, StepRecord, StepStatus, ToolCallRecord } from '../types/execution.js';
import fs from 'node:fs';
import path from 'node:path';

type SqlJsDb = any;

let SQL: any = null;

async function getSqlJs() {
  if (!SQL) {
    SQL = await initSqlJs();
  }
  return SQL;
}

export class RunStorage {
  private db!: SqlJsDb;
  private dbPath: string;
  private ready: Promise<void>;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const SQL = await getSqlJs();

    if (fs.existsSync(this.dbPath)) {
      const buf = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buf);
    } else {
      this.db = new SQL.Database();
    }
    this.migrate();
  }

  private migrate(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS runs (
        run_id TEXT PRIMARY KEY,
        workflow_name TEXT NOT NULL,
        status TEXT NOT NULL,
        input TEXT NOT NULL,
        started_at TEXT NOT NULL,
        completed_at TEXT
      );
    `);
    this.db.run(`
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

  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data as ArrayBuffer);
    fs.writeFileSync(this.dbPath, buffer);
  }

  async saveRun(run: RunRecord): Promise<void> {
    await this.ready;
    this.db.run(
      `INSERT OR REPLACE INTO runs (run_id, workflow_name, status, input, started_at, completed_at) VALUES (?, ?, ?, ?, ?, ?)`,
      [run.runId, run.workflowName, run.status, JSON.stringify(run.input), run.startedAt, run.completedAt]
    );
    this.db.run('DELETE FROM steps WHERE run_id = ?', [run.runId]);
    for (const step of run.steps) {
      this.db.run(
        `INSERT INTO steps (run_id, step_id, status, output, tool_calls, started_at, completed_at, prompt_tokens, completion_tokens, total_tokens, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [run.runId, step.stepId, step.status, step.output, JSON.stringify(step.toolCalls), step.startedAt, step.completedAt, step.tokenUsage.promptTokens, step.tokenUsage.completionTokens, step.tokenUsage.totalTokens, step.error]
      );
    }
    this.save();
  }

  async getRun(runId: string): Promise<RunRecord | null> {
    await this.ready;
    const results = this.db.exec('SELECT * FROM runs WHERE run_id = ?', [runId]);
    if (!results[0] || !results[0].values[0]) return null;

    const runObj = this.zipObject(results[0].columns, results[0].values[0]);

    const stepResults = this.db.exec('SELECT * FROM steps WHERE run_id = ? ORDER BY id', [runId]);
    const steps: StepRecord[] = stepResults[0]
      ? stepResults[0].values.map((row: any[]) => this.rowToStep(this.zipObject(stepResults[0].columns, row)))
      : [];

    return {
      runId: runObj.run_id as string,
      workflowName: runObj.workflow_name as string,
      status: runObj.status as StepStatus,
      input: JSON.parse(runObj.input as string),
      steps,
      startedAt: runObj.started_at as string,
      completedAt: runObj.completed_at as string | null,
    };
  }

  async listRuns(limit = 50): Promise<Pick<RunRecord, 'runId' | 'workflowName' | 'status' | 'startedAt' | 'completedAt'>[]> {
    await this.ready;
    const result = this.db.exec('SELECT run_id, workflow_name, status, started_at, completed_at FROM runs ORDER BY started_at DESC LIMIT ?', [limit]);
    if (!result[0]) return [];

    return result[0].values.map((row: any[]) => {
      const obj = this.zipObject(result[0].columns, row);
      return {
        runId: obj.run_id as string,
        workflowName: obj.workflow_name as string,
        status: obj.status as StepStatus,
        startedAt: obj.started_at as string,
        completedAt: obj.completed_at as string | null,
      };
    });
  }

  private rowToStep(obj: Record<string, any>): StepRecord {
    return {
      stepId: obj.step_id as string,
      status: obj.status as StepStatus,
      output: obj.output as string,
      toolCalls: JSON.parse(obj.tool_calls as string) as ToolCallRecord[],
      startedAt: obj.started_at as string,
      completedAt: obj.completed_at as string | null,
      tokenUsage: {
        promptTokens: obj.prompt_tokens as number,
        completionTokens: obj.completion_tokens as number,
        totalTokens: obj.total_tokens as number,
      },
      error: obj.error as string | null,
    };
  }

  private zipObject(keys: string[], values: any[]): Record<string, any> {
    const obj: Record<string, any> = {};
    for (let i = 0; i < keys.length; i++) {
      obj[keys[i]] = values[i];
    }
    return obj;
  }

  close(): void {
    this.save();
    this.db.close();
  }
}
