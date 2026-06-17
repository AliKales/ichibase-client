'use client';

import { useState } from 'react';
import { createClient } from '@/lib/ichibase/client';

// Public buckets serve straight from the single-host CDN Worker — no auth, no
// SDK. Private reads + uploads go through the `files` Edge Function instead.
const CDN = 'https://cdn.ichibase.net';

// The project slug is the first label of the project URL host
// (https://<slug>.ichibase.net).
function projectSlug(): string {
  try {
    return new URL(process.env.NEXT_PUBLIC_ICHIBASE_URL!).hostname.split('.')[0];
  } catch {
    return '';
  }
}

type LastResponse = { label: string; ok: boolean; payload: unknown };

function urlFrom(data: unknown): string | null {
  const u = (data as { url?: unknown } | null)?.url;
  return typeof u === 'string' ? u : null;
}

export function StorageClient() {
  const slug = projectSlug();

  const [pubPath, setPubPath] = useState('avatars/logo.png');
  const [pubUrl, setPubUrl] = useState<string | null>(null);

  const [privBucket, setPrivBucket] = useState('private');
  const [privPath, setPrivPath] = useState('reports/q2.pdf');
  const [privUrl, setPrivUrl] = useState<string | null>(null);

  const [upBucket, setUpBucket] = useState('private');
  const [upPath, setUpPath] = useState('notes/hello.txt');

  const [last, setLast] = useState<LastResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // (a) Public read — build the CDN URL on the client, no request needed.
  function buildPublicUrl() {
    setError(null);
    setPubUrl(`${CDN}/${slug}/public/${pubPath.trim().replace(/^\/+/, '')}`);
  }

  // (b) Private read — ask the `files` function for a token-bearing URL.
  async function signRead() {
    setBusy(true);
    setError(null);
    try {
      const { data, error } = await createClient().functions.invoke('files', {
        body: { op: 'get', bucket: privBucket, path: privPath },
      });
      setLast({ label: "functions.invoke('files', op:'get')", ok: !error, payload: error ?? data });
      if (error) {
        setError(error.detail ?? error.code);
        return;
      }
      const u = urlFrom(data);
      setPrivUrl(u);
      if (!u) setError("Function returned no { url } — is the 'files' Edge Function deployed?");
    } catch (e) {
      setError(`${(e as Error).message} — is your origin in the project's CORS allowlist?`);
    } finally {
      setBusy(false);
    }
  }

  // (c) Upload — get a signed PUT url from `files`, then PUT the bytes to it.
  async function upload() {
    setBusy(true);
    setError(null);
    try {
      // Generate the payload first: get-put-url binds the signed URL to the
      // exact byte length, so the function needs the size up front.
      const bytes = new TextEncoder().encode(`hello from ichibase @ ${new Date().toISOString()}`);
      const { data, error } = await createClient().functions.invoke('files', {
        body: {
          op: 'put',
          bucket: upBucket,
          path: upPath,
          content_type: 'text/plain',
          content_length: bytes.length,
        },
      });
      if (error) {
        setLast({ label: "functions.invoke('files', op:'put')", ok: false, payload: error });
        setError(error.detail ?? error.code);
        return;
      }
      const putUrl = urlFrom(data);
      if (!putUrl) {
        setLast({ label: "functions.invoke('files', op:'put')", ok: false, payload: data });
        setError("Function returned no signed PUT url — is the 'files' Edge Function deployed?");
        return;
      }
      // The browser sets Content-Length automatically from the body; it must
      // match the length the URL was signed for, or R2 rejects the PUT.
      const put = await fetch(putUrl, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: bytes,
      });
      setLast({
        label: `PUT signed url → HTTP ${put.status}`,
        ok: put.ok,
        payload: { status: put.status, bytes: bytes.length, path: `${upBucket}/${upPath}` },
      });
      if (!put.ok) setError(`Upload PUT failed: HTTP ${put.status} (R2 CORS for your origin?)`);
    } catch (e) {
      setError(`${(e as Error).message} — R2 CORS / network on the signed PUT?`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card">
        <h2>(a) Public read — straight from the CDN</h2>
        <label htmlFor="pub">Path within the public bucket</label>
        <input id="pub" value={pubPath} onChange={(e) => setPubPath(e.target.value)} />
        <button type="button" className="secondary" onClick={buildPublicUrl}>
          Build CDN URL
        </button>
        {pubUrl && (
          <>
            <p className="muted" style={{ wordBreak: 'break-all' }}>
              <code>{pubUrl}</code>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={pubUrl} alt="" style={{ maxHeight: 160, borderRadius: 8 }} onError={() => {}} />
          </>
        )}
      </div>

      <div className="card">
        <h2>(b) Private read — signed URL via the function</h2>
        <label htmlFor="pb">Bucket</label>
        <input id="pb" value={privBucket} onChange={(e) => setPrivBucket(e.target.value.trim())} />
        <label htmlFor="pp">Path</label>
        <input id="pp" value={privPath} onChange={(e) => setPrivPath(e.target.value.trim())} />
        <button type="button" disabled={busy} onClick={signRead}>
          {busy ? 'Working…' : "invoke('files', op: 'get')"}
        </button>
        {privUrl && (
          <>
            <p className="muted">The URL carries a <code>?token=</code> grant for temporary read access:</p>
            <p className="muted" style={{ wordBreak: 'break-all' }}>
              <code>{privUrl}</code>
            </p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={privUrl} alt="" style={{ maxHeight: 160, borderRadius: 8 }} onError={() => {}} />
          </>
        )}
      </div>

      <div className="card">
        <h2>(c) Upload — signed PUT via the function</h2>
        <label htmlFor="ub">Bucket</label>
        <input id="ub" value={upBucket} onChange={(e) => setUpBucket(e.target.value.trim())} />
        <label htmlFor="updest">Path</label>
        <input id="updest" value={upPath} onChange={(e) => setUpPath(e.target.value.trim())} />
        <button type="button" disabled={busy} onClick={upload}>
          {busy ? 'Uploading…' : "invoke('files', op: 'put') + PUT"}
        </button>
        <p className="muted">
          Generates a small text payload in-app (no file picker), then PUTs it to the signed URL.
        </p>
      </div>

      {error && (
        <div className="card">
          <p className="err" style={{ marginTop: 0 }}>{error}</p>
        </div>
      )}

      <div className="card">
        <h2>Last response</h2>
        {last ? (
          <>
            <p className={last.ok ? 'ok' : 'err'} style={{ marginTop: 0 }}>
              {last.label} → {last.ok ? 'ok' : 'error'}
            </p>
            <pre style={{ margin: 0, overflowX: 'auto', fontSize: 13, color: 'var(--muted)', whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {JSON.stringify(last.payload, null, 2)}
            </pre>
          </>
        ) : (
          <p className="muted">Sign a read or run an upload to see the function&apos;s response.</p>
        )}
      </div>
    </>
  );
}
