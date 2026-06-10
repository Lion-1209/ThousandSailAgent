# HTTP Request Tool Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an `http_request` tool that lets Agents fetch URLs and parse responses (JSON, HTML text, link extraction) with safety guards (private IP blocking, domain allowlisting, size limits).

**Architecture:** A single tool module (`src/tools/http-request.ts`) with helper functions for security checks and response parsing. The runner passes a new `tools_config` from YAML into the tool constructor. No external HTTP libraries — uses Node.js built-in `fetch`.

**Tech Stack:** TypeScript, Vercel AI SDK (`tool()`), Zod, Node.js `fetch`, Vitest

---

## Necessity Review

This is the first tool in the expansion roadmap (V0.7.0). HTTP access is the most fundamental capability gap — without it, Agents cannot interact with any external API or web resource.

| Component | Value | Why |
|-----------|-------|-----|
| `http_request` tool | **Core** | The tool itself — lets Agent fetch any URL |
| Security checks (private IP, domain allowlist) | **Required** | Prevent SSRF attacks and data exfiltration |
| Response parsing (JSON/HTML/links) | **Required** | Raw HTML is useless to LLMs; parsed content is actionable |
| `tools_config` YAML field | **Required** | Safety config must live somewhere in the workflow definition |

## File Structure

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/tools/http-request.ts` | Tool definition, security checks, response parsing |
| Create | `tests/tools/http-request.test.ts` | All tool tests |
| Modify | `src/types/workflow.ts:38-46` | Add `tools_config` to WorkflowDefinition |
| Modify | `src/parser/yaml-parser.ts:24-30` | Add `tools_config` to WorkflowSchema |
| Modify | `src/engine/runner.ts` | Register tool, pass config |
| Modify | `README.md` | Document http_request tool |

---

### Task 1: Security Helpers + Core Tool

**Files:**
- Create: `src/tools/http-request.ts`
- Create: `tests/tools/http-request.test.ts`

This task creates the tool and all its helpers. Tests use mocked `fetch` (via `vi.fn` on `globalThis.fetch`).

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/http-request.test.ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tools/http-request.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Write the implementation**

```typescript
// src/tools/http-request.ts
import { tool } from 'ai';
import { z } from 'zod';

export interface HttpToolConfig {
  /** If set, only these domains are allowed */
  allowed_domains?: string[];
  /** Allow requests to private IPs (default: false) */
  allow_private?: boolean;
  /** Max response body size in bytes (default: 1MB) */
  max_response_size?: number;
}

const MAX_TEXT_LENGTH = 5000;
const DEFAULT_TIMEOUT = 30;
const MAX_TIMEOUT = 60;
const DEFAULT_MAX_SIZE = 1024 * 1024; // 1MB

const PRIVATE_IP_RANGES = [
  /^127\./,
  /^10\./,
  /^172\.(1[6-9]|2\d|3[01])\./,
  /^192\.168\./,
  /^0\./,
];

function isPrivateIP(hostname: string): boolean {
  if (hostname === 'localhost' || hostname === '::1') return true;
  return PRIVATE_IP_RANGES.some((r) => r.test(hostname));
}

function isDomainAllowed(hostname: string, config?: HttpToolConfig): boolean {
  if (!config?.allowed_domains || config.allowed_domains.length === 0) return true;
  return config.allowed_domains.includes(hostname);
}

function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.slice(0, MAX_TEXT_LENGTH) + '\n[truncated]';
}

function stripHtmlTags(html: string): string {
  // Remove script and style blocks entirely
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  // Replace block tags with newlines
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n');
  // Remove all remaining tags
  text = text.replace(/<[^>]+>/g, '');
  // Decode common entities
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  // Collapse whitespace
  text = text.replace(/\n{3,}/g, '\n\n').trim();
  return text;
}

function extractLinks(html: string): string[] {
  const re = /<a\s+[^>]*href=["']([^"']+)["']/gi;
  const links: string[] = [];
  let match;
  while ((match = re.exec(html)) !== null) {
    links.push(match[1]);
  }
  return links;
}

