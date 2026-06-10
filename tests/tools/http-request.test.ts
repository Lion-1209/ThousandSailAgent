import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createHttpRequestTool } from '../../src/tools/http-request.js';
import type { HttpToolConfig } from '../../src/tools/http-request.js';

describe('createHttpRequestTool', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    globalThis.fetch = vi.fn();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // --- Tool metadata ---

  it('has description mentioning HTTP', () => {
    const tool = createHttpRequestTool();
    expect(tool.description).toContain('HTTP');
  });

  // --- Successful requests ---

  it('makes GET request and returns parsed JSON', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('{"name":"test","value":42}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'https://api.example.com/data' });
    expect(result.success).toBe(true);
    expect(result.status).toBe(200);
    expect(result.data).toEqual({ name: 'test', value: 42 });

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.example.com/data',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('makes POST request with body', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({
      url: 'https://api.example.com/items',
      method: 'POST',
      body: { name: 'new item' },
    });
    expect(result.status).toBe(201);

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs?.method).toBe('POST');
    expect(callArgs?.body).toBe(JSON.stringify({ name: 'new item' }));
  });

  it('extracts text from HTML response', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('<html><body><h1>Hello</h1><p>World</p></body></html>', {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      }),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'https://example.com/page' });
    expect(result.success).toBe(true);
    expect(result.data).toContain('Hello');
    expect(result.data).toContain('World');
    expect(result.data).not.toContain('<h1>');
  });

  it('extracts links when extract is "links"', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response(
        '<html><body><a href="https://example.com/a">A</a><a href="/b">B</a></body></html>',
        { status: 200, headers: { 'Content-Type': 'text/html' } },
      ),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({
      url: 'https://example.com/page',
      extract: 'links',
    });
    expect(result.success).toBe(true);
    expect(result.data).toEqual(expect.arrayContaining(['https://example.com/a', '/b']));
  });

  it('forces JSON parsing when extract is "json"', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('{"key":"value"}', {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({
      url: 'https://example.com/api',
      extract: 'json',
    });
    expect(result.data).toEqual({ key: 'value' });
  });

  // --- Error cases ---

  it('rejects localhost (private IP)', async () => {
    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'http://localhost:3000/admin' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('private');
  });

  it('rejects 127.0.0.1', async () => {
    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'http://127.0.0.1/secret' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('private');
  });

  it('rejects 192.168.x.x', async () => {
    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'http://192.168.1.1/router' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('private');
  });

  it('rejects domain not in allowed_domains', async () => {
    const config: HttpToolConfig = { allowed_domains: ['api.github.com'] };
    const tool = createHttpRequestTool(config);
    const result = await tool.execute({ url: 'https://evil.com/data' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('allowed');
  });

  it('allows domain in allowed_domains', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const config: HttpToolConfig = { allowed_domains: ['api.github.com'] };
    const tool = createHttpRequestTool(config);
    const result = await tool.execute({ url: 'https://api.github.com/repos' });
    expect(result.success).toBe(true);
  });

  it('truncates response text over 5000 chars', async () => {
    const longText = 'A'.repeat(6000);
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response(longText, {
        status: 200,
        headers: { 'Content-Type': 'text/plain' },
      }),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'https://example.com/big' });
    expect(result.data.length).toBeLessThan(6000);
    expect(result.data).toContain('[truncated]');
  });

  it('handles request error gracefully', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockRejectedValue(new Error('network error'));

    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'https://example.com/fail' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('network error');
  });

  it('handles non-OK HTTP status', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('Not Found', { status: 404, statusText: 'Not Found' }),
    );

    const tool = createHttpRequestTool();
    const result = await tool.execute({ url: 'https://example.com/missing' });
    expect(result.success).toBe(false);
    expect(result.status).toBe(404);
  });

  it('allows private IPs when allow_private is true', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const config: HttpToolConfig = { allow_private: true };
    const tool = createHttpRequestTool(config);
    const result = await tool.execute({ url: 'http://localhost:3000/test' });
    expect(result.success).toBe(true);
  });

  it('sends custom headers', async () => {
    const mockFetch = vi.mocked(globalThis.fetch);
    mockFetch.mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );

    const tool = createHttpRequestTool();
    await tool.execute({
      url: 'https://api.example.com/data',
      headers: { Authorization: 'Bearer token123' },
    });

    const callArgs = mockFetch.mock.calls[0][1];
    expect(callArgs?.headers).toMatchObject({ Authorization: 'Bearer token123' });
  });
});
