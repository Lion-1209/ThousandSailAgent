import type { ToolSet } from 'ai';

/**
 * Minimal shape of a tool that can be registered.
 * Compatible with tools created via the `tool()` helper from the Vercel AI SDK.
 */
export interface ToolDefinition {
  description?: string;
  inputSchema: unknown;
  execute: (args: unknown) => PromiseLike<unknown> | unknown;
}

/**
 * Registry for managing agent tools by name.
 * Used by the agent executor to look up tools at runtime.
 */
export class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  /** Register a tool under the given name. */
  register(name: string, tool: ToolDefinition): void {
    this.tools.set(name, tool);
  }

  /** Retrieve a tool by name. Throws if not registered. */
  get(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(
        `Tool "${name}" is not registered. Available: ${[...this.tools.keys()].join(', ')}`,
      );
    }
    return tool;
  }

  /** Return a subset of tools as a ToolSet-compatible record. */
  getSubset(names: string[]): ToolSet {
    const result: Record<string, ToolDefinition> = {};
    for (const name of names) {
      result[name] = this.get(name);
    }
    return result as ToolSet;
  }

  /** List all registered tool names. */
  listNames(): string[] {
    return [...this.tools.keys()];
  }
}
