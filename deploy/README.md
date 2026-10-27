# Deploy channel

GitHub Actions deploys matt.withkeya.com through one restricted SSH key. The key can do three
things on the server and nothing else: upload a release, roll back, and report status.

## Files

| File | Installed as | Role |
|---|---|---|
| `matt-deploy-gate` | `/usr/local/sbin/matt-deploy-gate` (root:root 755) | sshd `ForceCommand` for the deploy user. Parses the request (`deploy <sha> <sha256>`, `rollback <release>`, `status`), never runs it. Stores the upload in `/srv/matt-site/incoming/`, checks size and sha256, then calls `matt-release` through sudo. |
| `matt-release` | `/usr/local/sbin/matt-release` (root:root 755) | The only command the deploy user may run with sudo. Validates its arguments again, unpacks with Python's `tarfile` `data` filter (no absolute paths, no `..`, no links outside the release, no devices or setuid bits), switches `current`, restarts `matt-site` (and `matt-ask` if it is running) and checks `/api/health`. If the restart or the health check fails it switches back, restarts the previous release and exits 1; it prints `release=`/`previous=` before switching and `result=`, `failed=`, `restored=`, `restored_healthy=` after. Keeps the newest 5 good releases it created; failed releases are deleted first and do not count; never deletes the current release, the previous good one, or hand-made releases. |
| `sshd-matt-deploy.conf` | `/etc/ssh/sshd_config.d/60-matt-deploy.conf` | `Match User mattdeploy`: forced command, key from a root-owned file, no TTY, no forwarding, no user rc. |
| `sudoers-matt-deploy` | `/etc/sudoers.d/matt-deploy` (0440) | `mattdeploy` may run `/usr/local/sbin/matt-release` as root, nothing else. |
| `remote.sh`, `smoke.sh` | not installed | Used by `.github/workflows/deploy.yml`. |

Release directories are `releases/<UTC yyyymmdd-HHMMSS>-<sha12>` and contain the built checkout
with `node_modules`, `dist/` and a `DEPLOYED_COMMIT` file. State (activation history, failed
releases, lock) lives in `/srv/matt-site/deploy-state/` (root only).

## Workflow

`.github/workflows/deploy.yml` uses the `production-matt` environment and these environment
secrets: `MATT_DEPLOY_SSH_KEY`, `MATT_DEPLOY_HOST`, `MATT_DEPLOY_PORT`,
`MATT_DEPLOY_KNOWN_HOSTS`. No host name, address or key is stored in the repository.

- Automatic: when CI succeeds for a push to `main`, the newest `main` commit is deployed. If
  `main` has moved on, the older run skips and the newer one deploys.
- Manual: Actions → Deploy → Run workflow on `main`, with `action=deploy` and a commit on `main`
  (default `main`), or `action=rollback`.
- Each deploy checks the commit is on `main` with a successful CI push run, builds with
  `npm ci && npm run build` (CJK fonts installed), uploads, activates, then checks `/`, `/zh`,
  `/en`, `/llms.txt` and `/api/health` for 200 and that the server reports the same commit. A
  failed restart or server-side health check is rolled back by `matt-release` itself; a failed
  public smoke test (or a cancelled or interrupted run) is rolled back by the workflow, which
  first checks whether the new release is still live. Either way the job fails.
- Deploys never run in parallel (`concurrency: deploy-matt-production`). GitHub keeps only one
  pending run per group, so a queued manual rollback can be replaced by a newer automatic
  deploy (and the other way round); check the Actions tab after queuing one.

## Rollback

- Actions → Deploy → Run workflow → `action=rollback`: switches to the newest earlier release that
  is still on disk and has not failed, restarts and smoke-tests it.
- By hand on the server: `sudo /usr/local/sbin/matt-release status`, then
  `sudo /usr/local/sbin/matt-release rollback <current-release>`.
- To undo code, revert the merge commit in a PR; the next CI run on `main` deploys it.
