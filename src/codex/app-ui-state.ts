import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";

const DELETED_THREAD_PREFIX = "codex-writing-block-deleted-thread-v1:";

export interface CodexAppUiState {
  readonly projectRoots: readonly string[];
  readonly projectOrder: readonly string[];
  readonly projectlessThreadIds: ReadonlySet<string>;
  readonly threadWorkspaceRootHints: ReadonlyMap<string, string>;
  readonly threadProjectAssignments: ReadonlyMap<string, string>;
  readonly deletedThreadIds: ReadonlySet<string>;
  readonly threadDescriptions: ReadonlyMap<string, string>;
}

export function resolveCodexAppStatePath(env: NodeJS.ProcessEnv = process.env): string {
  const codexHome = env.CODEX_HOME?.trim();
  return join(
    codexHome ? resolve(codexHome) : join(homedir(), ".codex"),
    ".codex-global-state.json",
  );
}

export async function loadCodexAppUiState(
  path = resolveCodexAppStatePath(),
): Promise<CodexAppUiState | null> {
  try {
    return parseCodexAppUiState(JSON.parse(await readFile(path, "utf8")));
  } catch {
    return null;
  }
}

export function parseCodexAppUiState(input: unknown): CodexAppUiState | null {
  if (!isRecord(input)) return null;
  const electronState = recordValue(input["electron-persisted-atom-state"]);
  const savedRoots = stringArray(input["electron-saved-workspace-roots"]);
  const activeRoots = stringArray(input["active-workspace-roots"]);
  const projectOrder = stringArray(input["project-order"]).filter(isAbsolute);
  const assignments = parseProjectAssignments(input["thread-project-assignments"]);
  const assignmentRoots = [...assignments.values()];
  const projectRoots = uniqueStrings([
    ...projectOrder,
    ...savedRoots.filter(isAbsolute),
    ...activeRoots.filter(isAbsolute),
    ...assignmentRoots.filter(isAbsolute),
  ]);

  return {
    projectRoots,
    projectOrder,
    projectlessThreadIds: new Set(stringArray(input["projectless-thread-ids"])),
    threadWorkspaceRootHints: parseStringMap(input["thread-workspace-root-hints"]),
    threadProjectAssignments: assignments,
    deletedThreadIds: new Set(
      Object.entries(electronState)
        .filter(([key, value]) => key.startsWith(DELETED_THREAD_PREFIX) && value === true)
        .map(([key]) => key.slice(DELETED_THREAD_PREFIX.length)),
    ),
    threadDescriptions: parseStringMap(electronState["thread-descriptions-v1"]),
  };
}

function parseProjectAssignments(input: unknown): Map<string, string> {
  const result = new Map<string, string>();
  for (const [threadId, value] of Object.entries(recordValue(input))) {
    if (!isRecord(value) || value.projectKind !== "local") continue;
    const projectId = value.projectId;
    if (typeof projectId === "string" && isAbsolute(projectId)) result.set(threadId, projectId);
  }
  return result;
}

function parseStringMap(input: unknown): Map<string, string> {
  const result = new Map<string, string>();
  for (const [key, value] of Object.entries(recordValue(input))) {
    if (typeof value === "string") result.set(key, value);
  }
  return result;
}

function stringArray(input: unknown): string[] {
  return Array.isArray(input)
    ? input.filter((value): value is string => typeof value === "string")
    : [];
}

function uniqueStrings(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function recordValue(input: unknown): Record<string, unknown> {
  return isRecord(input) ? input : {};
}

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}
