import { RealtimeClient } from './realtime-client';

export default function RealtimePage() {
  return (
    <>
      <h1>Realtime (client-side)</h1>
      <p>
        Opens a WebSocket from the browser with <code>ichi.realtime.subscribe(...)</code>, authed by
        your cookie session. Subscribe to a Mongo collection or a Postgres table, then use the{' '}
        <strong>Trigger a change</strong> button below to insert a test row from this same page and
        watch the event arrive. (Triggering from another page would unmount this component and close
        the socket first.) Your realtime rules scope which changes you receive.
      </p>
      <RealtimeClient />
    </>
  );
}
