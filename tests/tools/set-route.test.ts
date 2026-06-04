import { describe, it, expect } from 'vitest';
import { createSetRouteTool } from '../../src/tools/set-route.js';

describe('createSetRouteTool', () => {
  it('returns confirmation with route name', async () => {
    const tool = createSetRouteTool();
    const result = await tool.execute({ route: 'embedded' });
    expect(result).toEqual({ success: true, route: 'embedded' });
  });

  it('has description mentioning route', () => {
    const tool = createSetRouteTool();
    expect(tool.description).toContain('route');
  });
});
