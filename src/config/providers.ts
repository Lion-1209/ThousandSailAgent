import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import readline from 'node:readline';

// ── Stored provider entry (includes encrypted API key) ──

export interface StoredProvider {
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
  /** Encrypted API key */
  api_key_encrypted?: string;
  /** Whether this provider has been configured */
  configured: boolean;
}

export interface ProviderConfigFile {
  providers: Record<string, StoredProvider>;
}

// ── Known provider templates ──

export interface ProviderTemplate {
  name: string;
  description: string;
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
  default_model?: string;
}

export const KNOWN_PROVIDERS: ProviderTemplate[] = [
  {
    name: 'deepseek',
    description: 'DeepSeek (深度求索)',
    type: 'openai-compatible',
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-chat',
  },
  {
    name: 'glm',
    description: '智谱 GLM (ChatGLM)',
    type: 'openai-compatible',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    default_model: 'glm-4-flash',
  },
  {
    name: 'qwen',
    description: '通义千问 (Qwen)',
    type: 'openai-compatible',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen-plus',
  },
  {
    name: 'moonshot',
    description: 'Moonshot (月之暗面/Kimi)',
    type: 'openai-compatible',
    base_url: 'https://api.moonshot.cn/v1',
    default_model: 'moonshot-v1-8k',
  },
  {
    name: 'doubao',
    description: '豆包 (火山引擎)',
    type: 'openai-compatible',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    default_model: 'doubao-pro-32k',
  },
  {
    name: 'anthropic',
    description: 'Anthropic (Claude)',
    type: 'anthropic',
    default_model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'openai',
    description: 'OpenAI (GPT)',
    type: 'openai-compatible',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o',
  },
];

// ── Config file path ──

function getConfigDir(): string {
  return path.join(os.homedir(), '.agentflow');
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), 'providers.json');
}

// ── Simple encryption (obfuscation, not security — keeps keys out of plain text) ──

const ENCRYPT_KEY = 'agentflow-provider-key-v1';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const key = crypto.createHash('sha256').update(ENCRYPT_KEY).digest();
  const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decrypt(encrypted: string): string {
  const [ivHex, data] = encrypted.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const key = crypto.createHash('sha256').update(ENCRYPT_KEY).digest();
  const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
  let decrypted = decipher.update(data, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── Read / Write config ──

export function loadConfig(): ProviderConfigFile {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return { providers: {} };
  }
  try {
    const data = fs.readFileSync(configPath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return { providers: {} };
  }
}

export function saveConfig(config: ProviderConfigFile): void {
  const configDir = getConfigDir();
  fs.mkdirSync(configDir, { recursive: true });
  fs.writeFileSync(getConfigPath(), JSON.stringify(config, null, 2), 'utf-8');
}

/** Get decrypted API key for a configured provider */
export function getApiKey(providerName: string): string | null {
  const config = loadConfig();
  const provider = config.providers[providerName];
  if (!provider?.api_key_encrypted) return null;
  try {
    return decrypt(provider.api_key_encrypted);
  } catch {
    return null;
  }
}

// ── Interactive setup ──

function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

function askSecret(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    // Hide input
    const stdin = process.stdin;
    const onData = (char: Buffer) => {
      const c = char.toString();
      if (c === '\n' || c === '\r') {
        stdin.removeListener('data', onData);
      } else if (c === '\u0003') {
        // Ctrl+C
        process.exit();
      } else {
        // Backspace: clear the * we just printed
        if (c === '\b' || c === '\x7f') {
          process.stdout.clearLine(0);
          process.stdout.cursorTo(0);
          process.stdout.write(question);
        } else {
          process.stdout.write('*');
        }
      }
    };
    process.stdout.write(question);
    stdin.on('data', onData);
    rl.question('', (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer.trim());
    });
  });
}

export async function interactiveSetup(): Promise<void> {
  const pc = await import('picocolors');

  console.log(pc.default.bold('\n  AgentFlow Provider Configuration\n'));
  console.log(pc.default.dim('  Select providers to configure. API keys are stored locally.\n'));

  // Show numbered list
  KNOWN_PROVIDERS.forEach((p, i) => {
    console.log(`  ${pc.default.green(`${i + 1}`)}  ${pc.default.bold(p.name.padEnd(12))} ${pc.default.dim(p.description)}`);
  });
  console.log(`  ${pc.default.green(`0`)}  ${pc.default.bold('Custom'.padEnd(12))} ${pc.default.dim('Enter base_url manually')}`);
  console.log();

  // Load existing config
  const config = loadConfig();

  while (true) {
    const choice = await ask(pc.default.cyan('  Select provider (number, or q to finish): '));

    if (choice === 'q' || choice === 'quit' || choice === 'exit') break;
    if (choice === '') continue;

    const num = parseInt(choice, 10);

    let template: ProviderTemplate | undefined;
    let providerName: string;

    if (num === 0) {
      // Custom provider
      providerName = await ask('  Provider name: ');
      if (!providerName) continue;
      const baseUrl = await ask('  Base URL: ');
      providerName = providerName.toLowerCase().replace(/\s+/g, '-');
      template = {
        name: providerName,
        description: `Custom (${baseUrl})`,
        type: 'openai-compatible',
        base_url: baseUrl || undefined,
      };
    } else if (num >= 1 && num <= KNOWN_PROVIDERS.length) {
      template = KNOWN_PROVIDERS[num - 1];
      providerName = template.name;
    } else {
      console.log(pc.default.red('  Invalid choice.'));
      continue;
    }

    // Check if already configured
    const existing = config.providers[providerName];
    if (existing?.configured) {
      const overwrite = await ask(`  ${providerName} is already configured. Overwrite? (y/N): `);
      if (overwrite.toLowerCase() !== 'y') continue;
    }

    // Ask for API key
    const apiKey = await askSecret(`  Enter API key for ${pc.default.bold(template.description)}: `);
    if (!apiKey) {
      console.log(pc.default.yellow('  Skipped (no key entered).\n'));
      continue;
    }

    config.providers[providerName] = {
      type: template.type,
      base_url: template.base_url,
      api_key_encrypted: encrypt(apiKey),
      configured: true,
    };

    console.log(pc.default.green(`  ✓ ${providerName} configured!\n`));
  }

  saveConfig(config);

  const configuredCount = Object.values(config.providers).filter((p) => p.configured).length;
  if (configuredCount > 0) {
    console.log(pc.default.green(`\n  ✓ ${configuredCount} provider(s) configured. Saved to ${getConfigPath()}\n`));
  } else {
    console.log(pc.default.yellow('\n  No providers configured.\n'));
  }
}

export function listProviders(): void {
  const config = loadConfig();
  const entries = Object.entries(config.providers);

  if (entries.length === 0) {
    console.log('No providers configured. Run "agentflow config" to set up.');
    return;
  }

  console.log('\nConfigured providers:\n');
  for (const [name, p] of entries) {
    const status = p.configured ? '✓' : '✗';
    const type = p.type === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible';
    console.log(`  ${status} ${name.padEnd(12)} ${type.padEnd(18)} ${p.base_url ?? '(default)'}`);
  }
  console.log();
}