function parseResponseText(body: string, contentType: string, extract?: string): unknown {
  // Force extract mode
  if (extract === 'json') {
    try {
      return JSON.parse(body);
    } catch {
      return truncateText(body);
    }
  }

  if (extract === 'links') {
    return extractLinks(body);
  }

  if (extract === 'text' || contentType.includes('text/html')) {
    const text = stripHtmlTags(body);
    return truncateText(text);
  }

  // Auto-detect
  if (contentType.includes('application/json')) {
    try {
      return JSON.parse(body);
    } catch {
      return truncateText(body);
    }
  }

  return truncateText(body);
}

export function createHttpRequestTool(config?: HttpToolConfig) {
  return tool({
    description: 'Make an HTTP request to a URL and return the response. Supports GET, POST, PUT, DELETE methods. Can parse JSON responses, extract text from HTML pages, or extract all links. Use this to fetch data from APIs or web pages.',
    inputSchema: z.object({
      url: z.string().describe('The URL to request'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).optional().describe('HTTP method (default: GET)'),
      headers: z.record(z.string()).optional().describe('Custom request headers'),
      body: z.union([z.string(), z.object({}).passthrough()]).optional().describe('Request body for POST/PUT'),
      timeout: z.number().optional().describe('Timeout in seconds (default: 30, max: 60)'),
      extract: z.enum(['text', 'json', 'links']).optional().describe('How to parse the response: text (strip HTML), json (parse as JSON), links (extract <a href> URLs). Auto-detected if not specified.'),
    }),
    execute: async (input) => {
      const { url, method = 'GET', headers = {}, body, timeout = DEFAULT_TIMEOUT, extract } = input;

      // Parse URL for security checks
      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return { success: false, status: 0, error: `Invalid URL: ${url}` };
      }

      const hostname = parsedUrl.hostname;

      // Security: private IP check
      if (!config?.allow_private && isPrivateIP(hostname)) {
        return { success: false, status: 0, error: `Blocked: ${hostname} is a private/internal address` };
      }

      // Security: domain allowlist
      if (!isDomainAllowed(hostname, config)) {
        return { success: false, status: 0, error: `Blocked: ${hostname} is not in allowed domains` };
      }

      // Build fetch options
      const clampedTimeout = Math.min(timeout, MAX_TIMEOUT);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), clampedTimeout * 1000);

      const maxSize = config?.max_response_size ?? DEFAULT_MAX_SIZE;

      try {
        const fetchOptions: RequestInit = {
          method,
          headers,
          signal: controller.signal,
        };

        if (body && (method === 'POST' || method === 'PUT')) {
          fetchOptions.body = typeof body === 'string' ? body : JSON.stringify(body);
          if (!headers['Content-Type'] && !headers['content-type']) {
            fetchOptions.headers = { ...headers, 'Content-Type': 'application/json' };
          }
        }

        const response = await globalThis.fetch(url, fetchOptions);

        // Read response body with size limit
        const arrayBuffer = await response.arrayBuffer();
        let responseText: string;
        if (arrayBuffer.byteLength > maxSize) {
          responseText = new TextDecoder().decode(arrayBuffer.slice(0, maxSize));
        } else {
          responseText = new TextDecoder().decode(arrayBuffer);
        }

        const contentType = response.headers.get('content-type') ?? '';

        if (!response.ok) {
          return {
            success: false,
            status: response.status,
            error: `HTTP ${response.status} ${response.statusText}`,
            data: truncateText(responseText),
          };
        }

        const data = parseResponseText(responseText, contentType, extract);

        return {
          success: true,
          status: response.status,
          contentType,
          data,
        };
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (message.includes('abort')) {
          return { success: false, status: 0, error: `Request timed out after ${clampedTimeout}s` };
        }
        return { success: false, status: 0, error: message };
      } finally {
        clearTimeout(timer);
      }
    },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tools/http-request.test.ts`
Expected: PASS (16 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/http-request.ts tests/tools/http-request.test.ts
git commit -m "feat: add http_request tool with JSON/HTML/links parsing and security guards"
```

---

### Task 2: `tools_config` Type + YAML Schema

**Files:**
- Modify: `src/types/workflow.ts:38-46`
- Modify: `src/parser/yaml-parser.ts:24-30`
- Modify: `tests/parser/yaml-parser.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/parser/yaml-parser.test.ts` inside the existing `describe('parseWorkflow', ...)` block:

