import type { StepDefinition } from '../types/workflow.js';

export interface DagNode {
  step: StepDefinition;
  dependencies: string[];
  dependents: string[];
}

export class Dag {
  private nodes: Map<string, DagNode> = new Map();

  constructor(nodes: Map<string, DagNode>) {
    this.nodes = nodes;
  }

  getNode(id: string): DagNode | undefined {
    return this.nodes.get(id);
  }

  getAllStepIds(): string[] {
    return [...this.nodes.keys()];
  }

  /** Flat topological order */
  getExecutionOrder(): string[] {
    const order: string[] = [];
    const visited = new Set<string>();
    const visiting = new Set<string>();

    const visit = (id: string) => {
      if (visited.has(id)) return;
      if (visiting.has(id)) {
        throw new Error(`Cycle detected involving step: ${id}`);
      }
      visiting.add(id);
      const node = this.nodes.get(id)!;
      for (const dep of node.dependencies) {
        visit(dep);
      }
      visiting.delete(id);
      visited.add(id);
      order.push(id);
    };

    for (const id of this.nodes.keys()) {
      visit(id);
    }
    return order;
  }

  /** Group steps by wave — all steps in a group can run in parallel */
  getParallelGroups(): string[][] {
    const inDegree = new Map<string, number>();
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.dependencies.length);
    }

    const groups: string[][] = [];
    let remaining = new Set(this.nodes.keys());

    while (remaining.size > 0) {
      const ready = [...remaining].filter((id) => inDegree.get(id)! === 0);
      if (ready.length === 0) {
        throw new Error('Cycle detected — no steps with zero in-degree remaining');
      }
      groups.push(ready);
      for (const id of ready) {
        remaining.delete(id);
        const node = this.nodes.get(id)!;
        for (const depId of node.dependents) {
          inDegree.set(depId, inDegree.get(depId)! - 1);
        }
      }
    }
    return groups;
  }
}

export function buildDag(steps: StepDefinition[]): Dag {
  const stepMap = new Map(steps.map((s) => [s.id, s]));

  // Validate all dependency references exist
  for (const step of steps) {
    for (const depId of step.depends_on ?? []) {
      if (!stepMap.has(depId)) {
        throw new Error(`Step "${step.id}" depends on "${depId}", but step not found`);
      }
    }
  }

  const nodes = new Map<string, DagNode>();
  for (const step of steps) {
    const deps = step.depends_on ?? [];
    nodes.set(step.id, {
      step,
      dependencies: deps,
      dependents: [],
    });
  }

  // Build reverse edges (dependents)
  for (const step of steps) {
    for (const depId of step.depends_on ?? []) {
      nodes.get(depId)!.dependents.push(step.id);
    }
  }

  const dag = new Dag(nodes);

  // Validate no cycles exist (will throw if a cycle is detected)
  dag.getExecutionOrder();

  return dag;
}
