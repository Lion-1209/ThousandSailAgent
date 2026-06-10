# Chat Mode Design Spec

> 千帆对话模式 — 无需 YAML，自然语言直接驱动 Agent

## 目标

新增 `tsail chat` 命令，用户输入自然语言任务描述，Agent 自动选择工具并执行。降低使用门槛，无需编写 YAML 文件。

## 用法

```bash
tsail chat "帮我查一下 GitHub 上 thousand-sail 仓库的最新 issue"
tsail chat "读取 main.py 并添加错误处理"
tsail chat "调用天气 API，结果写到 weather.json" -m glm/glm-4-flash
tsail chat "分析当前目录的代码结构" --verbose
```

## 架构

复用现有引擎。`tsail chat` 内部自动构造一个单步骤默认工作流，然后调用 `runWorkflow()` 正常执行。

构造的工作流等价于：

```yaml
name: chat
steps:
  - id: chat
    agent: coder
    model: <用户指定 或 默认 glm/glm-4-flash>
    prompt: <用户输入的自然语言>
    tools: [file_read, file_write, terminal, http_request, human_input, set_route, plan_steps]
    max_steps: 10
```

## CLI 接口

```
tsail chat <prompt> [options]
```

| 参数 | 说明 |
|------|------|
| `<prompt>` | 自然语言任务描述（必填） |
| `-m, --model <model>` | 指定模型（可选，默认 glm/glm-4-flash） |
| `--verbose` | 显示工具调用详情 |
| `-d, --db <path>` | 数据库路径 |

## 实现方案

### 文件变更

仅修改 `src/cli/index.ts`，新增 `chat` 命令。无新文件。

### 核心逻辑

1. 解析 CLI 参数（prompt、model、verbose、db）
2. 构造单步骤 YAML 字符串（用模板拼接）
3. 调用现有 `runWorkflow(yamlContent, {})`
4. 输出结果（复用 run 命令的输出格式）

### 默认配置

- 默认模型：`glm/glm-4-flash`
- 默认 max_steps：10
- 所有已注册工具全部可用
- 无 workdir（使用当前目录）

## 测试

由于是 CLI 命令，通过真实运行验证：

```bash
# 基础测试
npx tsx src/cli/index.ts chat "列出当前目录的文件" --verbose

# 指定模型
npx tsx src/cli/index.ts chat "读取 hello_world.py" -m glm/glm-4-flash

# 使用 http_request
npx tsx src/cli/index.ts chat "访问 httpbin.org/get 并返回结果"
```

## 版本

作为 V0.7.0 追加功能提交，或单独升 V0.7.1。
