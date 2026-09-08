# Remote persistence

[← README](../README.md)

Pass a `persistenceUrl` (relative or absolute) as the fourth constructor argument and Aspen can push its persistent state to a server and pull it back — so a user's app state follows them across devices.

```js
const State = new StateTree("app.", {
  theme: { type: "string", persistent: true, default: "light" },
}, localStorage, `/state/${userId}`);

// on load: prefer remote state if the server has any
State.validateStorage();
const hadRemoteState = await State.pullPersistent();
State.bootstrap();

// on change (or on an interval / before unload): save to the server
await State.pushPersistent();
```

The protocol is two endpoints on the same URL:

- **`PUT <persistenceUrl>`** — `pushPersistent()` sends `exportPersistent()` as a JSON object of `{storageKey: serializedValue}`. Any 2xx response is success.
- **`GET <persistenceUrl>`** — `pullPersistent()` expects that same JSON object back and feeds it through `importPersistent()` (firing `onUpdate` callbacks). A 404 means "no saved state yet": `pullPersistent()` resolves `false` and leaves local state untouched. Any other non-2xx status throws.

Both methods accept a URL argument that overrides the configured one. Identify the user in the URL (e.g. `/state/123`) or via cookies/headers on your server — and authenticate requests in production; the reference implementation trusts the URL for brevity.

A ready-to-copy FastAPI reference server lives in [`persistence-server/main.py`](persistence-server/main.py):

```sh
pip install fastapi uvicorn
uvicorn main:app --reload
```
