import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { CodexAppUiState } from "../src/codex/app-ui-state.js";
import { buildThreadProjectCatalog } from "../src/telegram/thread-projects.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((path) => rm(path, { force: true, recursive: true })),
  );
});

describe("thread project catalog", () => {
  it("never infers a project from a task cwd when App state is unavailable", async () => {
    const allowed = await realpath(await mkdtemp(join(tmpdir(), "gateway-no-app-state-")));
    temporaryDirectories.push(allowed);
    await mkdir(join(allowed, ".git"));

    const catalog = await buildThreadProjectCatalog(
      [{ id: "thread", cwd: allowed, name: "Task", preview: "" }],
      [allowed],
      null,
    );

    expect(catalog.projects).toEqual([]);
    expect(catalog.noProjectThreads.map((thread) => thread.id)).toEqual(["thread"]);
  });

  it("mirrors Codex App project order, task placement, titles, and soft deletions", async () => {
    const allowed = await realpath(await mkdtemp(join(tmpdir(), "gateway-app-projects-")));
    temporaryDirectories.push(allowed);
    const workbench = join(allowed, "workbench");
    const gateway = join(allowed, "gateway");
    const synapse = join(allowed, "synapse");
    const dynamic = join(allowed, "dynamic");
    await Promise.all([workbench, gateway, synapse, dynamic].map((path) => mkdir(path)));

    const appUiState: CodexAppUiState = {
      projectRoots: [workbench, gateway, synapse],
      projectOrder: [workbench, gateway, synapse],
      projectlessThreadIds: new Set(["other-thread"]),
      threadWorkspaceRootHints: new Map(),
      threadProjectAssignments: new Map(),
      deletedThreadIds: new Set(["deleted-thread"]),
      threadDescriptions: new Map([["workbench-thread", "Private App title"]]),
    };

    const catalog = await buildThreadProjectCatalog(
      [
        { id: "dynamic-thread", cwd: dynamic, name: "Dynamic", preview: "" },
        { id: "workbench-thread", cwd: workbench, name: "API title", preview: "" },
        { id: "deleted-thread", cwd: gateway, name: "Deleted", preview: "" },
        { id: "other-thread", cwd: dynamic, name: "Other", preview: "" },
      ],
      [allowed],
      appUiState,
    );

    expect(catalog.projects.map((project) => project.label)).toEqual([
      "workbench",
      "gateway",
      "synapse",
    ]);
    expect(catalog.projects[0]?.threads[0]?.name).toBe("Private App title");
    expect(catalog.projects[1]?.threads).toEqual([]);
    expect(catalog.projects[2]?.threads).toEqual([]);
    expect(catalog.noProjectThreads.map((thread) => thread.id)).toEqual([
      "dynamic-thread",
      "other-thread",
    ]);
  });
});