```typescript
  it('parses tools_config for http_request', () => {
    const yaml = `
name: api-workflow
tools_config:
  http_request:
    allowed_domains: ["api.github.com"]
    allow_private: false
    max_response_size: 524288
steps:
  - id: fetch
    agent: coder
    model: glm/glm-4-flash
    prompt: "Fetch data"
    tools: [http_request]
`;
    const result = parseWorkflow(yaml);
    expect(result.tools_config?.http_request).toEqual({
      allowed_domains: ['api.github.com'],
      allow_private: false,
      max_response_size: 524288,
    });
  });

  it('works without tools_config', () => {
    const yaml = `
name: simple
steps:
  - id: step1
    agent: coder
    model: glm/glm-4-flash
    prompt: "Do something"
    tools: [file_read]
`;
    const result = parseWorkflow(yaml);
    expect(result.tools_config).toBeUndefined();
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parser/yaml-parser.test.ts`

- [ ] **Step 3: Add types and schema**

In `src/types/workflow.ts`, add after the `ProviderConfig` interface:

```typescript
/** Configuration for the http_request tool */
export interface HttpToolConfig {
  /** If set, only these domains are allowed */
  allowed_domains?: string[];
  /** Allow requests to private IPs (default: false) */
  allow_private?: boolean;
  /** Max response body size in bytes (default: 1MB) */
  max_response_size?: number;
}

/** Tool-level configuration — security policies and limits */
export interface ToolsConfig {
  http_request?: HttpToolConfig;
}
```

In `src/types/workflow.ts`, add `tools_config` to `WorkflowDefinition` interface (after `providers?`):

```typescript
  /** Tool configuration — security policies and limits */
  tools_config?: ToolsConfig;
```

In `src/parser/yaml-parser.ts`, add before `const WorkflowSchema`:

```typescript
const HttpToolConfigSchema = z.object({
  allowed_domains: z.array(z.string()).optional(),
  allow_private: z.boolean().optional(),
  max_response_size: z.number().int().min(1024).optional(),
});

const ToolsConfigSchema = z.object({
  http_request: HttpToolConfigSchema.optional(),
});
```

In `src/parser/yaml-parser.ts`, add `tools_config` to `WorkflowSchema` (after `providers`):

```typescript
  tools_config: ToolsConfigSchema.optional(),
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parser/yaml-parser.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/types/workflow.ts src/parser/yaml-parser.ts tests/parser/yaml-parser.test.ts
git commit -m "feat: add tools_config field to workflow definition for http_request safety config"
```

---

### Task 3: Runner Integration

**Files:**
- Modify: `src/engine/runner.ts`

- [ ] **Step 1: Modify the runner**

In `src/engine/runner.ts`, add import at top:

```typescript
import { createHttpRequestTool } from '../tools/http-request.js';
```

Change `createDefaultRegistry` signature to accept `toolsConfig`:

```typescript
export function createDefaultRegistry(workdir?: string, toolsConfig?: import('../types/workflow.js').ToolsConfig): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register('file_read', createFileReadTool(workdir) as any);
  registry.register('file_write', createFileWriteTool(workdir) as any);
  registry.register('terminal', createTerminalTool(workdir) as any);
  registry.register('human_input', createHumanInputTool() as any);
  registry.register('set_route', createSetRouteTool() as any);
  registry.register('plan_steps', createPlanStepsTool() as any);
  registry.register('http_request', createHttpRequestTool(toolsConfig?.http_request) as any);
  return registry;
}
```

In `runWorkflow`, change the `createDefaultRegistry` call to pass `tools_config`:

```typescript
  const toolRegistry = createDefaultRegistry(workdir, definition.tools_config);
```

- [ ] **Step 2: Run all tests to verify no regressions**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 3: Commit**

```bash
git add src/engine/runner.ts
git commit -m "feat: register http_request tool in runner with tools_config"
```

---

### Task 4: README + Version Bump

**Files:**
- Modify: `README.md`
- Modify: `package.json`
- Modify: `src/cli/index.ts`

- [ ] **Step 1: Update README**

Add `http_request` to the YAML syntax section, after `optional: true`:

```markdown
    plan: true                 # 标记为规划步骤，首先执行并可修改工作流（可选）
    optional: true             # 标记为可选步骤，规划器可决定跳过（可选）
```

