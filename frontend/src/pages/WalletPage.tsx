import { FormEvent, ReactNode, useEffect, useRef, useState } from 'react';
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

function formatWhen(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(d);
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
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const checkoutIdempotencyKey = useRef<string | null>(null);

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

  async function onRefreshClick() {
    setRefreshing(true);
    setError('');
    try {
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh');
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh()
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setInitialLoading(false));
  }, []);

  useEffect(() => {
    if (selected?.plans[0]) setPlanId(selected.plans[0].id);
  }, [currencyId]);

  async function buy(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (!checkoutIdempotencyKey.current) {
        checkoutIdempotencyKey.current = crypto.randomUUID();
      }

      const body =
        mode === 'plan'
          ? { currencyId: Number(currencyId), planId: Number(planId) }
          : { currencyId: Number(currencyId), quantity: Number(quantity) };

      const data = await api<{ checkoutUrl: string }>('/checkout/sessions', {
        method: 'POST',
        body: JSON.stringify(body),
        headers: { 'Idempotency-Key': checkoutIdempotencyKey.current },
      });
      window.location.href = data.checkoutUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Checkout failed');
      setLoading(false);
    }
  }

  let balancesContent: ReactNode;
  if (initialLoading) {
    balancesContent = (
      <div className="balance-grid">
        {[0, 1, 2].map((i) => (
          <div key={i} className="balance-card balance-card-stack">
            <div className="skeleton skeleton-text" style={{ width: '55%' }} />
            <div className="skeleton skeleton-number" />
            <div className="skeleton skeleton-text" style={{ width: '70%' }} />
          </div>
        ))}
      </div>
    );
  } else if (balances.length === 0) {
    balancesContent = (
      <div className="empty-state">No balances yet — buy credits to get started.</div>
    );
  } else {
    balancesContent = (
      <div className="balance-grid">
        {balances.map((b) => (
          <div key={b.currencyId} className="balance-card balance-card-stack">
            <strong>{b.name}</strong>
            <div className="big">{b.balanceCredits}</div>
            <div className="muted">
              {b.code} · module: {b.module}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="stack gap-sm">
      <div className="page-intro">
        <h1>Wallet</h1>
      </div>

      <section className="wallet-balances">
        <div className="section-head">
          <h2>Balances</h2>
        </div>
        {balancesContent}
      </section>

      <div className="wallet-layout">
        <section className="panel wallet-buy">
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

            <div className="radio-row">
              <label>
                <input
                  type="radio"
                  checked={mode === 'plan'}
                  onChange={() => setMode('plan')}
                />
                Plan
              </label>
              <label>
                <input
                  type="radio"
                  checked={mode === 'quantity'}
                  onChange={() => setMode('quantity')}
                />
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

        <section className="wallet-ledger">
          <div className="section-head">
            <h2>Ledger</h2>
            <button
              type="button"
              className="secondary"
              onClick={onRefreshClick}
              disabled={refreshing || initialLoading}
            >
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </button>
          </div>
          <div className="table-wrap">
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
                {initialLoading || refreshing ? (
                  [0, 1, 2, 3].map((i) => (
                    <tr key={i}>
                      {[0, 1, 2, 3, 4].map((j) => (
                        <td key={j}>
                          <div className="skeleton skeleton-text" />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (
                  <>
                    {ledger.map((row) => (
                      <tr key={row.id}>
                        <td>{formatWhen(row.createdAt)}</td>
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
                  </>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
