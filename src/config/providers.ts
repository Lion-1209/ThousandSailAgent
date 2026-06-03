import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { select, input, password } from '@inquirer/prompts';
import pc from 'picocolors';

// ── Stored provider entry (includes encrypted API key) ──

export interface StoredProvider {
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
  api_key_encrypted?: string;
  default_model?: string;
  configured: boolean;
}

export interface ProviderConfigFile {
  providers: Record<string, StoredProvider>;
}

// ── Known provider templates ──

export interface ModelOption {
  id: string;
  label: string;
}

export interface ProviderTemplate {
  name: string;
  label: string;
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
  default_model: string;
  models: ModelOption[];
}

export const KNOWN_PROVIDERS: ProviderTemplate[] = [
  {
    name: 'deepseek',
    label: 'DeepSeek（深度求索）',
    type: 'openai-compatible',
    base_url: 'https://api.deepseek.com',
    default_model: 'deepseek-v4-flash',
    models: [
      { id: 'deepseek-v4-flash', label: 'DeepSeek-V4-Flash（最新，支持思考模式）' },
      { id: 'deepseek-v4-pro', label: 'DeepSeek-V4-Pro（旗舰）' },
      { id: 'deepseek-chat', label: 'DeepSeek-V3（兼容，7月24日弃用）' },
      { id: 'deepseek-reasoner', label: 'DeepSeek-R1（兼容，7月24日弃用）' },
    ],
  },
  {
    name: 'glm',
    label: '智谱 GLM（ChatGLM）',
    type: 'openai-compatible',
    base_url: 'https://open.bigmodel.cn/api/paas/v4',
    default_model: 'glm-4-flash',
    models: [
      { id: 'glm-5.1', label: 'GLM-5.1（最新旗舰）' },
      { id: 'glm-5', label: 'GLM-5（高智能基座）' },
      { id: 'glm-5-turbo', label: 'GLM-5-Turbo（快速）' },
      { id: 'glm-4.7', label: 'GLM-4.7（编程专精）' },
      { id: 'glm-4-flash', label: 'GLM-4-Flash（免费）' },
      { id: 'glm-4-plus', label: 'GLM-4-Plus（增强）' },
      { id: 'glm-4-long', label: 'GLM-4-Long（长上下文）' },
    ],
  },
  {
    name: 'qwen',
    label: '通义千问（Qwen）',
    type: 'openai-compatible',
    base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    default_model: 'qwen-plus',
    models: [
      { id: 'qwen-turbo', label: 'Qwen-Turbo（快速）' },
      { id: 'qwen-plus', label: 'Qwen-Plus（均衡）' },
      { id: 'qwen-max', label: 'Qwen-Max（旗舰）' },
      { id: 'qwen-long', label: 'Qwen-Long（长上下文）' },
    ],
  },
  {
    name: 'moonshot',
    label: 'Moonshot（Kimi）',
    type: 'openai-compatible',
    base_url: 'https://api.moonshot.cn/v1',
    default_model: 'moonshot-v1-8k',
    models: [
      { id: 'moonshot-v1-8k', label: 'Moonshot-v1-8K' },
      { id: 'moonshot-v1-32k', label: 'Moonshot-v1-32K' },
      { id: 'moonshot-v1-128k', label: 'Moonshot-v1-128K' },
    ],
  },
  {
    name: 'doubao',
    label: '豆包（火山引擎）',
    type: 'openai-compatible',
    base_url: 'https://ark.cn-beijing.volces.com/api/v3',
    default_model: 'doubao-pro-32k',
    models: [
      { id: 'doubao-pro-32k', label: 'Doubao-Pro-32K' },
      { id: 'doubao-pro-128k', label: 'Doubao-Pro-128K' },
      { id: 'doubao-lite-32k', label: 'Doubao-Lite-32K（经济）' },
    ],
  },
  {
    name: 'anthropic',
    label: 'Anthropic（Claude）',
    type: 'anthropic',
    default_model: 'claude-sonnet-4-20250514',
    models: [
      { id: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4（均衡）' },
      { id: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5（快速）' },
      { id: 'claude-opus-4-20250918', label: 'Claude Opus 4（旗舰）' },
    ],
  },
  {
    name: 'openai',
    label: 'OpenAI（GPT）',
    type: 'openai-compatible',
    base_url: 'https://api.openai.com/v1',
    default_model: 'gpt-4o',
    models: [
      { id: 'gpt-4o', label: 'GPT-4o（均衡）' },
      { id: 'gpt-4o-mini', label: 'GPT-4o Mini（经济）' },
      { id: 'gpt-4.1', label: 'GPT-4.1（增强）' },
      { id: 'o3', label: 'o3（推理）' },
    ],
  },
];

// ── Config file path ──

const OLD_CONFIG_DIR = path.join(os.homedir(), '.agentflow');
const NEW_CONFIG_DIR = path.join(os.homedir(), '.tsail');

function getConfigDir(): string {
  // Auto-migrate from old ~/.agentflow/ to ~/.tsail/
  if (fs.existsSync(OLD_CONFIG_DIR) && !fs.existsSync(NEW_CONFIG_DIR)) {
    fs.renameSync(OLD_CONFIG_DIR, NEW_CONFIG_DIR);
    console.log(pc.dim(`  配置目录已迁移: ${OLD_CONFIG_DIR} → ${NEW_CONFIG_DIR}`));
  }
  return NEW_CONFIG_DIR;
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

export function decrypt(encrypted: string): string {
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

// ── API Key validation ──

export async function validateApiKey(
  providerName: string,
  apiKey: string,
  info: { type: string; base_url?: string }
): Promise<{ valid: boolean; error?: string }> {
  try {
    if (providerName === 'anthropic' || info.type === 'anthropic') {
      const res = await fetch('https://api.anthropic.com/v1/models', {
        headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
        signal: AbortSignal.timeout(10000),
      });
      return { valid: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
    }

    // OpenAI-compatible: call /models endpoint
    const baseUrl = (info.base_url ?? '').replace(/\/$/, '');
    const res = await fetch(`${baseUrl}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(10000),
    });
    return { valid: res.ok, error: res.ok ? undefined : `HTTP ${res.status}` };
  } catch (e) {
    return { valid: false, error: (e as Error).message };
  }
}

// ── Interactive TUI setup ──

export async function interactiveSetup(): Promise<void> {
  console.clear();
  console.log(pc.bold(pc.cyan('  ThousandSailAgent Provider 配置\n')));

  const config = loadConfig();

  // Build select options
  const buildOptions = () => {
    const opts: { value: string; name: string; description?: string }[] = KNOWN_PROVIDERS.map((t) => ({
      value: t.name,
      name: t.label,
      description: config.providers[t.name]?.configured ? '已配置 ✓' : undefined,
    }));
    opts.push({ value: '__custom__', name: '自定义 Provider', description: '输入 base_url' });
    opts.push({ value: '__done__', name: '完成配置', description: '保存并退出' });
    return opts;
  };

  // Keep asking until user selects "done"
  while (true) {
    try {
      const selection = await select({
        message: '选择要配置的 Provider',
        choices: buildOptions(),
      });

      if (selection === '__done__') {
        break;
      }

      if (selection === '__custom__') {
        await configureCustom(config);
        continue;
      }

      const template = KNOWN_PROVIDERS.find((t) => t.name === selection);
      if (template) {
        await configureProvider(config, template);
      }
    } catch {
      // Ctrl+C in inquirer throws — treat as done
      break;
    }
  }

  saveConfig(config);

  const configuredCount = Object.values(config.providers).filter((pr) => pr.configured).length;
  if (configuredCount > 0) {
    console.log(pc.green(`\n  已配置 ${configuredCount} 个 Provider → ${getConfigPath()}`));
  } else {
    console.log(pc.yellow('\n  未配置任何 Provider'));
  }
}

export async function configureProvider(config: ProviderConfigFile, template: ProviderTemplate): Promise<void> {
  const existing = config.providers[template.name];
  if (existing?.configured) {
    const currentModel = existing.default_model ?? template.default_model;
    const choices: { value: string; name: string; description?: string }[] = [
      { value: '__back__', name: '↩ 返回', description: '回到 Provider 列表' },
      ...template.models.map((m) => ({
        value: m.id,
        name: m.label,
        description: m.id === currentModel ? '← 当前' : undefined,
      })),
      { value: '__custom__', name: '自定义模型 ID', description: '手动输入' },
      { value: '__rekey__', name: '更换 API Key' },
      { value: '__full__', name: '重新配置（全部）' },
      { value: '__delete__', name: '删除此 Provider', description: pc.red('移除配置和 API Key') },
    ];

    let action: string;
    try {
      action = await select({
        message: `${template.label} 已配置 — 选择操作或直接切换模型`,
        choices,
      });
    } catch {
      return; // Ctrl+C → back to main menu
    }

    if (action === '__back__') return;

    if (action === '__delete__') {
      delete config.providers[template.name];
      console.log(pc.yellow(`  ${template.label} 已删除`));
      return;
    }

    if (action === '__rekey__') {
      try {
        const apiKey = await password({ message: `输入新的 ${template.label} API Key`, mask: true });
        console.log(pc.dim('  验证中...'));
        const result = await validateApiKey(template.name, apiKey, template);
        if (!result.valid) {
          console.log(pc.yellow(`  ⚠ 验证失败 (${result.error})，Key 已保存但可能无效`));
        } else {
          console.log(pc.green('  ✓ 验证通过'));
        }
        existing.api_key_encrypted = encrypt(apiKey);
      } catch { /* Ctrl+C → skip */ }
      return;
    }

    if (action === '__full__') {
      // Fall through to full configuration below
    } else if (action === '__custom__') {
      try {
        const custom = await input({ message: '输入模型 ID', default: template.default_model });
        existing.default_model = custom.trim();
        console.log(pc.green(`  默认模型已更新为: ${template.name}/${custom.trim()}`));
      } catch { /* Ctrl+C → skip */ }
      return;
    } else {
      existing.default_model = action;
      console.log(pc.green(`  默认模型已更新为: ${template.name}/${action}`));
      return;
    }
  }

  // Full configuration
  try {
    const apiKey = await password({ message: `输入 ${template.label} 的 API Key`, mask: true });
    console.log(pc.dim('  验证中...'));
    const result = await validateApiKey(template.name, apiKey, template);
    if (!result.valid) {
      console.log(pc.yellow(`  ⚠ 验证失败 (${result.error})，Key 已保存但可能无效`));
    } else {
      console.log(pc.green('  ✓ 验证通过'));
    }

    const model = await selectModel(template);

    config.providers[template.name] = {
      type: template.type,
      base_url: template.base_url,
      api_key_encrypted: encrypt(apiKey),
      default_model: model ?? template.default_model,
      configured: true,
    };

    console.log(pc.green(`  ${template.label} 配置完成！默认模型: ${template.name}/${model ?? template.default_model}`));
  } catch {
    // Ctrl+C → skip this provider
  }
}

async function selectModel(template: ProviderTemplate): Promise<string | null> {
  const choices: { value: string; name: string }[] = template.models.map((m) => ({
    value: m.id,
    name: m.label,
  }));
  choices.push({ value: '__custom__', name: '自定义模型 ID' });

  try {
    const selection = await select({
      message: '选择默认模型',
      choices,
    });

    if (selection === '__custom__') {
      const custom = await input({ message: '输入模型 ID', default: template.default_model });
      return custom.trim();
    }

    return selection;
  } catch {
    return null; // Ctrl+C → back
  }
}

async function configureCustom(config: ProviderConfigFile): Promise<void> {
  try {
    const name = await input({ message: 'Provider 名称（英文，如 my-llm）' });
    const baseUrl = await input({ message: 'API Base URL（如 https://api.example.com/v1）' });
    const apiKey = await password({ message: '输入 API Key', mask: true });

    console.log(pc.dim('  验证中...'));
    const result = await validateApiKey(name.trim(), apiKey, { type: 'openai-compatible', base_url: baseUrl.trim() });
    if (!result.valid) {
      console.log(pc.yellow(`  ⚠ 验证失败 (${result.error})，Key 已保存但可能无效`));
    } else {
      console.log(pc.green('  ✓ 验证通过'));
    }

    const defaultModel = await input({ message: '默认模型 ID（如 gpt-3.5-turbo）' });

    const providerName = name.trim().toLowerCase().replace(/\s+/g, '-');

    config.providers[providerName] = {
      type: 'openai-compatible',
      base_url: baseUrl.trim(),
      api_key_encrypted: encrypt(apiKey),
      default_model: defaultModel.trim(),
      configured: true,
    };

    console.log(pc.green(`  ${providerName} 配置完成！默认模型: ${providerName}/${defaultModel.trim()}`));
  } catch {
    // Ctrl+C — skip
  }
}

// ── List providers ──

export function listProviders(): void {
  const config = loadConfig();
  const entries = Object.entries(config.providers);

  if (entries.length === 0) {
    console.log(pc.yellow('  尚未配置任何 Provider，运行 tsail config 开始配置'));
    return;
  }

  console.log();
  for (const [name, pr] of entries) {
    const type = pr.type === 'anthropic' ? 'Anthropic' : 'OpenAI-compat';
    const model = pr.default_model ?? '(未设置)';
    const template = KNOWN_PROVIDERS.find((t) => t.name === name);
    const label = template?.label ?? name;
    console.log(`  ${pr.configured ? pc.green('●') : pc.yellow('○')} ${label}`);
    console.log(`    名称: ${name}  |  类型: ${type}  |  默认模型: ${model}`);
    if (pr.base_url) {
      console.log(`    Base URL: ${pr.base_url}`);
    }
    console.log();
  }
}
