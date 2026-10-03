# Vercel deployment

FiberContinuity v0.2 remains a single static Vite application. The deterministic demo needs no API service, database, worker queue, auth server, or server-held secret.

## Deploy from GitHub

1. Push the repository.
2. In Vercel choose **Add New → Project**.
3. Import the GitHub repository.
4. Confirm framework: **Vite**.
5. Build command: `npm run build`.
6. Output directory: `dist`.
7. Deploy.

`vercel.json` commits the install/build/output settings and browser security headers.

## Security headers

The deployment includes:

- COOP/COEP/CORP for cross-origin isolation;
- `X-Content-Type-Options: nosniff`;
- frame blocking;
- strict referrer policy;
- restrictive permissions policy; and
- a CSP that permits local scripts/WASM, HTTPS/WSS network connections, and worker blobs while blocking object embedding and framing.

If a future pinned Fiber runtime needs a narrower or different CSP capability, review it explicitly rather than removing the policy wholesale.

## Environment variables

Demo mode: **none**.

Do not place private keys, seed phrases, recovery passwords, or signing material in `VITE_*` variables. Vite exposes those values to the browser bundle.

## Browser Fiber development helper

[`createFiberJsBrowserNode.ts`](../src/adapters/createFiberJsBrowserNode.ts) requires explicit secure-WebSocket (`/wss`) bootnodes and creates ephemeral keys. It is a development bootstrap helper, not a production wallet lifecycle.

A production integration should inject an already-started reviewed Fiber/provider plus the exact native recovery hooks into `FiberJsAdapter`.
