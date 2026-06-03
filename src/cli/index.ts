#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { runWorkflow } from '../engine/runner.js';
import { RunStorage } from '../storage/sqlite.js';
import { interactiveSetup, listProviders } from '../config/providers.js';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.agentflow', 'history.db');

function getStorage(dbPath?: string): RunStorage {
  return new RunStorage(dbPath ?? DEFAULT_DB_PATH);
}

const program = new Command();

program
  .name('tsail')
  .description('ThousandSailAgent — 多 AI Agent 编排框架')
  .version('0.1.1');

program
  .command('run')
  .description('Run a workflow from a YAML file')
  .argument('<file>', 'path to workflow YAML file')
  .option('-i, --input <key=value...>', 'input parameters as key=value pairs')
  .option('-d, --db <path>', 'database path', DEFAULT_DB_PATH)
  .option('--verbose', 'show detailed output')
  .action(async (file: string, options: { input?: string[]; db?: string; verbose?: boolean }) => {
    const yamlContent = fs.readFileSync(file, 'utf-8');
    const input: Record<string, string> = {};
    for (const pair of options.input ?? []) {
      const eqIdx = pair.indexOf('=');
      if (eqIdx === -1) {
        console.error(pc.red(`Invalid input format: "${pair}". Use key=value`));
        process.exit(1);
      }
      input[pair.slice(0, eqIdx)] = pair.slice(eqIdx + 1);
    }

    console.log(pc.cyan('Starting workflow...'));
    const startTime = Date.now();

    const record = await runWorkflow(yamlContent, input);

    // Save to storage
    const storage = getStorage(options.db);
    await storage.saveRun(record);
    storage.close();

    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

    // Print results
    console.log(pc.bold(`\nWorkflow: ${record.workflowName}`));
    console.log(`Run ID: ${record.runId}`);
    console.log(`Status: ${record.status === 'completed' ? pc.green('completed') : pc.red('failed')}`);
    console.log(`Time: ${elapsed}s\n`);

    for (const step of record.steps) {
      const icon = step.status === 'completed' ? pc.green('✓') : step.status === 'skipped' ? pc.yellow('⊘') : pc.red('✗');
      console.log(`  ${icon} ${step.stepId} (${step.status})`);
      if (options.verbose && step.output) {
        console.log(pc.dim(`    Output: ${step.output.slice(0, 200)}${step.output.length > 200 ? '...' : ''}`));
      }
      if (step.error) {
        console.log(pc.red(`    Error: ${step.error}`));
      }
    }

    const totalTokens = record.steps.reduce((sum, s) => sum + s.tokenUsage.totalTokens, 0);
    console.log(pc.dim(`\nTotal tokens: ${totalTokens}`));
  });

program
  .command('config')
  .description('Configure LLM providers and API keys')
  .action(async () => {
    await interactiveSetup();
  });

program
  .command('providers')
  .description('List configured providers')
  .action(() => {
    listProviders();
  });

program
  .command('list')
  .description('List available workflow files in current directory')
  .action(() => {
    const files = fs.readdirSync(process.cwd()).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
    if (files.length === 0) {
      console.log(pc.yellow('No workflow files found in current directory.'));
      return;
    }
    console.log(pc.bold('Workflow files:'));
    for (const f of files) {
      console.log(`  ${f}`);
    }
  });

program
  .command('history')
  .description('Show run history')
  .argument('[run-id]', 'specific run ID to inspect')
  .option('-n, --limit <count>', 'max records to show', '20')
  .option('-d, --db <path>', 'database path', DEFAULT_DB_PATH)
  .action(async (runId: string | undefined, options: { limit: string; db: string }) => {
    const storage = getStorage(options.db);
    try {
      if (runId) {
        const run = await storage.getRun(runId);
        if (!run) {
          console.log(pc.yellow(`Run "${runId}" not found.`));
          return;
        }
        console.log(pc.bold(`Run: ${run.runId}`));
        console.log(`Workflow: ${run.workflowName}`);
        console.log(`Status: ${run.status}`);
        console.log(`Started: ${run.startedAt}`);
        console.log(`Input: ${JSON.stringify(run.input)}\n`);
        for (const step of run.steps) {
          console.log(`  ${step.stepId}: ${step.status}`);
          if (step.output) {
            console.log(pc.dim(`    ${step.output.slice(0, 200)}`));
          }
        }
      } else {
        const runs = await storage.listRuns(parseInt(options.limit, 10));
        if (runs.length === 0) {
          console.log(pc.yellow('No runs found.'));
          return;
        }
        console.log(pc.bold('Recent runs:'));
        for (const r of runs) {
          const icon = r.status === 'completed' ? pc.green('✓') : pc.red('✗');
          console.log(`  ${icon} ${r.runId} ${pc.dim(r.workflowName)} ${r.startedAt}`);
        }
      }
    } finally {
      storage.close();
    }
  });

await program.parseAsync();
