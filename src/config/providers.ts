import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import * as p from '@clack/prompts';
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
  locale?: 'zh' | 'en';
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

// ── Stdin reset (fix Windows raw mode corruption) ──

function resetStdin(): void {
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(false);
      process.stdin.setRawMode(true);
    } catch { /* ignore */ }
  }
}

// ── i18n ──

type StringKey =
  | 'intro_title' | 'select_provider' | 'custom_provider' | 'custom_provider_hint'
  | 'done_config' | 'done_config_hint' | 'configured_count' | 'not_configured'
  | 'enter_api_key' | 'enter_new_api_key' | 'validating' | 'validate_ok'
  | 'validate_fail' | 'key_saved_maybe_invalid' | 'skipped'
  | 'select_model' | 'custom_model' | 'custom_model_hint' | 'enter_model_id'
  | 'model_updated' | 'config_complete'
  | 'already_configured' | 'back' | 'back_hint' | 'current' | 'manual_input'
  | 'change_api_key' | 'reconfigure' | 'delete_provider' | 'delete_hint'
  | 'deleted' | 'provider_name' | 'provider_name_empty' | 'base_url'
  | 'base_url_empty' | 'enter_key' | 'default_model_id' | 'model_id_empty'
  | 'custom_config_complete'
  | 'no_providers' | 'no_providers_hint' | 'name_label' | 'type_label'
  | 'default_model_label' | 'not_set'
  | 'lang_switched' | 'lang_option_zh' | 'lang_option_en' | 'lang_select';

const STRINGS: Record<'zh' | 'en', Record<StringKey, string>> = {
  zh: {
    intro_title: 'ThousandSailAgent Provider 配置',
    select_provider: '选择要配置的 Provider',
    custom_provider: '自定义 Provider',
    custom_provider_hint: '输入 base_url',
    done_config: '完成配置',
    done_config_hint: '保存并退出',
    configured_count: `已配置 {count} 个 Provider → {path}`,
    not_configured: '未配置任何 Provider',
    enter_api_key: '输入 {label} 的 API Key',
    enter_new_api_key: '输入新的 {label} API Key',
    validating: '验证中...',
    validate_ok: '验证通过',
    validate_fail: '验证失败 ({error})，Key 已保存但可能无效',
    key_saved_maybe_invalid: 'Key 已保存但可能无效',
    skipped: '已跳过',
    select_model: '选择默认模型',
    custom_model: '自定义模型 ID',
    custom_model_hint: '手动输入',
    enter_model_id: '输入模型 ID',
    model_updated: '默认模型已更新为: {provider}/{model}',
    config_complete: '{label} 配置完成！默认模型: {provider}/{model}',
    already_configured: '{label} 已配置 — 选择操作或直接切换模型',
    back: '↩ 返回',
    back_hint: '回到 Provider 列表',
    current: '← 当前',
    manual_input: '手动输入',
    change_api_key: '更换 API Key',
    reconfigure: '重新配置（全部）',
    delete_provider: '删除此 Provider',
    delete_hint: '移除',
    deleted: '{label} 已删除',
    provider_name: 'Provider 名称（英文，如 my-llm）',
    provider_name_empty: '名称不能为空',
    base_url: 'API Base URL（如 https://api.example.com/v1）',
    base_url_empty: 'URL 不能为空',
    enter_key: '输入 API Key',
    default_model_id: '默认模型 ID（如 gpt-3.5-turbo）',
    model_id_empty: '模型 ID 不能为空',
    custom_config_complete: '{name} 配置完成！默认模型: {name}/{model}',
    no_providers: '尚未配置任何 Provider',
    no_providers_hint: '运行 tsail config 开始配置',
    name_label: '名称',
    type_label: '类型',
    default_model_label: '默认模型',
    not_set: '(未设置)',
    lang_switched: '语言已切换为中文',
    lang_option_zh: '中文',
    lang_option_en: 'English',
    lang_select: '选择界面语言',
  },
  en: {
    intro_title: 'ThousandSailAgent Provider Setup',
    select_provider: 'Select a Provider to configure',
    custom_provider: 'Custom Provider',
    custom_provider_hint: 'Enter base_url',
    done_config: 'Done',
    done_config_hint: 'Save & Exit',
    configured_count: `Configured {count} provider(s) → {path}`,
    not_configured: 'No providers configured',
    enter_api_key: 'Enter {label} API Key',
    enter_new_api_key: 'Enter new {label} API Key',
    validating: 'Validating...',
    validate_ok: 'Validation passed',
    validate_fail: 'Validation failed ({error}), key saved but may be invalid',
    key_saved_maybe_invalid: 'Key saved but may be invalid',
    skipped: 'Skipped',
    select_model: 'Select default model',
    custom_model: 'Custom model ID',
    custom_model_hint: 'Manual input',
    enter_model_id: 'Enter model ID',
    model_updated: 'Default model updated: {provider}/{model}',
    config_complete: '{label} configured! Default model: {provider}/{model}',
    already_configured: '{label} configured — switch model or select action',
    back: '↩ Back',
    back_hint: 'Return to provider list',
    current: '← Current',
    manual_input: 'Manual input',
    change_api_key: 'Change API Key',
    reconfigure: 'Reconfigure (all)',
    delete_provider: 'Delete this provider',
    delete_hint: 'Remove',
    deleted: '{label} deleted',
    provider_name: 'Provider name (e.g. my-llm)',
    provider_name_empty: 'Name cannot be empty',
    base_url: 'API Base URL (e.g. https://api.example.com/v1)',
    base_url_empty: 'URL cannot be empty',
    enter_key: 'Enter API Key',
    default_model_id: 'Default model ID (e.g. gpt-3.5-turbo)',
    model_id_empty: 'Model ID cannot be empty',
    custom_config_complete: '{name} configured! Default model: {name}/{model}',
    no_providers: 'No providers configured',
    no_providers_hint: 'Run tsail config to get started',
    name_label: 'Name',
    type_label: 'Type',
    default_model_label: 'Default Model',
    not_set: '(not set)',
    lang_switched: 'Language switched to English',
    lang_option_zh: '中文',
    lang_option_en: 'English',
    lang_select: 'Select interface language',
  },
};

