# Linux visual baselines

Generate baselines on Ubuntu 24.04 using the same Node version, locked npm
packages and Chromium installation as each project's `ci.yaml` job. Never
replace committed Linux PNGs with Mac screenshots or relax comparison thresholds.

## GitHub Actions

Open **Actions → Visual baselines → Run workflow**. Select the workflow branch,
enter the source branch in `ref`, and choose `admin-ui`, `pilot-showcase`,
`web-quality`, or `all`. Each selected project runs its visual suite with
`--update-snapshots=all` and uploads `visual-baselines-<project>`. Artifacts
contain repository-relative snapshot paths. The workflow has only
`contents: read` permission and never commits or pushes. Normal CI remains strict.

GitHub requires a dispatchable workflow to exist on the default branch first.
For development, the selected workflow branch must also contain this workflow.
Push the source changes before dispatching; uncommitted local edits are not used.

## Local helper

With GitHub CLI installed and authenticated (`gh auth login`), run from any directory:

```bash
/path/to/checkout/scripts/visual-baselines.sh admin-ui
/path/to/checkout/scripts/visual-baselines.sh all feature/my-branch
```

The optional source `ref` defaults to the current checkout branch. The helper
uses that checkout's current branch for the workflow definition and the exact
run URL returned by newer GitHub CLI versions. With older versions, it identifies
the new dispatch by actor, branch and run title. It waits for success, downloads every
requested artifact, then copies PNGs into:

- `admin-ui/tests/browser/visual/screens.spec.ts-snapshots/`
- `pilot-showcase/tests/e2e/visual/snapshots/`
- `web-quality/tests/snapshots/`

It prints `git status --short` and the run ID. It overwrites matching local PNGs;
commit or save any baseline work first. It does not delete obsolete PNGs, stage,
commit or push. A failed run leaves the checkout unchanged. To download manually:

```bash
gh run download RUN_ID -n visual-baselines-admin-ui -D /tmp/visual-baselines
```

Review the images and `git diff --stat`. Copy or keep only the baselines explained
by the intended rendering change; restore unrelated updates. Record the source
run, before/after reasoning and validation in the PR, then run strict CI again.
