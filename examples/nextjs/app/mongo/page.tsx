import { MongoClient } from './mongo-client';

export default function MongoPage() {
  return (
    <>
      <h1>MongoDB (client-side)</h1>
      <p>
        CRUD on an <code>orders</code> collection from the browser with{' '}
        <code>ichi.mongo.collection(&apos;orders&apos;)</code>:{' '}
        <code>insertOne</code>, <code>find</code>, <code>count</code>, <code>aggregate</code>, plus
        per-row <code>$inc</code> (the <strong>total += 1</strong> button) and{' '}
        <code>deleteOne</code>. Your collection&apos;s Mongo policy (<code>_mongo_policy</code>)
        gates every op — an own-docs policy scopes results to your user. Requires your app origin in
        the project&apos;s CORS allowlist.
      </p>
      <MongoClient />
    </>
  );
}
