import type { FastifyInstance } from "fastify";

export async function registerHealthRoute(app: FastifyInstance): Promise<void> {
  app.get("/health", async () => {
    return {
      status: "ok"
    };
  });
  // Readiness is distinct from liveness: this route is registered only after
  // repository bootstrap and migrations have completed.
  app.get("/ready", async () => ({ status: "ready" }));
}
