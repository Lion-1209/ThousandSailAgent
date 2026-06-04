import type { StepDefinition } from '../types/workflow.js';

export interface WorkflowPlan {
  enabled?: string[];
  disabled?: string[];
  modifications?: Record<string, { prompt?: string; tools?: string[]; model?: string }>;
  new_steps?: Array<{
    id: string;
    agent: string;
    prompt: string;
    tools: string[];
    depends_on?: string[];
    model?: string;
  }>;
}

/**
 * Extract a WorkflowPlan from tool call records.
 * Looks for the first `plan_steps` tool call and extracts its input.
 */
export function extractPlan(toolCalls: Array<{ toolName: string; input: unknown }>): WorkflowPlan | null {
  const planCall = toolCalls.find(tc => tc.toolName === 'plan_steps');
  if (!planCall || typeof planCall.input !== 'object' || !planCall.input) return null;

  const input = planCall.input as any;
  return {
    enabled: input.enabled,
    disabled: input.disabled,
    modifications: input.modifications,
    new_steps: input.new_steps,
  };
}

/**
 * Apply a plan to the template steps:
 * 1. Remove the planner step
 * 2. Remove disabled steps
 * 3. Apply modifications (prompt, tools, model overrides)
 * 4. Add new steps
 * 5. Fix dependencies that reference removed steps
 */
export function applyPlan(templateSteps: StepDefinition[], plan: WorkflowPlan): StepDefinition[] {
  const disabledIds = new Set(plan.disabled ?? []);

  // 1. Remove planner step
  let steps = templateSteps.filter(s => !s.plan);

  // 2. Remove disabled steps
  steps = steps.filter(s => {
    if (disabledIds.has(s.id)) return false;
    return true;
  });

  const remainingIds = new Set(steps.map(s => s.id));

  // 3. Apply modifications
  if (plan.modifications) {
    steps = steps.map(s => {
      const mod = plan.modifications![s.id];
      if (!mod) return s;
      return {
        ...s,
        ...(mod.prompt !== undefined && { prompt: mod.prompt }),
        ...(mod.tools !== undefined && { tools: mod.tools }),
        ...(mod.model !== undefined && { model: mod.model }),
      };
    });
  }

  // 4. Add new steps
  if (plan.new_steps) {
    for (const ns of plan.new_steps) {
      const newStep: StepDefinition = {
        id: ns.id,
        agent: ns.agent,
        model: ns.model ?? 'deepseek/deepseek-chat',
        prompt: ns.prompt,
        tools: ns.tools,
        depends_on: ns.depends_on,
      };
      steps.push(newStep);
    }
  }

  // 5. Fix dependencies that reference removed steps
  const removedSteps = new Map<string, string[]>();
  for (const s of templateSteps) {
    if (!remainingIds.has(s.id) && s.id !== 'planner') {
      removedSteps.set(s.id, s.depends_on ?? []);
    }
  }

  steps = steps.map(s => {
    if (!s.depends_on) return s;
    const newDeps: string[] = [];
    for (const dep of s.depends_on) {
      if (remainingIds.has(dep)) {
        newDeps.push(dep);
      } else if (removedSteps.has(dep)) {
        const replacements = resolveRemovedDeps(dep, removedSteps, remainingIds);
        newDeps.push(...replacements);
      }
    }
    const uniqueDeps = [...new Set(newDeps)].filter(d => d !== 'planner' && remainingIds.has(d));
    return { ...s, depends_on: uniqueDeps.length > 0 ? uniqueDeps : undefined };
  });

  return steps;
}

function resolveRemovedDeps(
  removedId: string,
  removedSteps: Map<string, string[]>,
  remainingIds: Set<string>,
  visited: Set<string> = new Set(),
): string[] {
  if (visited.has(removedId)) return [];
  visited.add(removedId);

  const deps = removedSteps.get(removedId) ?? [];
  const result: string[] = [];
  for (const dep of deps) {
    if (remainingIds.has(dep) && dep !== 'planner') {
      result.push(dep);
    } else if (removedSteps.has(dep)) {
      result.push(...resolveRemovedDeps(dep, removedSteps, remainingIds, visited));
    }
  }
  return result;
}
