import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import * as p from '@clack/prompts';

// ── Stored provider entry (includes encrypted API key) ──

export interface StoredProvider {
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
  api_key_encrypted?: string;
  configured: boolean;
}

export interface ProviderConfigFile {
  providers: Record<string, StoredProvider>;
}

// ── Known provider templates ──

export interface ProviderTemplate {
  name: string;
  label: string;
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
  default_model?: string;
}

export const KNOWN_PROVIDERS: ProviderTemplate[] = [
  {
    name: 'deepseek',
    label: 'DeepSeek（深度求索）',
    type: 'openai-compatible',
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-chat',
  },
  {
    name: 'glm',
    label: '智谱 GLM（ChatGLM）',
    type: 'openai-compatible',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    default_model: 'glm-4-flash',
  },
  {
    name: 'qwen',
    label: '通义千问（Qwen）',
    type: 'openai-compatible',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen-plus',
  },
  {
    name: 'moonshot',
    label: 'Moonshot（Kimi）',
    type: 'openai-compatible',
    base_url: 'https://api.moonshot.cn/v1',
    default_model: 'moonshot-v1-8k',
  },
  {
    name: 'doubao',
    label: '豆包（火山引擎）',
    type: 'openai-compatible',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    default_model: 'doubao-pro-32k',
  },
  {
    name: 'anthropic',
    label: 'Anthropic（Claude）',
    type: 'anthropic',
    default_model: 'claude-sonnet-4-20250514',
  },
  {
    name: 'openai',
    label: 'OpenAI（GPT）',
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

// ── Simple encryption ──

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

// ── Interactive TUI setup ──

export async function interactiveSetup(): Promise<void> {
  console.clear();
  p.intro('AgentFlow Provider 配置');

  const config = loadConfig();

  // Build select options
  const options: { value: string; label: string; hint?: string }[] = KNOWN_PROVIDERS.map((t) => ({
    value: t.name,
    label: t.label,
    hint: config.providers[t.name]?.configured ? '已配置 ✓' : undefined,
  }));
  options.push({ value: '__custom__', label: '自定义 Provider', hint: '输入 base_url' });
  options.push({ value: '__done__', label: '完成配置', hint: '保存并退出' });

  // Keep asking until user selects "done"
  while (true) {
    const selection = await p.select({
      message: '选择要配置的 Provider',
      options,
    });

    if (p.isCancel(selection) || selection === '__done__') {
      break;
    }

    if (selection === '__custom__') {
      await configureCustom(config);
      // Refresh hints
      for (const opt of options) {
        if (opt.value !== '__custom__' && opt.value !== '__done__') {
          opt.hint = config.providers[opt.value]?.configured ? '已配置 ✓' : undefined;
        }
      }
      continue;
    }

    const template = KNOWN_PROVIDERS.find((t) => t.name === selection);
    if (!template) continue;

    await configureKnownProvider(config, template);

    // Refresh hints
    for (const opt of options) {
      if (opt.value !== '__custom__' && opt.value !== '__done__') {
        opt.hint = config.providers[opt.value]?.configured ? '已配置 ✓' : undefined;
      }
    }
  }

  saveConfig(config);

  const configuredCount = Object.values(config.providers).filter((pr) => pr.configured).length;
  if (configuredCount > 0) {
    p.outro(`已配置 ${configuredCount} 个 Provider → ${getConfigPath()}`);
  } else {
    p.outro('未配置任何 Provider');
  }
}

async function configureKnownProvider(config: ProviderConfigFile, template: ProviderTemplate): Promise<void> {
  const existing = config.providers[template.name];
  if (existing?.configured) {
    const overwrite = await p.confirm({
      message: `${template.label} 已配置，是否覆盖？`,
      initialValue: false,
    });
    if (p.isCancel(overwrite) || !overwrite) return;
  }

  const apiKey = await p.password({
    message: `输入 ${template.label} 的 API Key`,
    mask: '•',
  });

  if (p.isCancel(apiKey) || !apiKey) {
    p.log.warn('已跳过');
    return;
  }

  config.providers[template.name] = {
    type: template.type,
    base_url: template.base_url,
    api_key_encrypted: encrypt(apiKey),
    configured: true,
  };

  p.log.success(`${template.label} 配置完成！默认模型: ${template.name}/${template.default_model}`);
}

async function configureCustom(config: ProviderConfigFile): Promise<void> {
  const name = await p.text({
    message: 'Provider 名称（英文，如 my-llm）',
    validate: (v) => (v ?? '').trim() ? undefined : '名称不能为空',
  });
  if (p.isCancel(name)) return;

  const baseUrl = await p.text({
    message: 'API Base URL（如 https://api.example.com/v1）',
    validate: (v) => (v ?? '').trim() ? undefined : 'URL 不能为空',
  });
  if (p.isCancel(baseUrl)) return;

  const apiKey = await p.password({
    message: '输入 API Key',
    mask: '•',
  });
  if (p.isCancel(apiKey) || !apiKey) {
    p.log.warn('已跳过');
    return;
  }

  const providerName = name.trim().toLowerCase().replace(/\s+/g, '-');

  config.providers[providerName] = {
    type: 'openai-compatible',
    base_url: baseUrl.trim(),
    api_key_encrypted: encrypt(apiKey),
    configured: true,
  };

  p.log.success(`${providerName} 配置完成！`);
}

// ── List providers (TUI) ──

export function listProviders(): void {
  const config = loadConfig();
  const entries = Object.entries(config.providers);

  if (entries.length === 0) {
    p.log.warn('尚未配置任何 Provider，运行 agentflow config 开始配置');
    return;
  }

  console.log();
  for (const [name, pr] of entries) {
    const status = pr.configured ? p.log.success : p.log.warn;
    const type = pr.type === 'anthropic' ? 'Anthropic' : 'OpenAI-compatible';
    console.log(`  ${pr.configured ? '●' : '○'} ${name.padEnd(12)} ${type.padEnd(18)} ${pr.base_url ?? '(default)'}`);
  }
  console.log();
}
