# Upstream integration notes

These notes describe assumptions encoded by the reference adapter. Revalidate them against the exact pinned Fiber release before a real-funds integration.

## Fiber JS boundary

The project depends on `@nervosnetwork/fiber-js` 0.9.1. The development helper uses `Fiber`, `randomSecretKey`, and `getDefaultConfig()`, then requires the caller to provide browser-compatible secure-WebSocket bootnodes explicitly.

The helper intentionally uses ephemeral keys. Production applications should inject their existing provider/account lifecycle.

## Native recovery

FiberContinuity treats native backup bytes as opaque. `FiberJsAdapter` refuses to guess an undocumented backup/restore RPC and requires explicit `NativeRecoveryHooks` from the pinned host integration.

## Compatibility policy

Identical Fiber versions are supported by the generic reference policy. Other version pairs remain `review` unless a rule is deliberately registered. `review` is a blocking state, not a soft warning.

The existing explicit rule blocks older data into `0.10.0-rc1` based on the prerelease upgrade limitation identified during the original repository research. Recheck this rule whenever the pinned upstream version changes.

## Observable history

The reference `FiberJsAdapter` normalizes node identity and channel metadata from its documented command surface. It does not invent payment/invoice history field shapes. Until a pinned integration exposes them intentionally, those record families are marked `unavailable` and recovery verification reports `UNKNOWN`.
