import { describe, it, expect } from 'vitest';
import { parseWorkflow } from '../../src/parser/yaml-parser.js';
import { ZodError } from 'zod';

const VALID_YAML = `
name: test-pipeline
description: "A test pipeline"
steps:
  - id: code
    agent: coder
    model: claude-sonnet-4-20250514
    prompt: "Write code for {{input.requirement}}"
    tools: [file_write, file_read, terminal]

  - id: review
    agent: reviewer
    model: gpt-4o
    prompt: "Review the code"
    depends_on: [code]
    tools: [file_read]
`;

describe('parseWorkflow', () => {
  it('parses a valid YAML workflow', () => {
    const result = parseWorkflow(VALID_YAML);
    expect(result.name).toBe('test-pipeline');
    expect(result.description).toBe('A test pipeline');
    expect(result.steps).toHaveLength(2);
    expect(result.steps[0].id).toBe('code');
    expect(result.steps[0].agent).toBe('coder');
    expect(result.steps[0].model).toBe('claude-sonnet-4-20250514');
    expect(result.steps[0].tools).toEqual(['file_write', 'file_read', 'terminal']);
    expect(result.steps[1].depends_on).toEqual(['code']);
  });

  it('throws on invalid YAML', () => {
    expect(() => parseWorkflow('not: valid: yaml: {')).toThrow();
  });

  it('throws on valid YAML but invalid schema — missing required fields', () => {
    const missingFields = `
name: incomplete
steps:
  - id: step1
    agent: coder
`;
    expect(() => parseWorkflow(missingFields)).toThrow();
  });

  it('throws on empty steps array', () => {
    const emptySteps = `
name: empty
steps: []
`;
    expect(() => parseWorkflow(emptySteps)).toThrow();
  });

  it('parses workdir from workflow definition', () => {
    const yaml = `
name: test-workflow
workdir: ./workspace
steps:
  - id: step1
    agent: coder
    model: deepseek/deepseek-chat
    prompt: "hello"
    tools: [file_write]
`;
    const result = parseWorkflow(yaml);
    expect(result.workdir).toBe('./workspace');
  });

  it('throws on duplicate step ids', () => {
    const duplicates = `
name: dup
steps:
  - id: same
    agent: coder
    model: gpt-4o
    prompt: "do A"
    tools: [terminal]
  - id: same
    agent: coder
    model: gpt-4o
    prompt: "do B"
    tools: [terminal]
`;
    expect(() => parseWorkflow(duplicates)).toThrow(/duplicate/i);
  });

  it('parses route field on steps', () => {
    const yaml = `
name: routed
steps:
  - id: analyze
    agent: coder
    model: deepseek/deepseek-chat
    prompt: "分析需求"
    tools: [file_read, human_input, set_route]
  - id: embedded_impl
    agent: coder
    model: deepseek/deepseek-chat
    prompt: "嵌入式实现"
    tools: [file_write]
    depends_on: [analyze]
    route: embedded
`;
    const result = parseWorkflow(yaml);
    expect(result.steps[0].route).toBeUndefined();
    expect(result.steps[1].route).toBe('embedded');
  });

  it('parses plan and optional fields', () => {
    const yaml = `
name: adaptive
steps:
  - id: planner
    agent: planner
    model: deepseek/deepseek-chat
    prompt: "Plan the workflow"
    tools: [plan_steps, human_input]
    plan: true
  - id: review
    agent: reviewer
    model: glm/glm-4-flash
    prompt: "Review code"
    tools: [file_read]
    depends_on: [planner]
    optional: true
`;
    const result = parseWorkflow(yaml);
    expect(result.steps[0].plan).toBe(true);
    expect(result.steps[1].optional).toBe(true);
    expect(result.steps[0].optional).toBeUndefined();
    expect(result.steps[1].plan).toBeUndefined();
  });
});
