# HTTP Request Tool Design Spec

> V0.7.0 — 千帆 Agent 基础设施工具扩展第一弹

## 目标

新增 `http_request` 工具，让 Agent 能发起 HTTP 请求并解析响应内容。这是工具生态扩展的第一步，为 Agent 赋予"访问互联网"的能力。

## 工具参数

Agent 调用 `http_request` 时的输入：

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 请求 URL |
| `method` | string | 否 | GET / POST / PUT / DELETE，默认 GET |
| `headers` | object | 否 | 自定义请求头 |
| `body` | string 或 object | 否 | 请求体（POST / PUT 时使用） |
| `timeout` | number | 否 | 超时秒数，默认 30 |
| `extract` | string | 否 | 提取模式：`text` / `json` / `links`，默认自动检测 |

## 响应解析策略

工具根据响应 Content-Type 自动选择解析方式：

| Content-Type | 处理方式 |
|--------------|----------|
| `application/json` | 返回解析后的 JSON 对象 |
| `text/html` | 去除 HTML 标签，返回纯文本内容 |
| 其他 | 返回原始文本 |

**提取模式覆盖：**
- `extract: "json"` — 强制按 JSON 解析，失败则返回原始文本
- `extract: "text"` — 强制提取纯文本（对 HTML 去标签）
- `extract: "links"` — 提取页面中所有链接（`<a href>`），返回 URL 列表
- 不指定 — 自动检测

**响应限制：**
- 响应体最大 1MB，超出截断
- 文本内容最大 5000 字符，超出截断并附加 `[truncated]`

## 安全限制

### 默认行为

- **禁止访问内网地址**：`localhost`、`127.0.0.1`、`10.x.x.x`、`172.16-31.x.x`、`192.168.x.x`
- **响应大小限制**：1MB
- **超时限制**：最大 60 秒

### 可选配置

YAML 工作流级别可配置：

```yaml
name: my-workflow
tools_config:
  http_request:
    allowed_domains: ["api.github.com", "example.com"]  # 域名白名单，不设则不限制
    allow_private: false                                  # 是否允许访问内网，默认 false
    max_response_size: 1048576                            # 最大响应字节数
```

`tools_config` 是工作流级别的新字段，不放在单个步骤上，因为安全策略应该全局生效。

## 实现方案

### 依赖

使用 Node.js 内置 `fetch` API（Node 18+），不引入额外 HTTP 库。

### 文件结构

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `src/tools/http-request.ts` | 工具定义 + 响应解析 + 安全检查 |
| 新建 | `tests/tools/http-request.test.ts` | 单元测试 |
| 修改 | `src/types/workflow.ts` | 新增 `tools_config` 字段到 WorkflowDefinition |
| 修改 | `src/parser/yaml-parser.ts` | YAML Schema 新增 `tools_config` |
| 修改 | `src/engine/runner.ts` | 注册 `http_request` 工具，传入 tools_config |

### 核心模块

```
createHttpRequestTool(config?: HttpToolConfig)
  ├── isPrivateIP(hostname) → boolean     // 内网地址检测
  ├── isDomainAllowed(hostname, config) → boolean  // 域名白名单
  ├── parseResponse(response, extract) → object    // 响应解析
  │   ├── parseJson(text) → object
  │   ├── parseHtml(text) → string        // 去标签提取文本
  │   └── extractLinks(text) → string[]   // 提取 <a href>
  └── execute(input) → ToolResult
```

### 工具注册

`createDefaultRegistry(workdir, toolsConfig)` — 扩展 runner 中的注册函数，将 `tools_config.http_request` 传入工具构造函数。

## 测试计划

| 测试场景 | 方法 |
|----------|------|
| GET 请求返回 JSON | mock fetch |
| POST 请求带 body | mock fetch |
| HTML 响应自动提取文本 | 真实 HTML 字符串 |
| extract: "links" 提取链接 | HTML 含多个 `<a>` 标签 |
| 响应超时 | mock AbortError |
| 内网地址被拒绝 | 传入 localhost / 127.0.0.1 |
| 域名白名单生效 | 配置 allowed_domains 后请求被拒绝 |
| 响应过大截断 | mock 大体积响应 |
| 工具描述包含 HTTP 关键字 | 检查 description |

## 版本

V0.7.0

## 后续路线

| 版本 | 工具 |
|------|------|
| V0.7.0 | HTTP 请求（本 spec） |
| V0.8.0 | Web 搜索 |
| V0.9.0 | 目录操作 |
| V0.10.0 | 数据存储 |