Add a new section after "可变模板" called "### HTTP 请求":

```markdown
### HTTP 请求

Agent 可以发起 HTTP 请求，访问外部 API 或网页，并自动解析响应内容。

**内置解析：**
- JSON 响应 → 自动解析为结构化数据
- HTML 响应 → 自动提取纯文本内容
- `extract: "links"` → 提取页面中所有链接

**示例：**

```yaml
name: api-fetch
tools_config:
  http_request:
    allowed_domains: ["api.github.com"]  # 可选：域名白名单

steps:
  - id: fetch
    agent: coder
    model: glm/glm-4-flash
    prompt: "获取 GitHub 上 tsail 仓库的最新 issue 列表"
    tools: [http_request]
    max_steps: 3
```

**安全特性：**
- 默认禁止访问内网地址（localhost、192.168.x.x 等）
- 可配置域名白名单（`allowed_domains`）
- 响应大小限制 1MB，文本截断 5000 字符
```

Add `http_request` to the completed checklist:

```markdown
- [x] 可变模板（Agent 可动态修改工作流步骤）
- [x] HTTP 请求工具（访问外部 API 和网页）
```

Remove `更多工具（HTTP 请求、Web 搜索）` from "待开发" if present, replace with:

```markdown
- [ ] 更多工具（Web 搜索、目录操作、数据存储）
```

- [ ] **Step 2: Update version**

In `package.json`: `"version": "0.7.0"`
In `src/cli/index.ts`: `.version('0.7.0')`
In README: `当前版本：**V0.7.0**`

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 4: Commit**

```bash
git add README.md package.json src/cli/index.ts
git commit -m "docs: add http_request documentation, bump to V0.7.0"
```

---

## Self-Review

**1. Spec coverage:**

| Spec requirement | Task |
|------------------|------|
| Tool parameters (url, method, headers, body, timeout, extract) | Task 1 ✓ |
| JSON response parsing | Task 1 ✓ |
| HTML text extraction | Task 1 ✓ |
| Links extraction | Task 1 ✓ |
| Private IP blocking | Task 1 ✓ |
| Domain allowlisting | Task 1 ✓ |
| Response size limit + truncation | Task 1 ✓ |
| `tools_config` YAML field | Task 2 ✓ |
| Runner registration | Task 3 ✓ |
| Documentation + version | Task 4 ✓ |

**2. Placeholder scan:** No TBD/TODO found. All steps have complete code.

**3. Type consistency:**
- `HttpToolConfig` defined in both `src/types/workflow.ts` (Task 2) and exported from `src/tools/http-request.ts` (Task 1) — the tool imports from types
- `ToolsConfig` interface in `src/types/workflow.ts` has `http_request?: HttpToolConfig`
- `createDefaultRegistry(workdir, toolsConfig)` takes `ToolsConfig?` which matches `definition.tools_config`
- `createHttpRequestTool(config)` takes `HttpToolConfig?` which matches `toolsConfig?.http_request`

Wait — `HttpToolConfig` is defined in both files. The tool file should import from types. Let me fix: in Task 1, the tool exports its own `HttpToolConfig`, and Task 2 defines it in types. The runner in Task 3 uses `import('../types/workflow.js').ToolsConfig` which has `http_request?: HttpToolConfig`. The tool's constructor takes `HttpToolConfig` which it defines locally. This is fine — they're structurally identical TypeScript types. But to avoid duplication, I should have Task 1 import from types. However, Task 1 is written before Task 2 adds the types. Solution: in Task 1, define the interface locally. In Task 2, define the canonical version in types. In Task 3, the runner references `import('../types/workflow.js').ToolsConfig`. The tool still uses its local definition. This works because TypeScript uses structural typing — identical shapes are compatible.

Actually, to keep it clean: Task 1 defines `HttpToolConfig` in the tool file and exports it. Task 2 defines `HttpToolConfig` and `ToolsConfig` in types. The test imports from the tool file. The runner imports from types. No conflict.

## Verification

1. `npx vitest run` — all tests pass
2. Create a test YAML with `tools: [http_request]` and run with `tsx src/cli/index.ts run`, verify Agent can make HTTP calls
