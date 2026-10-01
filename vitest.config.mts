import { fileURLToPath } from "node:url"

import { defineConfig } from "vitest/config"

/**
 * Vitest configuration.
 *
 * The suites cover the pure checkout logic (delivery fees, the Zod contract),
 * so they run in a plain Node environment with no DOM or React renderer — no
 * jsdom dependency required. `@/*` is resolved the same way `tsconfig.json`
 * defines it, so tests import modules exactly as application code does.
 *
 * `.mts` so this is loaded as ESM while the package itself stays CommonJS, the
 * same arrangement `next.config.ts` and the rest of the repo rely on.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["**/*.test.ts"],
    exclude: ["node_modules/**", ".next/**", "out/**"],
  },
})