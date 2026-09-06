import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * 単体テストの設定。
 *
 * - `@/` は src/ を指す（tsconfig と同じ）
 * - `server-only` は Next.js の実行環境でしか意味を持たないため、空のモジュールに差し替える
 * - Gmail API と DB はテスト内でモックする。実際の Google にも Supabase にも接続しない
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(new URL("./src/test/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    clearMocks: true,
    restoreMocks: true,
    unstubGlobals: true,
    unstubEnvs: true,
  },
});
