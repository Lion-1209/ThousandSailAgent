// tests/tools/registry.test.ts
import { describe, it, expect } from 'vitest';
import { ToolRegistry } from '../../src/tools/registry.js';

describe('ToolRegistry', () => {
  it('registers and retrieves a tool', () => {
    const registry = new ToolRegistry();
    const mockTool = {
      description: 'test tool',
      parameters: {},
      execute: async () => 'result',
    };
    registry.register('test_tool', mockTool);
    expect(registry.get('test_tool')).toBe(mockTool);
  });

  it('returns subset of tools by name', () => {
    const registry = new ToolRegistry();
    const toolA = { description: 'a', parameters: {}, execute: async () => 'a' };
    const toolB = { description: 'b', parameters: {}, execute: async () => 'b' };
    registry.register('a', toolA);
    registry.register('b', toolB);
    const subset = registry.getSubset(['a']);
    expect(Object.keys(subset)).toEqual(['a']);
    expect(subset['a']).toBe(toolA);
  });

  it('throws when requesting unregistered tool', () => {
    const registry = new ToolRegistry();
    expect(() => registry.get('nonexistent')).toThrow(/not registered/);
  });

  it('lists all registered tool names', () => {
    const registry = new ToolRegistry();
    registry.register('x', { description: 'x', parameters: {}, execute: async () => {} });
    registry.register('y', { description: 'y', parameters: {}, execute: async () => {} });
    expect(registry.listNames()).toEqual(['x', 'y']);
  });
});
