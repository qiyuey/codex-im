#!/usr/bin/env node
import { createGatewayApplication } from "./runtime/create-gateway-application.js";

try {
  const application = createGatewayApplication();
  const stop = (): void => {
    void application.stop();
  };
  process.once("SIGINT", stop);
  process.once("SIGTERM", stop);
  await application.run();
} catch (error: unknown) {
  const kind = error instanceof Error ? error.name : "UnknownError";
  const message = error instanceof Error ? error.message : "Gateway failed";
  process.stderr.write(
    `${JSON.stringify({ level: "error", event: "gateway_crashed", kind, message })}\n`,
  );
  process.exitCode = 1;
}
