import { afterEach, describe, expect, it } from 'vitest';
import { debugBall, debugSwing } from './debugHook';

const g = globalThis as unknown as { window?: Record<string, unknown> };

describe('ganchos de depuración (solo en desarrollo)', () => {
  afterEach(() => { delete g.window; });

  it('en desarrollo publican la bolsa en window con el nombre que lee el harness', () => {
    g.window = {};
    const a = debugSwing({ done: false, view: 'auto' });
    const b = debugBall({ done: false, frames: [] });
    expect(a).toBe(g.window.__hglDebug);
    expect(b).toBe(g.window.__hglBall);
    expect(a).toMatchObject({ done: false, view: 'auto' });
  });
});
