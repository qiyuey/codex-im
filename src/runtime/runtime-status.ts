import { chmodSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { resolveDataDirectory } from "../config/paths.js";
import { GATEWAY_PROTOCOL_VERSION, GATEWAY_RUNTIME_VERSION } from "../core/build-info.js";

export const DEFAULT_HEARTBEAT_INTERVAL_MS = 5_000;
export const DEFAULT_HEARTBEAT_STALE_AFTER_MS = 20_000;

export interface RuntimeStatusRecord {
  readonly schemaVersion: 1;
  readonly state: "running" | "stopped";
  readonly pid: number;
  readonly runtimeVersion: string;
  readonly protocolVersion: number;
  readonly startedAt: number;
  readonly heartbeatAt: number;
  readonly appServerConnected: boolean | null;
  readonly stoppedAt?: number;
}

export interface RuntimeHealth {
  readonly running: boolean;
  readonly state: "running" | "stopped" | "stale" | "unknown";
  readonly pid: number | null;
  readonly runtimeVersion: string | null;
  readonly protocolVersion: number | null;
  readonly heartbeatAt: number | null;
  readonly heartbeatAgeMs: number | null;
  readonly appServerConnected: boolean | null;
  readonly compatible: boolean;
}

export function resolveRuntimeStatusPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(resolveDataDirectory(env), "runtime-status.json");
}

export class RuntimeStatusWriter {
  private readonly startedAt: number;
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly path = resolveRuntimeStatusPath(),
    private readonly now: () => number = Date.now,
    private readonly pid = process.pid,
    private readonly appServerConnected: () => boolean | null = () => null,
  ) {
    this.startedAt = now();
  }

  start(intervalMs = DEFAULT_HEARTBEAT_INTERVAL_MS): void {
    if (this.timer) return;
    this.write("running");
    this.timer = setInterval(() => this.write("running"), intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    const current = readRuntimeStatus(this.path);
    if (!current || current.pid === this.pid) this.write("stopped");
  }

  private write(state: RuntimeStatusRecord["state"]): void {
    const timestamp = this.now();
    const record: RuntimeStatusRecord = {
      schemaVersion: 1,
      state,
      pid: this.pid,
      runtimeVersion: GATEWAY_RUNTIME_VERSION,
      protocolVersion: GATEWAY_PROTOCOL_VERSION,
      startedAt: this.startedAt,
      heartbeatAt: timestamp,
      appServerConnected: this.appServerConnected(),
      ...(state === "stopped" ? { stoppedAt: timestamp } : {}),
    };
    mkdirSync(dirname(this.path), { mode: 0o700, recursive: true });
    const temporaryPath = `${this.path}.${this.pid}.tmp`;
    try {
      writeFileSync(temporaryPath, `${JSON.stringify(record)}\n`, { mode: 0o600 });
      chmodSync(temporaryPath, 0o600);
      renameSync(temporaryPath, this.path);
    } finally {
      rmSync(temporaryPath, { force: true });
    }
  }
}

export function readRuntimeHealth(
  env: NodeJS.ProcessEnv = process.env,
  now = Date.now(),
  staleAfterMs = DEFAULT_HEARTBEAT_STALE_AFTER_MS,
): RuntimeHealth {
  const record = readRuntimeStatus(resolveRuntimeStatusPath(env));
  if (!record) return unknownHealth();
  const heartbeatAgeMs = Math.max(0, now - record.heartbeatAt);
  const processAlive = record.state === "running" && isProcessAlive(record.pid);
  const running = processAlive && heartbeatAgeMs <= staleAfterMs;
  return {
    running,
    state: running ? "running" : record.state === "stopped" ? "stopped" : "stale",
    pid: record.pid,
    runtimeVersion: record.runtimeVersion,
    protocolVersion: record.protocolVersion,
    heartbeatAt: record.heartbeatAt,
    heartbeatAgeMs,
    appServerConnected: record.appServerConnected,
    compatible: record.protocolVersion === GATEWAY_PROTOCOL_VERSION,
  };
}

function readRuntimeStatus(path: string): RuntimeStatusRecord | null {
  try {
    const value = JSON.parse(readFileSync(path, "utf8")) as Partial<RuntimeStatusRecord>;
    if (
      value.schemaVersion !== 1 ||
      (value.state !== "running" && value.state !== "stopped") ||
      typeof value.pid !== "number" ||
      typeof value.runtimeVersion !== "string" ||
      typeof value.protocolVersion !== "number" ||
      typeof value.startedAt !== "number" ||
      typeof value.heartbeatAt !== "number" ||
      (value.appServerConnected !== undefined &&
        value.appServerConnected !== null &&
        typeof value.appServerConnected !== "boolean")
    ) {
      return null;
    }
    return {
      ...value,
      appServerConnected: value.appServerConnected ?? null,
    } as RuntimeStatusRecord;
  } catch {
    return null;
  }
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

function unknownHealth(): RuntimeHealth {
  return {
    running: false,
    state: "unknown",
    pid: null,
    runtimeVersion: null,
    protocolVersion: null,
    heartbeatAt: null,
    heartbeatAgeMs: null,
    appServerConnected: null,
    compatible: false,
  };
}
