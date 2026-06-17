'use client';

import { useCallback, useEffect, useState } from 'react';
import { createClient } from '@/lib/ichibase/client';

const COLLECTION = 'orders';

type Doc = Record<string, unknown> & { _id?: unknown; item?: unknown; total?: unknown };

// Raw view of the last operation's response — mirrors the Flutter example's
// "Last response" card so you can see exactly what the gateway returned.
type LastResponse = { label: string; ok: boolean; payload: unknown };

function shortId(id: unknown): string {
  const s = String(id ?? '');
  return s.length <= 10 ? s : `…${s.slice(-6)}`;
}

export function MongoClient() {
  const [item, setItem] = useState('taco');
  const [total, setTotal] = useState('5');
  const [docs, setDocs] = useState<Doc[]>([]);
  const [last, setLast] = useState<LastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const orders = () => createClient().mongo.collection(COLLECTION);

  // find({}) — newest first. Drives the list; optionally records the raw result.
  const load = useCallback(async (setResult = false) => {
    try {
      const { data, error } = await orders().find({}, { sort: { _id: -1 }, limit: 50 });
      if (error) {
        setError(error.detail ?? error.code);
        if (setResult) setLast({ label: 'find({})', ok: false, payload: error });
        return;
      }
      setError(null);
      setDocs((data?.docs as Doc[]) ?? []);
      if (setResult) setLast({ label: 'find({})', ok: true, payload: data });
    } catch (e) {
      // Network/CORS failures throw rather than returning an error result.
      setError(`${(e as Error).message} — is your origin in the project's CORS allowlist?`);
      setDocs([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Run an op, capture its raw response, surface errors, and reload the list.
  async function run(
    label: string,
    action: () => Promise<{ data?: unknown; error?: { code: string; detail?: string } | null }>,
    opts: { reload?: boolean } = {},
  ) {
    const { reload = true } = opts;
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await action();
      if (error) {
        setError(error.detail ?? error.code);
        setLast({ label, ok: false, payload: error });
        return;
      }
      setLast({ label, ok: true, payload: data });
      if (reload) await load();
    } catch (e) {
      setError(`${(e as Error).message} — is your origin in the project's CORS allowlist?`);
    } finally {
      setBusy(false);
    }
  }

  async function insert(e: React.FormEvent) {
    e.preventDefault();
    const t = Number(total);
    if (!item.trim() || Number.isNaN(t)) {
      setError('Enter an item and a numeric total.');
      return;
    }
    await run('insertOne', () => orders().insertOne({ item: item.trim(), total: t }));
  }

  // The increment demo: $inc bumps total by 1 on the doc with this _id. The _id
  // comes back from find() as a bare hex string; mongo-gate coerces a 24-hex _id
  // back to an ObjectId so the filter matches the stored document.
  async function bump(id: unknown) {
    await run('updateOne · $inc total +1', () =>
      orders().updateOne({ _id: id }, { $inc: { total: 1 } }),
    );
  }

  async function remove(id: unknown) {
    await run('deleteOne', () => orders().deleteOne({ _id: id }));
  }

  async function count() {
    await run('count({})', () => orders().count({}), { reload: false });
  }

  async function aggregate() {
    // Tiny but real pipeline: total revenue + order count.
    await run(
      'aggregate · revenue',
      () =>
        orders().aggregate([
          { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
        ]),
      { reload: false },
    );
  }

  return (
    <>
      <div className="card">
        <h2>Add an order</h2>
        <form onSubmit={insert}>
          <label htmlFor="item">Item</label>
          <input id="item" value={item} onChange={(e) => setItem(e.target.value)} placeholder="item…" />
          <label htmlFor="total">Total</label>
          <input
            id="total"
            value={total}
            inputMode="decimal"
            onChange={(e) => setTotal(e.target.value)}
            placeholder="total…"
          />
          <div className="row" style={{ marginTop: 16 }}>
            <button disabled={busy}>{busy ? 'Working…' : 'insertOne'}</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => load(true)}>
              find(&#123;&#125;)
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={count}>
              count
            </button>
            <button type="button" className="secondary" disabled={busy} onClick={aggregate}>
              aggregate
            </button>
          </div>
        </form>
        {error && <p className="err">{error}</p>}
      </div>

      <div className="card">
        <h2>
          {COLLECTION} ({docs.length})
        </h2>
        {docs.length === 0 ? (
          <p className="muted">
            No documents loaded. A fresh free Mongo project denies all access until you set a
            collection policy (<code>_mongo_policy</code>) in the dashboard.
          </p>
        ) : (
          <ul className="list">
            {docs.map((d, i) => (
              <li
                key={String(d._id ?? i)}
                className="row"
                style={{ justifyContent: 'space-between', alignItems: 'center' }}
              >
                <span>
                  <strong>{String(d.item ?? '(no item)')}</strong>{' '}
                  <span className="muted">
                    · total: {String(d.total)} · {shortId(d._id)}
                  </span>
                </span>
                {d._id != null && (
                  <span className="row" style={{ flex: '0 0 auto' }}>
                    <button
                      className="secondary"
                      style={{ marginTop: 0 }}
                      disabled={busy}
                      onClick={() => bump(d._id)}
                      title="$inc total by 1"
                    >
                      total += 1
                    </button>
                    <button
                      className="secondary"
                      style={{ marginTop: 0 }}
                      disabled={busy}
                      onClick={() => remove(d._id)}
                    >
                      Delete
                    </button>
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h2>Last response</h2>
        {last ? (
          <>
            <p className={last.ok ? 'ok' : 'err'} style={{ marginTop: 0 }}>
              {last.label} → {last.ok ? 'ok' : 'error'}
            </p>
            <pre
              style={{
                margin: 0,
                overflowX: 'auto',
                fontSize: 13,
                color: 'var(--muted)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
              }}
            >
              {JSON.stringify(last.payload, null, 2)}
            </pre>
          </>
        ) : (
          <p className="muted">Run an operation to see the raw gateway response.</p>
        )}
      </div>
    </>
  );
}
