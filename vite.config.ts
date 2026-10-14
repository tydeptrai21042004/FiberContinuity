import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { sourceFingerprint } from "./scripts/source-fingerprint.mjs";

export default defineConfig({
  plugins: [react()],
  // Fail closed if hosted CI is running against older Vercel source, even
  // when package.json still displays the same application version.
  define: { __HOSTED_SOURCE_FINGERPRINT__: JSON.stringify(sourceFingerprint()) },
  // Hosted API checks use node:test and are run separately with
  // `npm run test:hosted-api`. Vitest must not collect that file.
  test: {
    exclude: [...configDefaults.exclude, "tests/*.test.mjs"]
  },
  build: {
    target: "es2022",
    sourcemap: false
  },
  worker: {
    format: "es"
  },
  optimizeDeps: {
    exclude: ["@nervosnetwork/fiber-js"]
  },
  server: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin"
    }
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
      "Cross-Origin-Resource-Policy": "same-origin"
    }
  }
});