function t(key: StringKey, vars?: Record<string, string>): string {
  const config = loadConfig();
  const locale = config.locale ?? 'zh';
  let str = STRINGS[locale][key];
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replace(`{${k}}`, v);
    }
  }
  return str;
}

export function getLocale(): 'zh' | 'en' {
  return loadConfig().locale ?? 'zh';
}

export function setLocale(locale: 'zh' | 'en'): void {
  const config = loadConfig();
  config.locale = locale;
  saveConfig(config);
}

// ── Interactive TUI setup ──

export async function interactiveSetup(): Promise<void> {
  console.clear();
  p.intro(t('intro_title'));

  const config = loadConfig();

  const buildOptions = () => {
    const configuredHint = config.locale === 'en' ? 'Configured ✓' : '已配置 ✓';
    const opts: { value: string; label: string; hint?: string }[] = KNOWN_PROVIDERS.map((pr) => ({
      value: pr.name,
      label: pr.label,
      hint: config.providers[pr.name]?.configured ? configuredHint : undefined,
    }));
    opts.push({ value: '__custom__', label: t('custom_provider'), hint: t('custom_provider_hint') });
    opts.push({ value: '__done__', label: t('done_config'), hint: t('done_config_hint') });
    return opts;
  };

  while (true) {
    resetStdin();
    const selection = await p.select({
      message: t('select_provider'),
      options: buildOptions(),
    });

    if (p.isCancel(selection) || selection === '__done__') {
      break;
    }

    if (selection === '__custom__') {
      await configureCustom(config);
      continue;
    }

    const template = KNOWN_PROVIDERS.find((pr) => pr.name === selection);
    if (template) {
      await configureProvider(config, template);
    }
  }

  saveConfig(config);

  const configuredCount = Object.values(config.providers).filter((pr) => pr.configured).length;
  if (configuredCount > 0) {
    p.outro(t('configured_count', { count: String(configuredCount), path: getConfigPath() }));
  } else {
    p.outro(t('not_configured'));
  }
}

