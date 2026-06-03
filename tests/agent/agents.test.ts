import { describe, it, expect } from 'vitest';
import { getAgentConfig, AGENT_TYPES } from '../../src/agent/agents.js';

describe('Agent Types', () => {
  it('defines coder, reviewer, tester agent types', () => {
    expect(AGENT_TYPES.coder).toBeDefined();
    expect(AGENT_TYPES.reviewer).toBeDefined();
    expect(AGENT_TYPES.tester).toBeDefined();
  });

  it('coder has system prompt instructing file writing', () => {
    const config = getAgentConfig('coder');
    expect(config.systemPrompt).toContain('file_write');
    expect(config.systemPrompt).toContain('terminal');
  });

  it('reviewer has system prompt for reading and reviewing', () => {
    const config = getAgentConfig('reviewer');
    expect(config.systemPrompt).toContain('file_read');
    expect(config.systemPrompt).toContain('review');
  });

  it('tester has system prompt for writing and running tests', () => {
    const config = getAgentConfig('tester');
    expect(config.systemPrompt).toContain('test');
    expect(config.systemPrompt).toContain('terminal');
  });

  it('returns default config for unknown agent type', () => {
    const config = getAgentConfig('unknown_agent');
    expect(config.systemPrompt).toBeDefined();
  });
});
