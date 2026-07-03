import { parseRuntimeEnv, toRuntimeSettings } from "@docker-image-builder-system/shared-config";

import { createApp } from "./app/create-app.js";

async function main(): Promise<void> {
  const env = parseRuntimeEnv(process.env);
  const runtime = toRuntimeSettings(env);
  const app = await createApp(runtime);

  await app.listen({
    port: runtime.port,
    host: "0.0.0.0"
  });
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
