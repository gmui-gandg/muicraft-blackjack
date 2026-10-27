# Manual production handoff

Issue #13 delivers source/configuration checks and a clean-checkout production
build. It does **not** establish AC-11 container/Coolify or AC-12 LAN acceptance.
Docker images, Nginx runtime behavior, installed Coolify options, DNS and rollback
have not been verified for this candidate. Reports of earlier manual deployments
are not evidence for this candidate. See the candidate-specific
`m5-packaging-evidence.md` artifact named in the PR description.

All commands below are **future manual operator steps**, requiring separate
execution authorization on a Docker-enabled host. This delivery runs none of them.
Do not install Docker, publish images, enable webhooks/schedules, expose management
interfaces, merge automatically or deploy as part of this ticket. Verify the
intended commit, host, address and domain before use. No runtime secret or backend
is required; player data stays in browser localStorage.

## Build contract

The root Dockerfile uses Node `24.22.1-bookworm-slim`, `npm ci` and Vite to produce
`/app/dist/`, then copies only that output into Nginx `1.30.6-alpine` on container
port **80**. Vite dev/preview is not the production server. Base tags are not
immutable digests; availability and container behavior remain to be tested.

`SOURCE_COMMIT` is a required build ARG: the actual checked-out full lowercase
40-character Git SHA. The Dockerfile maps it to `FACTORY_RUNTIME_CANDIDATE` for the
build, which writes the exact bytes to `dist/build-id` (no trailing newline).
Runtime environment variables cannot rewrite that baked file. Syntax validation
cannot prove an arbitrary supplied SHA is the source; verify the checkout too.

