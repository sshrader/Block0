import { SNIPE } from '../config';
import { pct, schedulePoints } from '../lib/antisnipe';

// Explains the launch fee to creators and traders, from the same numbers the curve config was made with.
export default function SnipeSchedule() {
  const pts = schedulePoints(SNIPE);
  return (
    <section className="card snipe" aria-label="Anti-snipe fee">
      <h3>Anti-snipe fee</h3>
      <p className="muted small">
        New coins open at {pct(SNIPE.startBps)} trading fee, falling to {pct(SNIPE.endBps)} over about {Math.round(SNIPE.durationSlots * 0.4)} seconds. Snipers pay for
        being first. The creator's buy in the launch transaction pays the minimum fee.
      </p>
      <table className="mono small snipe-t">
        <thead>
          <tr><th>After</th><th>Fee</th></tr>
        </thead>
        <tbody>
          {pts.map((p) => (
            <tr key={p.seconds}><td>{p.seconds}s</td><td>{pct(Math.round(p.bps))}</td></tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
