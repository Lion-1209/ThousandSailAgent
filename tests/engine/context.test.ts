import { describe, it, expect } from 'vitest';
import { ContextManager } from '../../src/engine/context.js';

describe('ContextManager', () => {
  it('stores and retrieves input', () => {
    const ctx = new ContextManager();
    ctx.setInput({ requirement: 'build a REST API' });
    expect(ctx.getInput()).toEqual({ requirement: 'build a REST API' });
  });

  it('stores step output and retrieves by step id', () => {
    const ctx = new ContextManager();
    ctx.setInput({});
    ctx.setStepOutput('code', 'function hello() { return "hi"; }');
    ctx.setStepOutput('review', 'LGTM');
    expect(ctx.getStepOutput('code')).toBe('function hello() { return "hi"; }');
    expect(ctx.getStepOutput('review')).toBe('LGTM');
  });

  it('builds agent context for a given step', () => {
    const ctx = new ContextManager();
    ctx.setInput({ requirement: 'build API' });
    ctx.setStepOutput('code', 'the code');
    const agentCtx = ctx.getAgentContext();
    expect(agentCtx.input).toEqual({ requirement: 'build API' });
    expect(agentCtx.stepOutputs).toEqual({ code: 'the code' });
  });

  it('returns empty string for unknown step output', () => {
    const ctx = new ContextManager();
    ctx.setInput({});
    expect(ctx.getStepOutput('nonexistent')).toBe('');
  });
});
