import { FormEvent, useEffect, useState } from 'react';
import { api } from '../api';

type Campaign = {
  id: number;
  title: string;
  fundAmountCredits: number;
  status: string;
  fundedAt: string | null;
  createdAt: string;
};

export default function CampaignsPage() {
  const [items, setItems] = useState<Campaign[]>([]);
  const [title, setTitle] = useState('');
  const [fundAmountCredits, setFundAmountCredits] = useState(50);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  async function refresh() {
    const data = await api<Campaign[]>('/campaigns');
    setItems(data);
  }

  useEffect(() => {
    refresh().catch((err) => setError(err instanceof Error ? err.message : 'Failed to load'));
  }, []);

  async function create(e: FormEvent) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api('/campaigns', {
        method: 'POST',
        body: JSON.stringify({ title, fundAmountCredits }),
      });
      setTitle('');
      setMessage('Campaign created');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Create failed');
    }
  }

  async function fund(id: number) {
    setError('');
    setMessage('');
    try {
      await api(`/campaigns/${id}/fund`, { method: 'POST', body: JSON.stringify({}) });
      setMessage(`Campaign #${id} funded with Campaign Credits`);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fund failed');
    }
  }

  return (
    <div className="stack gap-sm">
      <div className="page-intro">
        <h1>Campaigns</h1>
        <p className="muted">Funded only with Campaign Credits. Other currencies are rejected.</p>
        {error && <p className="error">{error}</p>}
        {message && <p className="info">{message}</p>}
      </div>

      <section className="panel">
        <h2>Create campaign</h2>
        <form onSubmit={create} className="stack">
          <label>
            Title
            <input value={title} onChange={(e) => setTitle(e.target.value)} required />
          </label>
          <label>
            Fund amount (Campaign Credits)
            <input
              type="number"
              min={1}
              value={fundAmountCredits}
              onChange={(e) => setFundAmountCredits(Number(e.target.value))}
              required
            />
          </label>
          <button type="submit">Create</button>
        </form>
      </section>

      <section>
        <div className="section-head">
          <h2>Your campaigns</h2>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Title</th>
                <th>Credits</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id}>
                  <td>{c.id}</td>
                  <td>{c.title}</td>
                  <td>{c.fundAmountCredits}</td>
                  <td>{c.status}</td>
                  <td>
                    {c.status === 'draft' ? (
                      <button type="button" onClick={() => fund(c.id)}>
                        Fund
                      </button>
                    ) : (
                      <span className="muted">Funded</span>
                    )}
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={5} className="muted">
                    No campaigns yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