export async function configureProvider(config: ProviderConfigFile, template: ProviderTemplate): Promise<void> {
  const existing = config.providers[template.name];
  if (existing?.configured) {
    const currentModel = existing.default_model ?? template.default_model;
    const options: { value: string; label: string; hint?: string }[] = [
      { value: '__back__', label: t('back'), hint: t('back_hint') },
      ...template.models.map((m) => ({
        value: m.id,
        label: m.label,
        hint: m.id === currentModel ? t('current') : undefined,
      })),
      { value: '__custom__', label: t('custom_model'), hint: t('custom_model_hint') },
      { value: '__rekey__', label: t('change_api_key') },
      { value: '__full__', label: t('reconfigure') },
      { value: '__delete__', label: t('delete_provider'), hint: pc.red(t('delete_hint')) },
    ];

    resetStdin();
    const action = await p.select({
      message: t('already_configured', { label: template.label }),
      options,
    });

    if (p.isCancel(action) || action === '__back__') return;

    if (action === '__delete__') {
      delete config.providers[template.name];
      p.log.warn(t('deleted', { label: template.label }));
      return;
    }

    if (action === '__rekey__') {
      const apiKey = await p.password({
        message: t('enter_new_api_key', { label: template.label }),
        mask: '•',
      });
      if (p.isCancel(apiKey) || !apiKey) return;
      p.log.info(t('validating'));
      const result = await validateApiKey(template.name, apiKey, template);
      if (!result.valid) {
        p.log.warn(t('validate_fail', { error: result.error ?? '' }));
      } else {
        p.log.success(t('validate_ok'));
      }
      existing.api_key_encrypted = encrypt(apiKey);
      return;
    }

    if (action === '__full__') {
      // Fall through to full configuration below
    } else if (action === '__custom__') {
      const custom = await p.text({
        message: t('enter_model_id'),
        placeholder: template.default_model,
      });
      if (!p.isCancel(custom) && custom) {
        existing.default_model = custom.trim();
        p.log.success(t('model_updated', { provider: template.name, model: custom.trim() }));
      }
      return;
    } else {
      existing.default_model = action as string;
      p.log.success(t('model_updated', { provider: template.name, model: action as string }));
      return;
    }
  }

  // Full configuration
  const apiKey = await p.password({
    message: t('enter_api_key', { label: template.label }),
    mask: '•',
  });
  if (p.isCancel(apiKey) || !apiKey) {
    p.log.warn(t('skipped'));
    return;
  }

  p.log.info(t('validating'));
  const result = await validateApiKey(template.name, apiKey, template);
  if (!result.valid) {
    p.log.warn(t('validate_fail', { error: result.error ?? '' }));
  } else {
    p.log.success(t('validate_ok'));
  }

  const model = await selectModel(template);

  config.providers[template.name] = {
    type: template.type,
    base_url: template.base_url,
    api_key_encrypted: encrypt(apiKey),
    default_model: model ?? template.default_model,
    configured: true,
  };

  p.log.success(t('config_complete', { label: template.label, provider: template.name, model: model ?? template.default_model }));
}

async function selectModel(template: ProviderTemplate): Promise<string | null> {
  const options: { value: string; label: string }[] = template.models.map((m) => ({
    value: m.id,
    label: m.label,
  }));
  options.push({ value: '__custom__', label: t('custom_model') });

  resetStdin();
  const selection = await p.select({
    message: t('select_model'),
    options,
  });

  if (p.isCancel(selection)) return null;

  if (selection === '__custom__') {
    const custom = await p.text({
      message: t('enter_model_id'),
      placeholder: template.default_model,
    });
    if (p.isCancel(custom)) return null;
    return custom!.trim();
  }

  return selection as string;
}

async function configureCustom(config: ProviderConfigFile): Promise<void> {
  const name = await p.text({
    message: t('provider_name'),
    validate: (v) => (v ?? '').trim() ? undefined : t('provider_name_empty'),
  });
  if (p.isCancel(name)) return;

  const baseUrl = await p.text({
    message: t('base_url'),
    validate: (v) => (v ?? '').trim() ? undefined : t('base_url_empty'),
  });
  if (p.isCancel(baseUrl)) return;

  const apiKey = await p.password({
    message: t('enter_key'),
    mask: '•',
  });
  if (p.isCancel(apiKey) || !apiKey) return;

  p.log.info(t('validating'));
  const result = await validateApiKey(name.trim(), apiKey, { type: 'openai-compatible', base_url: baseUrl.trim() });
  if (!result.valid) {
    p.log.warn(t('validate_fail', { error: result.error ?? '' }));
  } else {
    p.log.success(t('validate_ok'));
  }

  const defaultModel = await p.text({
    message: t('default_model_id'),
    validate: (v) => (v ?? '').trim() ? undefined : t('model_id_empty'),
  });
  if (p.isCancel(defaultModel)) return;

  const providerName = name.trim().toLowerCase().replace(/\s+/g, '-');

  config.providers[providerName] = {
    type: 'openai-compatible',
    base_url: baseUrl.trim(),
    api_key_encrypted: encrypt(apiKey),
    default_model: defaultModel!.trim(),
    configured: true,
  };

  p.log.success(t('custom_config_complete', { name: providerName, model: defaultModel!.trim() }));
}

// ── List providers ──

export function listProviders(): void {
  const config = loadConfig();
  const entries = Object.entries(config.providers);

  if (entries.length === 0) {
    p.log.warn(`${t('no_providers')}，${t('no_providers_hint')}`);
    return;
  }

  console.log();
  for (const [name, pr] of entries) {
    const typeStr = pr.type === 'anthropic' ? 'Anthropic' : 'OpenAI-compat';
    const model = pr.default_model ?? t('not_set');
    const template = KNOWN_PROVIDERS.find((pr2) => pr2.name === name);
    const label = template?.label ?? name;
    console.log(`  ${pr.configured ? pc.green('●') : pc.yellow('○')} ${label}`);
    console.log(`    ${t('name_label')}: ${name}  |  ${t('type_label')}: ${typeStr}  |  ${t('default_model_label')}: ${model}`);
    if (pr.base_url) {
      console.log(`    Base URL: ${pr.base_url}`);
    }
    console.log();
  }
}
