import { resolveDatabasePath } from "../config/paths.js";
import { GATEWAY_PROTOCOL_VERSION, GATEWAY_RUNTIME_VERSION } from "../core/build-info.js";
import { readRuntimeHealth } from "../runtime/runtime-status.js";
import { LocalKillSwitch } from "../security/kill-switch.js";
import { CompletionEventStore } from "../storage/event-store.js";
import { OutboundNotificationStore } from "../storage/notification-store.js";
import { openGatewayDatabase } from "../storage/open-store.js";

export function collectGatewayHealth(env: NodeJS.ProcessEnv = process.env) {
  const database = openGatewayDatabase(env);
  try {
    const runtime = readRuntimeHealth(env);
    return {
      status: runtime.running && runtime.compatible ? ("ok" as const) : ("degraded" as const),
      inboundEnabled: new LocalKillSwitch(env).isInboundEnabled(),
      databasePath: resolveDatabasePath(env),
      plugin: {
        runtimeVersion: GATEWAY_RUNTIME_VERSION,
        protocolVersion: GATEWAY_PROTOCOL_VERSION,
      },
      runtime,
      ...new CompletionEventStore(database).counts(),
      notifications: new OutboundNotificationStore(database).counts(),
    };
  } finally {
    database.close();
  }
}
