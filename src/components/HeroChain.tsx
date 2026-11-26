import { SNIPE } from '../config';
import { SLOT_SECONDS, feeBpsAt, pct } from '../lib/antisnipe';

// A strip of blocks showing the anti-snipe fee falling as a new coin's pool ages. Block 0 is the creator's own buy.
// The numbers come from the same schedule the curve config was made with.
const STEPS = [2, 5, 10, 20, 30, 45, 60]; // seconds after launch

export default function HeroChain() {
  const rows = STEPS.map((s) => ({ s, bps: feeBpsAt(SNIPE, s / SLOT_SECONDS) }));
  return (
    <div className="chain" role="img" aria-label="The anti-snipe fee falls from the first seconds after launch until it reaches the normal fee">
      <div className="blk blk0">
        <span className="blk-n mono">#0</span>
        <b>Dev buy</b>
        <span className="mono small">{pct(SNIPE.endBps)} min fee</span>
        <span className="blk-bar"><i style={{ width: '6%' }} /></span>
      </div>
      {rows.map((r) => (
        <div className="blk-wrap" key={r.s}>
          <span className="link" aria-hidden="true" />
          <div className="blk">
            <span className="blk-n mono">+{r.s}s</span>
            <b>{pct(Math.round(r.bps))}</b>
            <span className="mono small muted">sniper fee</span>
            <span className="blk-bar"><i style={{ width: `${Math.max(6, (r.bps / SNIPE.startBps) * 100)}%` }} /></span>
          </div>
        </div>
      ))}
    </div>
  );
}
