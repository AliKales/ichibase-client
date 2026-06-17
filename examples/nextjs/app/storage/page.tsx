import { StorageClient } from './storage-client';

export default function StoragePage() {
  return (
    <>
      <h1>Storage (client-side)</h1>
      <p>
        The anon client has <strong>no storage module</strong> — by design, it never sees the
        service key. Public files load straight from <code>cdn.ichibase.net</code>; private reads
        and uploads go through your <code>files</code> Edge Function, which signs URLs with the
        service key server-side. Deploy <code>edge_functions/files.ts</code> to your project for (b)
        and (c) to work.
      </p>
      <StorageClient />
    </>
  );
}
