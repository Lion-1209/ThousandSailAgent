# ThousandSailAgent（千帆 Agent）

千帆竞发，万舸争流 — 多 AI Agent 编排框架，用声明式 YAML 定义 Agent 协作流程。

## 特性

- **声明式工作流** — 用 YAML 定义多步骤 Agent 编排规则，支持依赖关系和并行执行
- **多模型混用** — 不同步骤可使用不同 LLM（DeepSeek 写代码、GLM 审查、Qwen 生成测试）
- **国产模型优先** — 内置 DeepSeek、智谱GLM、通义千问、Moonshot、豆包 等国内主流模型支持
- **真实工具调用** — Agent 自主决定何时读写文件、执行命令，多轮工具调用循环
- **交互式配置** — TUI 引导配置 Provider、选择默认模型、验证 API Key 有效性
- **中英文界面** — `tsail config --lang en` 一键切换界面语言
- **执行历史** — SQLite 存储每次运行记录，可回溯查看

## 安装

```bash
npm install -g thousandsailagent
```

## 快速开始

### 1. 配置 Provider

```bash
tsail config
```

交互式引导，选择 LLM Provider、输入 API Key、选择默认模型：

```
◆ 选择要配置的 Provider
│ ● DeepSeek（深度求索）     已配置 ✓
│ ○ 智谱 GLM（ChatGLM）
│ ○ 通义千问（Qwen）
│ ○ Moonshot（Kimi）
│ ○ 豆包（火山引擎）
│ ○ Anthropic（Claude）
│ ○ OpenAI（GPT）
│ ○ 自定义 Provider
└ ○ 完成配置
```

也可以直接配置指定 Provider：

```bash
tsail config deepseek    # 跳过菜单，直达 DeepSeek 配置
```

### 2. 编写工作流

创建 `pipeline.yaml`：

```yaml
name: code-review-pipeline

steps:
  - id: code
    agent: coder
    model: deepseek/deepseek-v4-flash
    prompt: "根据以下需求实现功能: {{input.requirement}}"
    tools: [file_write, file_read, terminal]
    max_steps: 5

  - id: review
    agent: reviewer
    model: glm/glm-4-flash
    prompt: "审查代码，检查安全和性能问题: {{steps.code.output}}"
    depends_on: [code]
    tools: [file_read]

  - id: test
    agent: tester
    model: deepseek/deepseek-v4-flash
    prompt: "为以下代码编写单元测试并执行: {{steps.code.output}}"
    depends_on: [code]
    tools: [file_write, file_read, terminal]
    max_steps: 5

  - id: refine
    agent: coder
    model: deepseek/deepseek-v4-flash
    prompt: "根据审查意见和测试结果修改代码。审查: {{steps.review.output}} 测试: {{steps.test.output}}"
    depends_on: [review, test]
    tools: [file_write, file_read, terminal]
    max_steps: 5
    retry_count: 1
```

### 3. 运行

```bash
tsail run pipeline.yaml -i requirement="实现一个HTTP服务器"
```

使用 `--verbose` 查看工具调用详情：

```bash
tsail run pipeline.yaml -i requirement="实现一个HTTP服务器" --verbose
```

## CLI 命令

| 命令 | 说明 |
|------|------|
| `tsail run <file>` | 运行工作流 YAML |
| `tsail config` | 交互式配置 Provider |
| `tsail config <provider>` | 直接配置指定 Provider（如 `tsail config deepseek`） |
| `tsail config --lang en` | 切换界面语言（zh/en） |
| `tsail providers` | 查看已配置的 Provider |
| `tsail providers --test` | 验证所有 API Key 是否有效 |
| `tsail list` | 列出当前目录的工作流文件 |
| `tsail history [id]` | 查看运行历史 |

### run 选项

```
-i, --input <k=v...>   传入输入参数
-d, --db <path>        指定数据库路径
    --verbose          显示详细输出（含工具调用详情）
```

## 工作流 YAML 语法

```yaml
name: <工作流名称>
workdir: <工作目录>            # 可选，工具在指定目录下执行

steps:
  - id: <步骤ID>              # 必填，唯一标识
    agent: <Agent类型>         # coder / reviewer / tester
    model: <provider/model>    # 必填，支持省略模型名使用默认模型
    prompt: <提示词>           # 必填，支持模板变量
    tools: [file_read, ...]    # 可用工具列表
    depends_on: [step_id, ...] # 依赖的步骤（可选）
    max_steps: <number>        # 最大工具调用轮数（可选）
    retry_count: <number>      # 失败重试次数（可选）
```

### 模板变量

| 变量 | 说明 |
|------|------|
| `{{input.xxx}}` | 运行时传入的参数 |
| `{{steps.xxx.output}}` | 上游步骤的 LLM 输出 |

### 模型引用

```yaml
model: deepseek/deepseek-v4-flash   # 完整写法
model: deepseek                      # 省略模型名，使用配置的默认模型
```

### 依赖与并行

无 `depends_on` 的步骤会并行执行，有依赖的步骤等待上游完成后才启动。

## 支持的 Provider

| Provider | 类型 | 默认模型 |
|----------|------|----------|
| DeepSeek | OpenAI-compatible | deepseek-v4-flash |
| 智谱 GLM | OpenAI-compatible | glm-4-flash |
| 通义千问 | OpenAI-compatible | qwen-plus |
| Moonshot | OpenAI-compatible | moonshot-v1-8k |
| 豆包 | OpenAI-compatible | doubao-pro-32k |
| Anthropic | Anthropic | claude-sonnet-4-20250514 |
| OpenAI | OpenAI-compatible | gpt-4o |

也支持通过 `tsail config` 添加任意 OpenAI-compatible API。

## 开发进度

> 当前版本：**V0.4.0**

### 已完成

- [x] YAML 工作流解析与 Zod 校验
- [x] DAG 依赖分析与并行调度
- [x] 多 Provider LLM 调用（7 个内置 + 自定义）
- [x] 交互式 TUI Provider 配置（模型选择、API Key 验证）
- [x] API Key AES-256-CBC 加密存储
- [x] 模板变量解析（input / steps.output）
- [x] 内置工具注册（file_read / file_write / terminal）
- [x] SQLite 执行历史持久化
- [x] CLI 工具（run / config / providers / list / history）
- [x] 端到端测试（42 个测试全部通过）
- [x] 真实 API 调用验证（DeepSeek + GLM）
- [x] Agent 类型系统提示（coder / reviewer / tester 差异化策略）
- [x] LLM 真实工具调用（自主决定读写文件、执行命令）
- [x] 工具调用可观测（--verbose 显示工具名、参数、返回值）
- [x] 工作目录支持（workdir）
- [x] 步骤重试机制（retry_count）
- [x] 上下文智能摘要（压缩长文本，控制 Token 消耗）
- [x] 配置系统完善（模型选择、Key 验证、删除、快捷入口、测试）
- [x] 中英文界面切换
- [x] 配置目录自动迁移

### 待开发

- [ ] 条件分支（if/else 工作流）
- [ ] 人工审批节点
- [ ] 更多工具（HTTP 请求、Web 搜索）
- [ ] Web Dashboard
- [ ] VS Code 插件

## 开发

```bash
git clone https://github.com/Lion-1209/ThousandSailAgent.git
cd ThousandSailAgent
npm install
npm test        # 运行测试
npm run dev -- --help   # 开发模式运行
```

## License

MIT
