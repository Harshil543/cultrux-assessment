import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

type Balance = {
  currencyId: number;
  code: string;
  name: string;
  module: string;
  balanceCredits: number;
};

type LedgerItem = {
  id: number;
  currencyCode?: string;
  deltaCredits: number;
  entryType: string;
  referenceType: string;
  referenceId: string;
  createdAt: string;
};

type Plan = { id: number; label: string; credits: number; totalPaise: number };
type Currency = {
  id: number;
  code: string;
  name: string;
  perCreditPaise: number;
  plans: Plan[];
};

function paiseToInr(paise: number): string {
  return `₹${(paise / 100).toFixed(2)}`;
}

export default function WalletPage() {
  const [balances, setBalances] = useState<Balance[]>([]);
  const [ledger, setLedger] = useState<LedgerItem[]>([]);
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [currencyId, setCurrencyId] = useState<number | ''>('');
  const [mode, setMode] = useState<'plan' | 'quantity'>('plan');
  const [planId, setPlanId] = useState<number | ''>('');
  const [quantity, setQuantity] = useState(100);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  const selected = currencies.find((c) => c.id === currencyId);

  async function refresh() {
    const [b, l, c] = await Promise.all([
      api<Balance[]>('/wallet/balances'),
      api<{ items: LedgerItem[] }>('/wallet/ledger'),
      api<Currency[]>('/currencies'),
    ]);
    setBalances(b);
    setLedger(l.items);
    setCurrencies(c);
    if (!currencyId && c[0]) {
      setCurrencyId(c[0].id);
      if (c[0].plans[0]) setPlanId(c[0].plans[0].id);
    }
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
    const params = new URLSearchParams(window.location.search);
    if (params.get('checkout') === 'success') {
      setMessage('Payment submitted. Credits appear after the Stripe webhook is processed.');
    }
    if (params.get('checkout') === 'cancel') {
      setMessage('Checkout cancelled — no credits granted.');
    }
  }, []);

  useEffect(() => {
    if (selected?.plans[0]) setPlanId(selected.plans[0].id);
  }, [currencyId]);

  async function buy(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const body =
        mode === 'plan'
          ? { currencyId: Number(currencyId), planId: Number(planId) }
          : { currencyId: Number(currencyId), quantity: Number(quantity) };

      const data = await api<{ checkoutUrl: string }>('/checkout/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setLoading(false);
    }
  }

  return (
    <div className="stack gap-lg">
      <div>
        <h1>Wallet</h1>
        <p className="muted">Balances are updated only after a verified Stripe webhook.</p>
        {message && <p className="info">{message}</p>}
      </div>

      <section>
        <h2>Balances</h2>
        <div className="grid-3">
          {balances.map((b) => (
            <div key={b.currencyId} className="panel">
              <strong>{b.name}</strong>
              <div className="big">{b.balanceCredits}</div>
              <div className="muted">
                {b.code} · module: {b.module}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <h2>Buy credits</h2>
        <form onSubmit={buy} className="stack">
          <label>
            Currency
            <select
              value={currencyId}
              onChange={(e) => setCurrencyId(Number(e.target.value))}
              required
            >
              {currencies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({paiseToInr(c.perCreditPaise)}/credit)
                </option>
              ))}
            </select>
          </label>

          <div className="row">
            <label>
              <input
                type="radio"
                checked={mode === 'plan'}
                onChange={() => setMode('plan')}
              />{' '}
              Plan
            </label>
            <label>
              <input
                type="radio"
                checked={mode === 'quantity'}
                onChange={() => setMode('quantity')}
              />{' '}
              Custom quantity
            </label>
          </div>

          {mode === 'plan' ? (
            <label>
              Plan
              <select value={planId} onChange={(e) => setPlanId(Number(e.target.value))} required>
                {(selected?.plans || []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label} — {paiseToInr(p.totalPaise)}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              Quantity
              <input
                type="number"
                min={1}
                value={quantity}
                onChange={(e) => setQuantity(Number(e.target.value))}
                required
              />
              {selected && (
                <span className="muted">
                  Total {paiseToInr(selected.perCreditPaise * quantity)}
                </span>
              )}
            </label>
          )}

          {error && <p className="error">{error}</p>}
          <button type="submit" disabled={loading || !currencyId}>
            {loading ? 'Redirecting…' : 'Pay with Stripe'}
          </button>
        </form>
      </section>

      <section>
        <div className="row between">
          <h2>Ledger</h2>
          <button type="button" onClick={() => refresh()}>
            Refresh
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Currency</th>
              <th>Type</th>
              <th>Delta</th>
              <th>Reference</th>
            </tr>
          </thead>
          <tbody>
            {ledger.map((row) => (
              <tr key={row.id}>
                <td>{new Date(row.createdAt).toLocaleString()}</td>
                <td>{row.currencyCode}</td>
                <td>{row.entryType}</td>
                <td>{row.deltaCredits}</td>
                <td>
                  {row.referenceType}#{row.referenceId}
                </td>
              </tr>
            ))}
            {ledger.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  No ledger entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
