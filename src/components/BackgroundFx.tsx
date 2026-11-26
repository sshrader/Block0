import { useEffect, useRef } from 'react';
import { startBackground } from '../lib/bgfx';

// Fixed, click-through canvas behind the whole site. See src/lib/bgfx.ts.
export default function BackgroundFx() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => (ref.current ? startBackground(ref.current) : undefined), []);
  return <canvas ref={ref} className="bgfx" aria-hidden="true" />;
}
