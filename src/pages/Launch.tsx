import CreateCoinForm from '../components/CreateCoinForm';
import SnipeSchedule from '../components/SnipeSchedule';
import { CURVE_ON } from '../config';

export default function Launch({ balance, onCreated }: { balance: number | null; onCreated: () => void }) {
  return (
    <div className="wrap">
      <header className="page-h">
        <p className="eyebrow mono">New coin</p>
        <h1>Launch a coin</h1>
        <p className="lede">
          Fill in the basics. One wallet approval creates the token and its bonding-curve pool. Add a dev buy and it lands in the same transaction as the pool,
          at the normal fee, before the anti-snipe fee ever applies to anyone else.
        </p>
      </header>
      <div className="launch">
        <CreateCoinForm balance={balance} onCreated={onCreated} />
        <div className="stack">
          {CURVE_ON && <SnipeSchedule />}
          <section className="card">
            <h3>What happens</h3>
            <ol className="how">
              <li>Your image and details are stored on IPFS.</li>
              <li>You approve one transaction in your wallet: it creates the token and the pool, and your dev buy if you added one.</li>
              <li>The server checks the chain and records the dev buy it finds there.</li>
              <li>Anyone else who buys in the first minute pays the anti-snipe fee, which falls with every step.</li>
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}
