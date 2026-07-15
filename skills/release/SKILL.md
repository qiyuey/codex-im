---
name: release
description: "Publish the Codex IM Gateway plugin through a guarded end-to-end release workflow: refresh the plugin cachebuster, reproduce CI locally, commit and push with Conventional Commits, reinstall the exact local plugin build, and monitor the matching GitHub Actions run to completion. Use only when the user explicitly asks to release, publish, ship, or deploy the current repository changes; this skill performs git pushes and changes the locally installed plugin."
---

# Release Codex IM Gateway

Run the stages below in order. Treat the commit SHA and manifest version as the release identity.
Do not claim success unless local application and remote CI both succeed.

## 1. Guard the release scope

1. Work from the repository root containing `package.json` and `.codex-plugin/plugin.json`.
2. Inspect `git status --short`, the current branch, remotes, upstream, and any in-progress
   merge or rebase. Stop for unresolved conflicts, a detached HEAD, missing `origin`, or missing
   GitHub authentication.
3. Review tracked and untracked changes. Never include `.env`, credentials, tokens, transcripts,
   private workspace paths, or generated secrets. If unrelated user changes make the release
   scope ambiguous, ask before staging them; never discard them.
4. Fetch `origin`. If the current branch has an upstream, synchronize with
   `git pull --rebase --autostash` before changing the manifest. Resolve failures without rewriting
   published history.

## 2. Prepare and reproduce CI locally

1. Run `node skills/release/scripts/update-cachebuster.mjs .`. This replaces the manifest build
   suffix with `+codex.<UTC timestamp>` while preserving the base version. Do this before checks
   and commit so the locally installed version is also the committed, CI-tested version.
2. Run the same verification contract as `.github/workflows/ci.yml`:

   ```bash
   pnpm install --frozen-lockfile
   pnpm check
   ```

3. Stop immediately on failure. Fix only issues within the requested release scope, rerun the
   complete check, and do not push a failing tree.
4. Inspect `git diff --check`, `git diff --stat`, and the full diff after checks. Confirm the
   cachebuster is the only mechanical release mutation and no check produced unintended files.

## 3. Commit and push

1. Stage the agreed release scope. Use `git add -A` only after confirming every current change
   belongs in this release.
2. Review `git diff --cached --check`, `git diff --cached --stat`, and the staged diff.
3. Create a concise Conventional Commit message that describes the substantive change. Use
   `chore(release): refresh plugin build` only when the cachebuster is the sole change. Do not amend
   or bypass hooks.
4. Capture `release_sha=$(git rev-parse HEAD)` and
   `release_version` from `.codex-plugin/plugin.json`, then push the current branch to `origin`.
   Set its upstream on the first push when necessary.
5. Confirm the pushed remote ref resolves to `release_sha`. Stop the publishing stage if it does
   not.

## 4. Apply the exact build locally

Local application must use the marketplace entry that already points at this checkout.

1. Read `codex plugin list --available --json`. Find exactly one `codex-im-gateway` entry whose
   source path resolves to the current repository root and whose marketplace source is local. Do
   not edit marketplace JSON or Codex config by hand.
2. If no exact local source match exists, record local application as failed and continue to CI
   monitoring; do not install a similarly named or remote plugin.
3. Reinstall from the matched marketplace:

   ```bash
   codex plugin add codex-im-gateway@<marketplace-name> --json
   ```

4. Re-read `codex plugin list --json`. Verify the plugin is installed and enabled, its resolved
   source is this checkout, and its installed version equals `release_version`.
5. Do not restart or terminate a running gateway daemon unless the user explicitly requests it.
   Tell the user to start a new Codex task to load the refreshed skill and MCP bundle.

## 5. Monitor the matching CI run

1. Search by the exact pushed SHA, not merely by branch or latest run:

   ```bash
   gh run list --workflow ci.yml --commit "$release_sha" \
     --json databaseId,status,conclusion,url,headSha,event --limit 10
   ```

2. GitHub may take time to create the run. Poll briefly until a run with
   `headSha == release_sha` appears. The workflow runs for pushes to `main` and pull requests. If
   the branch has neither trigger, report that no CI run is expected instead of watching an
   unrelated run.
3. Watch the selected run to a terminal state:

   ```bash
   gh run watch <run-id> --compact --exit-status
   ```

4. On failure, run `gh run view <run-id> --log-failed`, report the failed job and relevant error,
   and leave the release incomplete. Do not make a follow-up commit unless the user asks for a fix.

## Result contract

Report all of the following in the final response:

- branch, commit SHA, Conventional Commit subject, and pushed remote;
- manifest version and local plugin application status;
- CI run URL and terminal conclusion, or the precise reason no matching run exists;
- the required new-task pickup step;
- any partial failure after the push, without implying that the remote commit was rolled back.
