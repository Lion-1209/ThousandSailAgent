import { createAnthropic } from '@ai-sdk/anthropic';
import { createOpenAI } from '@ai-sdk/openai';
import { loadConfig, getApiKey, KNOWN_PROVIDERS } from '../config/providers.js';
import pc from 'picocolors';

export interface ProviderInfo {
  type: 'anthropic' | 'openai-compatible';
  base_url?: string;
}

export class ProviderRegistry {
  /** Runtime overrides from YAML (type + base_url only, no keys) */
  private overrides = new Map<string, ProviderInfo>();

  /** Register a provider override from YAML */
  register(name: string, info: ProviderInfo): void {
    this.overrides.set(name, info);
  }

  /** Create an AI SDK model instance from a "provider/model" or "provider" reference */
  createModel(modelRef: string) {
    const slashIdx = modelRef.indexOf('/');
    let providerName: string;
    let modelId: string;

    if (slashIdx === -1) {
      // "provider" only → use configured or template default model
      providerName = modelRef;
      modelId = this.resolveDefaultModel(providerName);
    } else {
      providerName = modelRef.slice(0, slashIdx);
      modelId = modelRef.slice(slashIdx + 1);
    }

    const info = this.resolveProvider(providerName);
    const apiKey = getApiKey(providerName);

    if (!apiKey) {
      throw new Error(
        `Provider "${providerName}" not configured. ` +
        `Run "tsail config" to set up your API key.`
      );
    }

    if (info.type === 'anthropic') {
      const provider = createAnthropic({ apiKey });
      return provider(modelId) as any;
    }

    // OpenAI-compatible (DeepSeek, GLM, Qwen, Moonshot, etc.)
    const provider = createOpenAI({
      apiKey,
      baseURL: info.base_url,
    });

    return provider.chat(modelId) as any;
  }

  /** Resolve default model: saved config > known template > error */
  private resolveDefaultModel(providerName: string): string {
    const config = loadConfig();
    const saved = config.providers[providerName];
    if (saved?.default_model) {
      return saved.default_model;
    }

    const known = KNOWN_PROVIDERS.find((p) => p.name === providerName);
    if (known?.default_model) {
      return known.default_model;
    }

    throw new Error(
      `No default model configured for "${providerName}". ` +
      `Run "tsail config" to set one, or use "provider/model" format.`
    );
  }

  private resolveProvider(name: string): ProviderInfo {
    // 1. YAML override
    const override = this.overrides.get(name);
    if (override) return override;

    // 2. Saved config
    const config = loadConfig();
    const saved = config.providers[name];
    if (saved) {
      return { type: saved.type, base_url: saved.base_url };
    }

    // 3. Known provider template
    const known = KNOWN_PROVIDERS.find((p) => p.name === name);
    if (known) {
      return { type: known.type, base_url: known.base_url };
    }

    throw new Error(
      `Provider "${name}" not found. Available: ${[
        ...new Set([
          ...this.overrides.keys(),
          ...Object.keys(config.providers),
          ...KNOWN_PROVIDERS.map((p) => p.name),
        ]),
      ].join(', ')}. ` +
      `Run "agentflow config" to add a new provider.`
    );
  }
}
