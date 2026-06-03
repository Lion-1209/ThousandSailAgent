#!/usr/bin/env node
import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import pc from 'picocolors';
import { runWorkflow } from '../engine/runner.js';
import { RunStorage } from '../storage/sqlite.js';
import { interactiveSetup, listProviders, loadConfig, saveConfig, getApiKey, KNOWN_PROVIDERS, configureProvider, validateApiKey, setLocale, getLocale } from '../config/providers.js';

const DEFAULT_DB_PATH = path.join(process.cwd(), '.agentflow', 'history.db');

function getStorage(dbPath?: string): RunStorage {
  return new RunStorage(dbPath ?? DEFAULT_DB_PATH);
}

const program = new Command();

program
  .name('tsail')
  .description('ThousandSailAgent — 多 AI Agent 编排框架')
  .version('0.3.0');

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
      if (options.verbose) {
        if (step.toolCalls.length > 0) {
          console.log(pc.cyan(`    Tool calls (${step.toolCalls.length}):`));
          for (const tc of step.toolCalls) {
            const inputStr = JSON.stringify(tc.input ?? '');
            const outputStr = JSON.stringify(tc.output ?? '');
            console.log(pc.dim(`      ${pc.bold(tc.toolName)}`));
            console.log(pc.dim(`        input:  ${inputStr.length > 200 ? inputStr.slice(0, 200) + '...' : inputStr}`));
            console.log(pc.dim(`        output: ${outputStr.length > 200 ? outputStr.slice(0, 200) + '...' : outputStr}`));
          }
        }
        if (step.output) {
          console.log(pc.dim(`    Output: ${step.output.slice(0, 500)}${step.output.length > 500 ? '...' : ''}`));
        }
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
  .argument('[provider]', 'provider name to configure directly (e.g. deepseek)')
  .option('--lang <locale>', 'set interface language (zh/en)')
  .action(async (providerName?: string, options?: { lang?: string }) => {
    if (options?.lang) {
      const locale = options.lang === 'en' ? 'en' : 'zh';
      setLocale(locale);
      console.log(pc.green(`Language: ${locale === 'zh' ? '中文' : 'English'}`));
      return;
    }
    if (providerName) {
      const config = loadConfig();
      const template = KNOWN_PROVIDERS.find((t) => t.name === providerName);
      if (!template) {
        console.log(pc.red(`Unknown provider: "${providerName}"`));
        console.log(pc.dim(`Available: ${KNOWN_PROVIDERS.map((t) => t.name).join(', ')}`));
        process.exit(1);
      }
      await configureProvider(config, template);
      saveConfig(config);
    } else {
      await interactiveSetup();
    }
  });

program
  .command('providers')
  .description('List configured providers')
  .option('--test', 'verify API keys by making test calls')
  .action(async (options: { test?: boolean }) => {
    if (options.test) {
      const config = loadConfig();
      const entries = Object.entries(config.providers).filter(([, pr]) => pr.configured);
      if (entries.length === 0) {
        console.log(pc.yellow('没有已配置的 Provider'));
        return;
      }
      console.log(pc.bold('验证 API Keys...\n'));
      for (const [name, pr] of entries) {
        const template = KNOWN_PROVIDERS.find((t) => t.name === name);
        const apiKey = getApiKey(name);
        if (!apiKey) {
          console.log(pc.red(`  ✗ ${name} — 无法解密 API Key`));
          continue;
        }
        process.stdout.write(`  ${name} ... `);
        const result = await validateApiKey(name, apiKey, pr);
        if (result.valid) {
          console.log(pc.green('✓ 有效'));
        } else {
          console.log(pc.red(`✗ 失败 (${result.error})`));
        }
      }
    } else {
      listProviders();
    }
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
          console.log(`  ${step.stepId}: ${step.status} (tokens: ${step.tokenUsage.totalTokens})`);
          if (step.toolCalls.length > 0) {
            console.log(pc.cyan(`    Tool calls (${step.toolCalls.length}):`));
            for (const tc of step.toolCalls) {
              const inputStr = JSON.stringify(tc.input);
              const outputStr = JSON.stringify(tc.output);
              console.log(pc.dim(`      ${pc.bold(tc.toolName)}`));
              console.log(pc.dim(`        input:  ${inputStr.length > 200 ? inputStr.slice(0, 200) + '...' : inputStr}`));
              console.log(pc.dim(`        output: ${outputStr.length > 200 ? outputStr.slice(0, 200) + '...' : outputStr}`));
            }
          }
          if (step.output) {
            console.log(pc.dim(`    Output: ${step.output.slice(0, 300)}${step.output.length > 300 ? '...' : ''}`));
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
