import { describe, expect, it } from "vitest";
import { parseCodexAppUiState } from "../src/codex/app-ui-state.js";

describe("Codex App private UI state", () => {
  it("extracts local projects, task placement, descriptions, and soft deletions", () => {
    const state = parseCodexAppUiState({
      "electron-saved-workspace-roots": ["/workspace/saved"],
      "active-workspace-roots": ["/workspace/active"],
      "project-order": ["remote-project-id", "/workspace/active", "/workspace/saved"],
      "projectless-thread-ids": ["other-thread"],
      "thread-workspace-root-hints": { "hinted-thread": "/workspace/hinted" },
      "thread-project-assignments": {
        "assigned-thread": {
          projectKind: "local",
          projectId: "/workspace/assigned",
        },
        remote: { projectKind: "remote", projectId: "remote-project-id" },
      },
      "electron-persisted-atom-state": {
        "codex-writing-block-deleted-thread-v1:deleted-thread": true,
        "codex-writing-block-deleted-thread-v1:visible-thread": false,
        "thread-descriptions-v1": { "named-thread": "App-generated title" },
      },
    });

    expect(state).not.toBeNull();
    expect(state?.projectRoots).toEqual([
      "/workspace/active",
      "/workspace/saved",
      "/workspace/assigned",
    ]);
    expect(state?.projectOrder).toEqual(["/workspace/active", "/workspace/saved"]);
    expect(state?.projectlessThreadIds.has("other-thread")).toBe(true);
    expect(state?.threadWorkspaceRootHints.get("hinted-thread")).toBe("/workspace/hinted");
    expect(state?.threadProjectAssignments.get("assigned-thread")).toBe("/workspace/assigned");
    expect(state?.deletedThreadIds.has("deleted-thread")).toBe(true);
    expect(state?.deletedThreadIds.has("visible-thread")).toBe(false);
    expect(state?.threadDescriptions.get("named-thread")).toBe("App-generated title");
  });

  it("rejects a non-object root", () => {
    expect(parseCodexAppUiState([])).toBeNull();
  });
});
