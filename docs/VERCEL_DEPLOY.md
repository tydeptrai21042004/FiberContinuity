# Vercel deployment

FiberContinuity v0.1 is intentionally structured as a single static Vite application.

## Why this is simpler than a monorepo

For the first grant/CKBuilder validation phase, there is no need for:

- a separate API service;
- a database;
- a worker queue;
- an auth server; or
- multiple Vercel projects.

Everything required for the demo runs in the browser.

## Deploy from GitHub

1. Push the repository.
2. In Vercel choose **Add New → Project**.
3. Import the GitHub repository.
4. Confirm framework: **Vite**.
5. Confirm build command: `npm run build`.
6. Confirm output: `dist`.
7. Deploy.

`vercel.json` is committed, so the browser-isolation headers are applied automatically.

## Why COOP/COEP are included

Browser/WASM Fiber integrations may use `SharedArrayBuffer`/multithreaded WASM. The committed headers create the cross-origin isolated context those runtimes commonly require.

Avoid third-party scripts/assets that do not satisfy COEP. Host critical assets locally.

## Environment variables

Demo mode: none.

Optional development Fiber bootstrap:

```env
VITE_CKB_RPC_URL=https://testnet.ckbapp.dev/
VITE_FIBER_NETWORK=testnet
```

Do **not** put private keys in Vercel environment variables for a client-side browser wallet. `VITE_*` values are public to the browser bundle.

## Production mode recommendation

A real wallet integration should inject an already-started Fiber/provider into `FiberJsAdapter` and provide reviewed backup/restore hooks. Keep private signing material under the wallet/provider's own security boundary.
