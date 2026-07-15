import { createHash } from "node:crypto";
import { realpath } from "node:fs/promises";
import { basename, isAbsolute, relative } from "node:path";
import type { CodexAppUiState } from "../codex/app-ui-state.js";
import { isWorkspaceAllowed } from "../security/workspace.js";

export const NO_PROJECT_ID = "none";

export interface ProjectThread {
  readonly id: string;
  readonly cwd: string;
  readonly name: string | null;
  readonly preview: string;
}

export interface ThreadProject {
  readonly id: string;
  readonly label: string;
  readonly root: string;
  readonly threads: readonly ProjectThread[];
}

export interface ThreadProjectCatalog {
  readonly projects: readonly ThreadProject[];
  readonly noProjectThreads: readonly ProjectThread[];
}

export async function buildThreadProjectCatalog(
  threads: readonly ProjectThread[],
  allowedRoots: readonly string[],
  appUiState?: CodexAppUiState | null,
): Promise<ThreadProjectCatalog> {
  if (appUiState) return buildCodexAppProjectCatalog(threads, allowedRoots, appUiState);
  return {
    projects: [],
    noProjectThreads: await allowedThreads(threads, allowedRoots),
  };
}

async function buildCodexAppProjectCatalog(
  threads: readonly ProjectThread[],
  allowedRoots: readonly string[],
  appUiState: CodexAppUiState,
): Promise<ThreadProjectCatalog> {
  const configuredProjects = new Map<string, { root: string; threads: ProjectThread[] }>();
  const configuredAliases = new Map<string, string>();
  for (const root of appUiState.projectRoots) {
    const canonical = await canonicalAllowedPath(root, allowedRoots);
    if (!canonical) continue;
    configuredAliases.set(root, canonical);
    if (!configuredProjects.has(canonical)) {
      configuredProjects.set(canonical, { root: canonical, threads: [] });
    }
  }

  const noProjectThreads: ProjectThread[] = [];
  for (const originalThread of threads) {
    if (appUiState.deletedThreadIds.has(originalThread.id)) continue;
    if (!(await isWorkspaceAllowed(originalThread.cwd, allowedRoots))) continue;
    const thread = withAppDescription(originalThread, appUiState);
    if (appUiState.projectlessThreadIds.has(thread.id)) {
      noProjectThreads.push(thread);
      continue;
    }

    const assignedRoot = appUiState.threadProjectAssignments.get(thread.id);
    const hintedRoot = appUiState.threadWorkspaceRootHints.get(thread.id);
    const candidateRoot = assignedRoot ?? hintedRoot ?? thread.cwd;
    const canonicalCandidate = await canonicalAllowedPath(candidateRoot, allowedRoots);
    if (!canonicalCandidate) {
      noProjectThreads.push(thread);
      continue;
    }
    const configuredRoot = nearestContainingRoot(canonicalCandidate, configuredProjects.keys());
    const project = configuredRoot ? configuredProjects.get(configuredRoot) : undefined;
    if (project) project.threads.push(thread);
    else noProjectThreads.push(thread);
  }

  const orderedRoots = appUiState.projectOrder
    .map((root) => configuredAliases.get(root))
    .filter((root): root is string => Boolean(root));
  const projectCandidates = [
    ...orderedRoots.map((root) => configuredProjects.get(root)),
    ...configuredProjects.values(),
  ];
  const projects: Array<{ root: string; threads: ProjectThread[] }> = [];
  const seenRoots = new Set<string>();
  for (const project of projectCandidates) {
    if (!project || seenRoots.has(project.root)) continue;
    seenRoots.add(project.root);
    projects.push(project);
  }

  return {
    projects: projects.map(toThreadProject),
    noProjectThreads,
  };
}

function withAppDescription(thread: ProjectThread, appUiState: CodexAppUiState): ProjectThread {
  const description = appUiState.threadDescriptions.get(thread.id)?.trim();
  return description ? { ...thread, name: description } : thread;
}

async function canonicalAllowedPath(
  path: string,
  allowedRoots: readonly string[],
): Promise<string | null> {
  if (!isAbsolute(path) || !(await isWorkspaceAllowed(path, allowedRoots))) return null;
  try {
    return await realpath(path);
  } catch {
    return null;
  }
}

function nearestContainingRoot(candidate: string, roots: Iterable<string>): string | null {
  return (
    [...roots]
      .filter((root) => isContained(root, candidate))
      .sort((left, right) => right.length - left.length)[0] ?? null
  );
}

function toThreadProject(project: { root: string; threads: ProjectThread[] }): ThreadProject {
  return {
    id: projectId(project.root),
    label: basename(project.root) || project.root,
    root: project.root,
    threads: project.threads,
  };
}

async function allowedThreads(
  threads: readonly ProjectThread[],
  allowedRoots: readonly string[],
): Promise<ProjectThread[]> {
  const result: ProjectThread[] = [];
  for (const thread of threads) {
    if (await isWorkspaceAllowed(thread.cwd, allowedRoots)) result.push(thread);
  }
  return result;
}

function isContained(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

function projectId(root: string): string {
  return createHash("sha256").update(root).digest("base64url").slice(0, 16);
}