The context admits the manifests, build configuration, index, `src/` and Nginx
configuration. Exclusions after `!src/**` remove nested `.env*`, credential/private/
runtime directories, key files, dependency/output and factory configuration paths.
This is filename filtering, not secret scanning: never put credentials in source.
[Docker's context guidance](https://docs.docker.com/build/concepts/context/)
defines recursive context access and last matching rule precedence. Our ordered
glob tests check these source patterns; only a future Docker build tests Docker's
actual context processing. Docker still receives its Dockerfile and ignore file
for build control even when they are excluded from `COPY` inputs.

## Authorized host: clean commit and local image

Prerequisites: Git, Bash, Node matching `package.json`, npm, Python 3, curl and an
already authorized Docker engine. Confirm access without privilege/security
changes. Use a fresh shell; set `INTENDED_COMMIT` to the reviewed candidate's full
SHA from the PR (or the separately reviewed final main commit after merge).
Set `HANDOFF_PARENT` to an existing writable absolute directory for this attempt.
Do not reuse a dirty development tree. The following creates fresh directories;
retain them as evidence rather than deleting prior artifacts.

```bash
set -euo pipefail
: "${INTENDED_COMMIT:?Set the reviewed full Git SHA}"
: "${HANDOFF_PARENT:?Set an existing absolute writable directory}"
attempt=$(mktemp -d "$HANDOFF_PARENT/muicraft-handoff.XXXXXX")
git clone --no-checkout https://github.com/gmui-gandg/muicraft-blackjack.git "$attempt/source"
cd "$attempt/source"
git checkout --detach "$INTENDED_COMMIT"
source_commit=$(git rev-parse --verify HEAD)
test "$source_commit" = "$INTENDED_COMMIT"
test -z "$(git status --porcelain --untracked-files=all)"
printf '%s' "$source_commit" > "$attempt/expected-build-id"
git --version > "$attempt/versions.txt"
node --version >> "$attempt/versions.txt"
npm --version >> "$attempt/versions.txt"
python3 --version >> "$attempt/versions.txt"
uname -a >> "$attempt/versions.txt"
sha256sum package-lock.json > "$attempt/lock-before.txt"
npm ci > "$attempt/npm-ci.log" 2>&1
python3 harness/ci.py > "$attempt/ordinary.log" 2>&1
sha256sum package-lock.json > "$attempt/lock-after.txt"
cmp "$attempt/lock-before.txt" "$attempt/lock-after.txt"
cmp "$attempt/expected-build-id" dist/build-id
test -z "$(git status --porcelain --untracked-files=all)"
docker build --build-arg SOURCE_COMMIT="$source_commit" \
  --iidfile "$attempt/image-id" -t "muicraft-blackjack:$source_commit" . \
  > "$attempt/docker-build.log" 2>&1
image_id=$(cat "$attempt/image-id")
docker image inspect "$image_id" > "$attempt/image-inspect.json"
```

Record actual argv, exits, versions, lock digests and build log. The unchanged
ordinary harness runs `npm run check` and `npm run test`; require `STATIC_OK`,
`UNIT_PASSED tests=N` with N > 0, and `CHECKS_OK mode=ordinary`. On failure stop,
retain logs, and investigate before any deployment. A successful native build
alone does not prove image availability or container execution.

## Authorized host: loopback container and probes

Continue in the same shell only after a successful image build. Select an unused
local host port (example 18080); do not stop another process to free it. The CID
returned below identifies only this attempt's owned verification container. The
EXIT trap saves its logs and stops it on success or failure; it retains the stopped
container and image. Do not run blanket stop/remove/prune commands.
[Docker documents explicit loopback publishing](https://docs.docker.com/reference/cli/docker/container/run/).
Verify the host's Docker version and loopback isolation before relying on it.

```bash
probe_port=18080
container_id=$(docker run --detach --pull=never \
  --publish "127.0.0.1:$probe_port:80" "$image_id")
finish_probe() {
  local probe_exit=$?
  docker logs "$container_id" > "$attempt/container.log" 2>&1 || probe_exit=1
  docker stop --time 10 "$container_id" > "$attempt/container-stop.log" 2>&1 || probe_exit=1
  docker inspect --format '{{.State.Running}}' "$container_id" \
    > "$attempt/container-running.txt" || probe_exit=1
  test "$(cat "$attempt/container-running.txt")" = false || probe_exit=1
  exit "$probe_exit"
}
trap finish_probe EXIT
printf '%s\n' "$container_id" > "$attempt/container-id"
base_url="http://127.0.0.1:$probe_port"
ready=false
for n in {1..30}; do
  if curl --silent --fail --max-time 2 "$base_url/healthz" \
      > "$attempt/health-ready"; then
    ready=true
    break
  fi
  sleep 1
done
test "$ready" = true
probe() {
  local path="$1" name="$2" status
  status=$(curl --silent --show-error --max-time 5 \
    --dump-header "$attempt/$name.headers" --output "$attempt/$name.body" \
    --write-out '%{http_code}' "$base_url$path")
  printf '%s %s\n' "$path" "$status" >> "$attempt/http-status.txt"
  test "$status" = 200
}
probe / index
probe /healthz health
printf 'ok' > "$attempt/expected-health"
cmp "$attempt/expected-health" "$attempt/health.body"
probe /build-id identity
cmp "$attempt/expected-build-id" "$attempt/identity.body"
python3 - "$attempt/index.body" > "$attempt/assets.txt" <<'PY'
from html.parser import HTMLParser
from pathlib import Path
import sys
class Assets(HTMLParser):
    def handle_starttag(self, tag, attrs):
        for name, value in attrs:
            if name in ('src', 'href') and value and value.startswith('/assets/'):
                paths.add(value)
paths = set()
Assets().feed(Path(sys.argv[1]).read_text())
assert any(p.endswith('.js') for p in paths), paths
assert any(p.endswith('.css') for p in paths), paths
for path in sorted(paths):
    print(path)
PY
asset_number=0
while IFS= read -r asset; do
  asset_number=$((asset_number + 1))
  probe "$asset" "asset-$asset_number"
  test -s "$attempt/asset-$asset_number.body"
done < "$attempt/assets.txt"
probe /handoff-spa-probe spa
cmp "$attempt/index.body" "$attempt/spa.body"
curl --silent --show-error --max-time 5 -H 'Accept-Encoding: gzip' \
  --dump-header "$attempt/compression.headers" \
  --output "$attempt/compression.body" "$base_url/"
docker inspect "$container_id" > "$attempt/container-inspect.json"
# Exiting this dedicated shell saves logs and stops this CID through the trap.
exit
```

Inspect saved headers and bodies: `/` must be HTML, generated `.js` and `.css`
assets must have appropriate JavaScript/CSS MIME types rather than an HTML
fallback. `/healthz` must be HTTP 200 with exact `ok`; `/build-id` must be HTTP 200
with exact expected SHA bytes. Neither request follows redirects. SPA probe must
return the same shell. Review Nginx startup/access/error logs for errors and all
probe requests. Confirm the recorded CID is stopped after the shell exits.

Configuration explicitly sets `Cache-Control: no-store` for health and identity.
It configures no long-lived asset cache, HTML cache policy, compression, CSP,
HSTS or other added security headers. Observe and record `Cache-Control`,
`Content-Type`, `Content-Encoding`, `ETag`, `Last-Modified` and any proxy-added
headers; do not report gzip, immutable caching or security headers as enabled
without observations. HTTPS/TLS and public exposure remain separate scope.

## Future manual Coolify deployment and LAN verification

First obtain deployment authorization and verify the target with the operator.
The PRD inputs are VM **coolify1**, existing server **localhost**, address
**192.168.2.10**, and LAN domain **http://blackjack.muitropolis.com**. These are
planned settings, not live observations. The installed Coolify version has not
been inspected: verify its labels/options and behavior against the current
[Dockerfile guidance](https://coolify.io/docs/applications/builds/dockerfile)
before applying anything. Do not remotely inspect or configure it for this ticket.

1. After human review/merge, record the approved `main` SHA and rerun candidate
   checks if it differs from the tested SHA. Record and retain the previous known
   good source SHA, image ID/digest, settings and deployment logs before replacing
   it. Verify that the prior image remains selectable for rollback.
2. Manually select repository `gmui-gandg/muicraft-blackjack`, branch `main`, on
   the verified existing server. Use Dockerfile build strategy, repository-root
   Base Directory (`/` in current UI), Dockerfile Location `/Dockerfile` relative
   to that base, and container Ports Exposes `80`. Confirm the resolved context
   is the repository root; do not use a Vite start command or persistent mounts.
3. Current upstream guidance excludes `SOURCE_COMMIT` from Docker builds by
   default. Verify the installed **Advanced > Build > Source commit availability**
   option and select **Available during build** so Coolify supplies its actual
   checked-out SHA to the declared `ARG SOURCE_COMMIT`. Build-time scope matters;
   a runtime-only variable cannot provide image identity. See
   [current variable guidance](https://coolify.io/docs/applications/configuration/environment-variables).
   If that version cannot supply it automatically, stop until a verified manual
   build-argument mechanism passes the actual checked-out SHA; do not substitute
   a fixed example hash or literal shell expression. Verify the build logs and
   `/build-id` against that deployment's source SHA.
4. Keep automatic deployment, webhooks, previews and schedules disabled. Do not
   expose Coolify management or change host/proxy/DNS/public access. Under the
   separate deployment authorization, set the verified LAN domain and health
   check `/healthz` on port 80; manually choose Deploy. Inspect build and runtime
   logs, record resulting immutable image identity, and confirm source SHA before
   declaring success.
5. From an authorized LAN client, inspect DNS resolution (`getent ahostsv4
blackjack.muitropolis.com` on Linux) and compare to operator-verified
   `192.168.2.10`. If wrong, stop and refer DNS changes to their separate scope.
   Repeat the HTTP probes above against `http://blackjack.muitropolis.com`, using
   the deployed SHA's expected file and a fresh evidence directory; do not start
   a verification container for LAN probes. Check `/`, actual generated assets,
   `/healthz` body/status and `/build-id` bytes, logs and proxy headers. Manually
   load the game from LAN and complete a round, refresh and check settled balance.
   Keep DNS, client/URL, timestamps, commit, image and results in the deployment
   record. A health response alone does not prove the correct game was deployed.

## Manual rollback and retention

Before deployment, preserve the previous working image locally with its immutable
`sha256:...` image ID, or an existing registry `repository@sha256:...` digest if
already available under separate scope, and its matching source commit. A tag
such as `main`, `latest` or even a commit-named tag is mutable and is not proof of
image identity. Retain images, evidence directories, build logs and prior settings;
do not prune or remove them. This ticket does not publish images.

On a failed authorized rollout, record the failure and manually select the retained
known-good image. Current upstream
[Coolify rollback guidance](https://coolify.io/docs/applications/deployments/rollbacks)
requires an older retained image and verification after rollback. Verify the
installed version's Rollback list and labels, match the selected tag to the
recorded immutable ID/digest and source SHA, then manually choose the previous
image. Inspect deployment/runtime logs and repeat health, exact prior build-id,
asset and LAN game probes. Record the restored identity and results. For local
verification of a retained image, repeat the loopback procedure with `image_id`
set to its recorded immutable ID and expected-build-id set to its matching SHA.

If the prior artifact is absent, stop: rebuilding a source commit is a new build,
not restoration of the same immutable image (base tags may have changed). Obtain
separate approval and validate it before use. Rollback does not revert browser
localStorage or external settings; this static application has no server database
to restore. Do not delete browser data as a deployment shortcut.

References were checked against current upstream documentation on 2026-10-27.
Installed-server behavior, image availability and every operational step above
remain deferred until separately authorized and observed.
