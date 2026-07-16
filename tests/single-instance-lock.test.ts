import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SingleInstanceLock } from "../src/runtime/single-instance-lock.js";

describe("SingleInstanceLock", () => {
  it("rejects a second live daemon and allows reuse after release", () => {
    const directory = mkdtempSync(join(tmpdir(), "gateway-lock-"));
    const path = join(directory, "daemon.lock");
    try {
      const first = new SingleInstanceLock(path, process.pid);
      const second = new SingleInstanceLock(path, process.pid);
      first.acquire();
      expect(() => second.acquire()).toThrow(`already running with PID ${process.pid}`);
      first.release();
      second.acquire();
      second.release();
    } finally {
      rmSync(directory, { force: true, recursive: true });
    }
  });
});
