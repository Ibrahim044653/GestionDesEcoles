import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // globalSetup provisionne une base SQLite jetable et positionne
    // DATABASE_URL avant le chargement du moindre module applicatif.
    globalSetup: ["./tests/global-setup.ts"],
    // Un seul processus : les tests d'integration partagent la meme base et
    // s'executent sequentiellement, ce qui rend les resultats deterministes.
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
