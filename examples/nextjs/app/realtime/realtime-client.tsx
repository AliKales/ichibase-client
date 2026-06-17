'use client';

import { useEffect, useRef, useState } from 'react';
import type { Subscription } from '@ichibase/client';
import { createClient } from '@/lib/ichibase/client';

type Row = { at: string; event: string; target: string; record: unknown };

export function RealtimeClient() {
  const [kind, setKind] = useState<'mongo' | 'postgres'>('mongo');
  const [name, setName] = useState('orders');
  const [running, setRunning] = useState(false);
  const [events, setEvents] = useState<Row[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // _id of the last test doc we inserted, so update/delete can target it.
  const [lastId, setLastId] = useState<unknown>(null);
  const subRef = useRef<Subscription | null>(null);

  function stop() {
    subRef.current?.unsubscribe();
    subRef.current = null;
    setRunning(false);
  }

  function start() {
    stop();
    setEvents([]);
    setStatus(null);
    const ichi = createClient();
    const opts =
      kind === 'mongo'
        ? ({ kind: 'mongo', collection: name } as const)
        : ({ kind: 'postgres', table: name } as const);
    subRef.current = ichi.realtime.subscribe(opts, (msg) => {
      if (msg.type !== 'change') return; // ignore subscribed/pong/etc.
      setEvents((prev) =>
        [
          {
            at: new Date().toLocaleTimeString(),
            event: String(msg.event),
            target: msg.collection ?? msg.table ?? '',
            record: msg.record ?? msg.old ?? null,
          },
          ...prev,
        ].slice(0, 50),
      );
    });
    setRunning(true);
  }

  // Run a write on THIS page so the subscription above receives the event.
  // Navigating to the Mongo/Postgres page to make a change would unmount this
  // component and close the socket — so you'd never see it.
  async function run(label: string, fn: () => Promise<{ error?: { code: string; detail?: string } | null }>) {
    setBusy(true);
    setStatus(null);
    try {
      const { error } = await fn();
      setStatus(error ? `${label} error: ${error.detail ?? error.code}` : `${label} ok — watch for the event below.`);
      return !error;
    } catch (e) {
      setStatus(`${(e as Error).message} — is your origin in the project's CORS allowlist?`);
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function insert() {
    if (kind !== 'mongo') {
      await run('insert', async () => createClient().from(name).insert({ note: `rt-${Date.now()}` }));
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const { data, error } = await createClient().mongo.collection(name).insertOne({ item: 'rt-test', total: 1 });
      if (error) {
        setStatus(`insert error: ${error.detail ?? error.code}`);
        return;
      }
      const d = data as Record<string, unknown> | undefined;
      setLastId(d?._id ?? d?.insertedId ?? null);
      setStatus('insertOne ok — watch for an "insert" event, then try update / delete.');
    } catch (e) {
      setStatus(`${(e as Error).message} — is your origin in the project's CORS allowlist?`);
    } finally {
      setBusy(false);
    }
  }

  function bumpLast() {
    return run('updateOne', () =>
      createClient().mongo.collection(name).updateOne({ _id: lastId }, { $inc: { total: 1 } }),
    );
  }

  async function deleteLast() {
    const ok = await run('deleteOne', () => createClient().mongo.collection(name).deleteOne({ _id: lastId }));
    if (ok) setLastId(null);
  }

  // Always close the socket when leaving the page.
  useEffect(() => () => stop(), []);

  const isErr = status != null && /error|CORS|allowlist/i.test(status);
  const canMutate = running && !busy && lastId != null;

  return (
    <>
      <div className="card">
        <h2>Subscription</h2>
        <div className="row">
          <select
            value={kind}
            onChange={(e) => setKind(e.target.value as 'mongo' | 'postgres')}
            disabled={running}
            aria-label="kind"
          >
            <option value="mongo">mongo</option>
            <option value="postgres">postgres</option>
          </select>
          <input
            value={name}
            onChange={(e) => setName(e.target.value.trim())}
            disabled={running}
            placeholder={kind === 'mongo' ? 'collection' : 'table'}
            aria-label="name"
          />
          {running ? (
            <button type="button" className="secondary" style={{ marginTop: 0 }} onClick={stop}>
              Stop
            </button>
          ) : (
            <button type="button" style={{ marginTop: 0 }} onClick={start}>
              Start
            </button>
          )}
        </div>
        <p className={running ? 'ok' : 'muted'}>
          {running ? `Listening on ${kind}:${name}` : 'Not subscribed.'}
        </p>
      </div>

      <div className="card">
        <h2>Trigger a change</h2>
        <p className="muted">
          Write to <code>{name}</code> from this same page so the event arrives here. For Mongo,
          insert first, then update (<code>$inc</code>) / delete the same doc to see all three event
          types.
        </p>
        <div className="row">
          <button type="button" style={{ marginTop: 0 }} disabled={!running || busy} onClick={insert}>
            {kind === 'mongo' ? 'insertOne' : 'insert row'}
          </button>
          {kind === 'mongo' && (
            <>
              <button type="button" className="secondary" style={{ marginTop: 0 }} disabled={!canMutate} onClick={bumpLast}>
                updateOne ($inc)
              </button>
              <button type="button" className="secondary" style={{ marginTop: 0 }} disabled={!canMutate} onClick={deleteLast}>
                deleteOne
              </button>
            </>
          )}
        </div>
        {status && <p className={isErr ? 'err' : 'ok'}>{status}</p>}
      </div>

      <div className="card">
        <h2>Events ({events.length})</h2>
        <ul className="list">
          {events.length === 0 ? (
            <li className="muted">
              No events yet. Start a subscription, then insert / update / delete above.
            </li>
          ) : (
            events.map((ev, i) => (
              <li key={i}>
                <strong>{ev.event}</strong> <span className="muted">· {ev.target} · {ev.at}</span>
                <br />
                <code style={{ overflowX: 'auto' }}>{JSON.stringify(ev.record)}</code>
              </li>
            ))
          )}
        </ul>
      </div>
    </>
  );
}
