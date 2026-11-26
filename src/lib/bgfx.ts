// Animated background for the whole site: a drifting node network that reaches toward the cursor, hex hashes floating up,
// and outlined blocks rising and fading. Pure canvas, no dependencies. Returns a stop function.
const VIOLET = '162,89,255';
const MINT = '20,241,149';

type Node = { x: number; y: number; vx: number; vy: number; r: number; mint: boolean };
type Tag = { x: number; y: number; vy: number; text: string; a: number };
type Blk = { x: number; y: number; s: number; rot: number; vr: number; vy: number; life: number; max: number; mint: boolean };

const hex = (n: number) => Array.from({ length: n }, () => '0123456789abcdef'[(Math.random() * 16) | 0]).join('');
const rand = (a: number, b: number) => a + Math.random() * (b - a);

export function startBackground(canvas: HTMLCanvasElement): () => void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return () => {};
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, raf = 0, stopped = false;
  let nodes: Node[] = [], tags: Tag[] = [], blks: Blk[] = [];
  const mouse = { x: -9999, y: -9999 };

  const mkTag = (anywhere: boolean): Tag => ({ x: rand(0, w), y: anywhere ? rand(0, h) : h + 20, vy: rand(0.12, 0.35), text: `0x${hex(4)}…${hex(4)}`, a: rand(0.06, 0.16) });
  const mkBlk = (anywhere: boolean): Blk => ({ x: rand(0, w), y: anywhere ? rand(0, h) : h + 40, s: rand(14, 34), rot: rand(0, Math.PI), vr: rand(-0.004, 0.004), vy: rand(0.15, 0.4), life: anywhere ? rand(0, 600) : 0, max: rand(500, 900), mint: Math.random() < 0.35 });

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.max(24, Math.min(70, Math.round((w * h) / 22000)));
    nodes = Array.from({ length: n }, () => ({ x: rand(0, w), y: rand(0, h), vx: rand(-0.18, 0.18), vy: rand(-0.18, 0.18), r: rand(1, 2.2), mint: Math.random() < 0.3 }));
    tags = Array.from({ length: Math.max(8, Math.min(22, Math.round(w / 70))) }, () => mkTag(true));
    blks = Array.from({ length: Math.max(5, Math.min(10, Math.round(w / 180))) }, () => mkBlk(true));
  }

  function frame() {
    ctx!.clearRect(0, 0, w, h);
    const LINK = 150;

    // links between nearby nodes, then from the cursor to nearby nodes
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i];
      for (let j = i + 1; j < nodes.length; j++) {
        const b = nodes[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < LINK) {
          ctx!.strokeStyle = `rgba(${VIOLET},${(1 - d / LINK) * 0.22})`;
          ctx!.lineWidth = 1;
          ctx!.beginPath();
          ctx!.moveTo(a.x, a.y);
          ctx!.lineTo(b.x, b.y);
          ctx!.stroke();
        }
      }
      const dm = Math.hypot(a.x - mouse.x, a.y - mouse.y);
      if (dm < 190) {
        ctx!.strokeStyle = `rgba(${MINT},${(1 - dm / 190) * 0.5})`;
        ctx!.beginPath();
        ctx!.moveTo(a.x, a.y);
        ctx!.lineTo(mouse.x, mouse.y);
        ctx!.stroke();
      }
    }

    for (const n of nodes) {
      if (!reduce) {
        n.x += n.vx;
        n.y += n.vy;
        if (n.x < -10) n.x = w + 10;
        if (n.x > w + 10) n.x = -10;
        if (n.y < -10) n.y = h + 10;
        if (n.y > h + 10) n.y = -10;
      }
      ctx!.fillStyle = `rgba(${n.mint ? MINT : VIOLET},${n.mint ? 0.8 : 0.65})`;
      ctx!.beginPath();
      ctx!.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx!.fill();
    }

    // hex hashes drifting up
    ctx!.font = '11px "JetBrains Mono", ui-monospace, monospace';
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      if (!reduce) t.y -= t.vy;
      if (t.y < -20) tags[i] = mkTag(false);
      ctx!.fillStyle = `rgba(${MINT},${t.a})`;
      ctx!.fillText(t.text, t.x, t.y);
    }

    // outlined blocks rising, fading in and out
    for (let i = 0; i < blks.length; i++) {
      const b = blks[i];
      if (!reduce) {
        b.y -= b.vy;
        b.rot += b.vr;
        b.life += 1;
      }
      if (b.life > b.max || b.y < -60) blks[i] = mkBlk(false);
      const k = Math.sin(Math.min(1, b.life / b.max) * Math.PI); // 0 → 1 → 0
      ctx!.save();
      ctx!.translate(b.x, b.y);
      ctx!.rotate(b.rot);
      ctx!.strokeStyle = `rgba(${b.mint ? MINT : VIOLET},${0.05 + k * 0.28})`;
      ctx!.lineWidth = 1.4;
      ctx!.strokeRect(-b.s / 2, -b.s / 2, b.s, b.s);
      ctx!.strokeRect(-b.s / 6, -b.s / 6, b.s / 3, b.s / 3);
      ctx!.restore();
    }

    if (!reduce && !stopped) raf = requestAnimationFrame(frame);
  }

  const onMove = (e: PointerEvent) => { mouse.x = e.clientX; mouse.y = e.clientY; };
  const onLeave = () => { mouse.x = mouse.y = -9999; };
  const onVisible = () => {
    cancelAnimationFrame(raf);
    if (!document.hidden && !reduce && !stopped) raf = requestAnimationFrame(frame);
  };

  resize();
  window.addEventListener('resize', resize);
  window.addEventListener('pointermove', onMove, { passive: true });
  window.addEventListener('pointerleave', onLeave);
  document.addEventListener('visibilitychange', onVisible);
  frame();

  return () => {
    stopped = true;
    cancelAnimationFrame(raf);
    window.removeEventListener('resize', resize);
    window.removeEventListener('pointermove', onMove);
    window.removeEventListener('pointerleave', onLeave);
    document.removeEventListener('visibilitychange', onVisible);
  };
}
