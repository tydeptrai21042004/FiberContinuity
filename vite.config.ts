import { configDefaults, defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Hosted API checks use node:test and are run separately with
  // `npm run test:hosted-api`. Vitest must not collect that file.
  test: {
    exclude: [...configDefaults.exclude, "tests/hosted-api.test.mjs"]
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
