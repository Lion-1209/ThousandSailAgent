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
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<\/(p|div|br|h[1-6]|li|tr)>/gi, '\n');
  text = text.replace(/<[^>]+>/g, '');
  text = text.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
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

      let parsedUrl: URL;
      try {
        parsedUrl = new URL(url);
      } catch {
        return { success: false, status: 0, error: `Invalid URL: ${url}` };
      }

      const hostname = parsedUrl.hostname;

      if (!config?.allow_private && isPrivateIP(hostname)) {
        return { success: false, status: 0, error: `Blocked: ${hostname} is a private/internal address` };
      }

      if (!isDomainAllowed(hostname, config)) {
        return { success: false, status: 0, error: `Blocked: ${hostname} is not in allowed domains` };
      }

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
