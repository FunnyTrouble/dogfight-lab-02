import { describe, it, expect, vi } from 'vitest';
import { createLoop } from './loop.js';
describe('fixed timestep loop with controllable animation frames',()=>{
  it('simulates fixed dt and stops scheduling after stop',()=>{
    let next:FrameRequestCallback|null=null;
    const raf=vi.fn((callback:FrameRequestCallback)=>{next=callback;return 1;});
    const caf=vi.fn();
    vi.stubGlobal('requestAnimationFrame',raf);vi.stubGlobal('cancelAnimationFrame',caf);
    const sim=vi.fn();const render=vi.fn();
    const start=performance.now();
    const loop=createLoop({step:1/30,simulate:sim,render});
    loop.start();
    try{
      // Fake the frame callback clock, independent of wall time.
      const frame=next;
      if(!frame)throw new Error('rAF not scheduled');
      (frame as FrameRequestCallback)(start+100);
      expect(sim.mock.calls.length).toBeGreaterThanOrEqual(2);
      expect(sim.mock.calls[0]?.[0]).toBe(1/30);
      expect(render).toHaveBeenCalled();
      loop.stop();expect(caf).toHaveBeenCalled();
    }finally{vi.unstubAllGlobals();}
  });
});
