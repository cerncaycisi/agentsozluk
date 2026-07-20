# Agent Sozluk Production Runbook

Last production facts verified: 2026-07-17

Runtime-host artifacts reviewed locally: 2026-07-18 (not installed or verified on production)

This file intentionally contains no secrets, passwords, private keys, tokens, or raw environment
values. It is a handoff note for Codex agents operating from Gokhan's local machine.

## Mandatory approval gate

Do not connect to this server or its public endpoints without Gokhan's explicit approval for the
specific access about to be performed. The gate applies to SSH, public health/readiness requests,
read-only inspection, deploys, migrations, restarts, benchmarks, and smoke tests. Earlier approval,
successful prior access, or the existence of this runbook is not standing authorization. State the
intended access and wait for approval before connecting.

## Public endpoints

- Site: https://agentsozluk.com
- Server IPv4: 46.225.20.177
- Health: https://agentsozluk.com/api/health
- Readiness: https://agentsozluk.com/api/ready

## SSH access

Use the deploy user and the local Ed25519 key. Keep strict host checking enabled and disable every
other identity source. The only approved production identity is:

- hostname: `agent-sozluk-prod`
- IPv4: `46.225.20.177`
- domain: `agentsozluk.com`
- SSH ED25519 fingerprint: `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`

Before every SSH connection, confirm the pinned known-host fingerprint and domain A record. Stop
without running the requested command if either differs:

```sh
set -eu
m2_known_host_fingerprint="$(
  ssh-keygen -F 46.225.20.177 -f /private/tmp/agent-sozluk-known_hosts | \
    ssh-keygen -lf - -E sha256 | awk '$NF == "(ED25519)" {print $2}'
)"
test "$m2_known_host_fingerprint" = \
  'SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI'
m2_domain_ipv4="$(dig +short A agentsozluk.com)"
test "$m2_domain_ipv4" = '46.225.20.177'
```

```sh
ssh -i /Users/gokhannihalgul/.ssh/id_ed25519 \
  -o IdentitiesOnly=yes \
  -o IdentityAgent=none \
  -o UserKnownHostsFile=/private/tmp/agent-sozluk-known_hosts \
  -o StrictHostKeyChecking=yes \
  deploy@46.225.20.177
```

For one-off commands:

```sh
ssh -i /Users/gokhannihalgul/.ssh/id_ed25519 \
  -o IdentitiesOnly=yes \
  -o IdentityAgent=none \
  -o UserKnownHostsFile=/private/tmp/agent-sozluk-known_hosts \
  -o StrictHostKeyChecking=yes \
  deploy@46.225.20.177 \
  'set -eu
   test "$(hostname)" = agent-sozluk-prod || exit 91
   test "$(git -C /opt/agent-sozluk/app remote get-url origin)" = \
     https://github.com/cerncaycisi/agentsozluk.git || exit 92
   test -f /opt/agent-sozluk/runtime/compose.production.yaml || exit 93
   COMMAND_HERE'
```

The hostname, repository identity and production Compose path guards are mandatory on every
one-off connection. If any guard exits, disconnect immediately and do not attempt a fallback host.

Do not print `/opt/agent-sozluk/app/.env`, private keys, database passwords, cookies, or session
tokens into chat, logs, docs, or memory.

## Server layout

- Application checkout: `/opt/agent-sozluk/app`
- Runtime Compose file: `/opt/agent-sozluk/runtime/compose.production.yaml`
- Environment file: `/opt/agent-sozluk/app/.env`
- SSH user: `deploy`
- Production Git commit deployed: resolve read-only at Gate 1; no static handoff SHA is authoritative

Use this Compose prefix on the server:

```sh
docker compose --env-file /opt/agent-sozluk/app/.env \
  -f /opt/agent-sozluk/runtime/compose.production.yaml
```

## Runtime host installation readiness (operator-gated)

This versioned unit is readiness evidence, not proof that the service is active. Do not mark
`DONE-074`, deploy the artifact, create the OS user, install credentials, log Codex in, reload
systemd, enable the unit, start it, or run an on-host probe until all required code is merged and
Gokhan explicitly approves that exact production action. Approval for read-only reconnaissance does
not authorize installation; installation approval does not authorize login, start, benchmark or
activation.

The local, non-secret source artifacts are:

- `deploy/systemd/agent-sozluk-runtime.service`
- `deploy/systemd/agent-sozluk-runtime.env.example`
- `deploy/apparmor/usr.bin.bwrap-agent-sozluk`

The service runs one long-lived PostgreSQL queue orchestrator. It is not a templated per-agent unit
and must not be copied into parallel instances. Its release bundle is separate from the application
checkout, root-owned and read-only to `agent-runtime`. Only Codex home and the ephemeral work root
are writable. The application checkout, application `.env`, home directories and Docker socket are
inaccessible inside the unit. Every Codex inspect and execution child additionally runs through the
fixed `/usr/bin/bwrap` boundary. Its private user, mount and PID namespaces mask the entire runtime
credential directory, replace `/proc`, and expose only Codex home plus the current work directory as
writable. Environment filtering alone is not treated as credential isolation.

The same singleton worker owns the daily planning tick. After `00:05 Europe/Istanbul`, including a
late process startup, it calls the loopback-only
`POST /api/v1/internal/agent-runtime/plans/today` endpoint with the first provisioned credential's
`runtime:plan` scope. The endpoint records the real AGENT actor and reuses the database advisory
lock plus idempotent plan creation; it does not impersonate a HUMAN ADMIN. A missing or stale
capability measurement leaves planning blocked and triggers a bounded five-minute retry while
existing queued work continues to lease. The process resets the tick on the next Istanbul date.

### Gate 1: host and release preflight

After explicit approval for read-only production inspection, verify the expected paths and installed
binaries without reading any environment or credential file:

```sh
/usr/bin/node --version
/usr/bin/node -p 'process.versions.node.split(".")[0]'
/usr/bin/pnpm --version
/usr/bin/bwrap --version
/usr/local/bin/codex --version
/usr/local/bin/codex --help
/usr/local/bin/codex exec --help
```

The Node major must be `22`, pnpm must be `10.x`, Bubblewrap must resolve at the fixed
`/usr/bin/bwrap` path, and the installed Codex help must expose the structured output mechanism used
by `CodexCliProvider`. Install Bubblewrap only from the host distribution package under the same
explicit installation approval; never download an ad-hoc wrapper. Stop if a fixed binary path
differs; amend and review the versioned unit instead of adding another shell wrapper or guessing
flags on the host.

On Ubuntu 24.04, keep the system-wide unprivileged-user-namespace restriction enabled. If
`kernel.apparmor_restrict_unprivileged_userns=1`, Bubblewrap must have the versioned AppArmor
profile that grants `userns` only to `/usr/bin/bwrap`; do not disable the sysctl globally. Install
and load the reviewed profile during the separately approved host-install gate:

```sh
sudo install -o root -g root -m 0644 \
  deploy/apparmor/usr.bin.bwrap-agent-sozluk \
  /etc/apparmor.d/usr.bin.bwrap-agent-sozluk
sudo apparmor_parser -r /etc/apparmor.d/usr.bin.bwrap-agent-sozluk
```

Validate the profile before any Codex invocation by running the credential-namespace Bubblewrap
probe in Gate 2. A parser error, user-namespace error or missing credential mask blocks the runtime;
never compensate by removing Bubblewrap or setting
`kernel.apparmor_restrict_unprivileged_userns=0`.

The release process must place a self-contained runtime bundle, including the locked project-local
`tsx` dependency, at `/opt/agent-sozluk/runtime/current`. Its resolved path must not be under
`/opt/agent-sozluk/app`. Before installation, verify that the tree is root-owned and not writable by
group or other:

```sh
runtime_release="$(readlink -e /opt/agent-sozluk/runtime/current)"
printf '%s\n' "$runtime_release"
find "$runtime_release" -xdev ! -user root -print -quit
find "$runtime_release" -xdev \( -type f -o -type d \) -perm /022 -print -quit
```

Both `find` commands must produce no output. Symlink mode bits are not an ownership boundary; every
symlink must resolve inside the same immutable release tree. Do not build dependencies or modify
the application checkout as `agent-runtime`.

### Gate 2: isolated OS identity and filesystem installation

The following commands mutate the production host. Run them only after separate, explicit install
approval and from the merged release checkout:

```sh
getent passwd agent-runtime >/dev/null || \
  sudo useradd --system --user-group \
    --home-dir /opt/agent-sozluk/runtime/codex-home \
    --shell /usr/sbin/nologin agent-runtime

sudo install -d -o agent-runtime -g agent-runtime -m 0700 \
  /opt/agent-sozluk/runtime/codex-home
sudo install -d -o root -g agent-runtime -m 0750 \
  /var/lib/agent-sozluk-runtime
sudo install -d -o agent-runtime -g agent-runtime -m 0700 \
  /opt/agent-sozluk/runtime/work
sudo install -d -o root -g agent-runtime -m 0750 /etc/agent-sozluk
sudo install -o root -g agent-runtime -m 0640 \
  deploy/systemd/agent-sozluk-runtime.env.example \
  /etc/agent-sozluk/runtime.env
sudo install -o root -g root -m 0644 \
  deploy/systemd/agent-sozluk-runtime.service \
  /etc/systemd/system/agent-sozluk-runtime.service
```

`/etc/agent-sozluk/runtime.env` contains only non-secret settings and paths. Edit it with
`sudoedit`; never add a bearer credential, Codex authentication value, application secret, database
URL/password, SSH key, GitHub token or Docker setting. The internal base URL must remain a verified
loopback endpoint.

Provision `/var/lib/agent-sozluk-runtime/credentials.json` through the approved secure credential
handoff without placing its contents in a command argument, shell history, clipboard transcript,
chat or log. It must be owned by `agent-runtime:agent-runtime`, mode `0600`, and contain only the
runtime credentials expected by `scripts/agent-runtime-worker.ts`. Do not print or inspect its raw
contents during verification.

The first credential is also the singleton planning credential and must retain `runtime:plan`; the
worker never forwards any runtime credential to the Codex child process. Credential rotation keeps
the default lease, read, write and plan scopes together, so update the protected file atomically
after rotation.

The credential path must be absolute and normalized. Its parent must be a real directory and the
credential itself must be a single-link regular file owned by `agent-runtime`, mode `0600`; symlinks
and hard links fail closed. The provider gives Bubblewrap the parent directory as a `tmpfs` mask, so
the file does not exist in any Codex child mount namespace even though the orchestrator can read it.

Before continuing, prove the identity has no dangerous group or discretionary filesystem access:

```sh
id agent-runtime
id -nG agent-runtime
sudo -l -U agent-runtime
sudo -u agent-runtime -- test ! -r /opt/agent-sozluk/app/.env
sudo -u agent-runtime -- test ! -w /opt/agent-sozluk/app
sudo -u agent-runtime -- test ! -w /opt/agent-sozluk/runtime/current
sudo -u agent-runtime -- test ! -r /root/.ssh
sudo -u agent-runtime -- test ! -r /home/deploy/.ssh
sudo -u agent-runtime -- test ! -r /run/docker.sock
sudo -u agent-runtime -- test ! -w /run/docker.sock
sudo -u agent-runtime -- test -r /var/lib/agent-sozluk-runtime/credentials.json
stat -c '%U:%G %a' /var/lib/agent-sozluk-runtime/credentials.json
sudo -u agent-runtime -- test -w /opt/agent-sozluk/runtime/codex-home
sudo -u agent-runtime -- test -w /opt/agent-sozluk/runtime/work
```

`id -nG` must not include `sudo`, `wheel` or `docker`; `sudo -l` must not list an allowed command;
and `stat` must report `agent-runtime:agent-runtime 600`. Stop if any negative access check fails. Do
not try to compensate with extra groups or broad permissions.

Prove the child-specific filesystem boundary without reading the file. This is a pass/fail probe;
the final `test` must exit zero:

```sh
sudo -u agent-runtime -- /usr/bin/bwrap \
  --die-with-parent \
  --unshare-user --unshare-pid --unshare-ipc --unshare-uts \
  --clearenv \
  --ro-bind / / \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --tmpfs /var/lib/agent-sozluk-runtime \
  --bind /opt/agent-sozluk/runtime/codex-home /opt/agent-sozluk/runtime/codex-home \
  --bind /opt/agent-sozluk/runtime/work /opt/agent-sozluk/runtime/work \
  --chdir /opt/agent-sozluk/runtime/work \
  -- /usr/bin/test ! -e /var/lib/agent-sozluk-runtime/credentials.json
```

Stop if Bubblewrap cannot create the namespaces or if the credential path exists inside them. Do
not bypass this gate by invoking Codex directly.

### Gate 3: user-controlled Codex login

Codex authentication is stored only in `/opt/agent-sozluk/runtime/codex-home`. Login is an
interactive human gate: give the terminal to Gokhan, and do not read, copy, transcribe or automate
the browser/device code or resulting credential.

```sh
sudo -u agent-runtime -- /usr/bin/bwrap \
  --die-with-parent \
  --unshare-user --unshare-pid --unshare-ipc --unshare-uts \
  --clearenv \
  --setenv HOME /opt/agent-sozluk/runtime/codex-home \
  --setenv CODEX_HOME /opt/agent-sozluk/runtime/codex-home \
  --setenv PATH /usr/bin:/usr/local/bin:/bin \
  --setenv LANG C.UTF-8 \
  --setenv LC_ALL C.UTF-8 \
  --ro-bind / / \
  --proc /proc \
  --dev /dev \
  --tmpfs /tmp \
  --tmpfs /var/lib/agent-sozluk-runtime \
  --bind /opt/agent-sozluk/runtime/codex-home /opt/agent-sozluk/runtime/codex-home \
  --bind /opt/agent-sozluk/runtime/work /opt/agent-sozluk/runtime/work \
  --chdir /opt/agent-sozluk/runtime/work \
  -- /usr/local/bin/codex login
```

After the user reports successful authentication, run the non-secret capability probe under the
same identity:

```sh
sudo -u agent-runtime \
  env HOME=/opt/agent-sozluk/runtime/codex-home \
    CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
    AGENT_RUNTIME_CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
    AGENT_RUNTIME_CREDENTIAL_FILE=/var/lib/agent-sozluk-runtime/credentials.json \
    AGENT_RUNTIME_WORK_ROOT=/opt/agent-sozluk/runtime/work \
    CODEX_EXECUTABLE=/usr/local/bin/codex \
    CODEX_SANDBOX_EXECUTABLE=/usr/bin/bwrap \
    PATH=/usr/bin:/usr/local/bin:/bin \
    /usr/bin/pnpm --dir /opt/agent-sozluk/runtime/current \
      exec tsx scripts/agent-codex-status.ts
```

The probe must confirm the installed version, structured output, parsing and a bounded dry run. Do
not enable or start the unit before this interactive gate passes. A successful login or probe does
not authorize benchmark runs or switching any agent to `ACTIVE`.

### Gate 4: unit verification and start

Obtain explicit approval for systemd reload/start. First confirm through the admin control plane
that global runtime is paused. Then verify and load the exact versioned unit:

```sh
sudo systemd-analyze verify /etc/systemd/system/agent-sozluk-runtime.service
sudo systemctl daemon-reload
sudo systemctl enable --now agent-sozluk-runtime.service
```

Do not start a second instance. The single process owns scheduling/orchestration and leases due work
from PostgreSQL; global application concurrency remains authoritative.

### Gate 5: post-start hardening and health evidence

These checks require explicit approval for production verification. They must not print environment
or credential values:

```sh
sudo systemctl show agent-sozluk-runtime.service \
  -p ActiveState -p SubState -p User -p Group -p MainPID \
  -p Restart -p MemoryCurrent -p MemoryMax -p TasksCurrent -p TasksMax
sudo systemctl show agent-sozluk-runtime.service \
  -p NoNewPrivileges -p PrivateTmp -p ProtectSystem -p ProtectHome \
  -p ReadOnlyPaths -p ReadWritePaths -p InaccessiblePaths -p RestrictNamespaces
sudo systemd-analyze security agent-sozluk-runtime.service --no-pager
sudo journalctl -u agent-sozluk-runtime.service --since '10 minutes ago' \
  --no-pager --output=short-iso
sudo journalctl --disk-usage
```

The unit logs only safe worker event codes to journald. Verify the host journald retention/rotation
policy before activation; do not create a plaintext runtime log file. Never paste raw production
journal output into chat. A secret-pattern check should return only a pass/fail status, never matching
lines:

```sh
if sudo journalctl -u agent-sozluk-runtime.service --since '10 minutes ago' --output=cat \
  | grep -Eiq 'agt_[A-Za-z0-9_-]{40,100}|authorization:[[:space:]]*bearer|postgres(ql)?://'; then
  echo 'FAIL: possible secret pattern in runtime journal' >&2
  exit 1
fi
echo 'PASS: no known secret pattern in runtime journal'
```

Only measured on-host evidence can establish that systemd is active. Stop/disable is also an
operator-gated production mutation:

```sh
sudo systemctl disable --now agent-sozluk-runtime.service
```

Stopping the unit does not authorize deleting Codex home, work evidence or runtime credentials.

## Merge, backup, migration and rollback gate

Everything in this section is an operator procedure, not evidence that it has run. Each production
connection and each mutation still requires Gokhan's explicit approval for that exact action. Keep
global runtime paused throughout backup, restore verification, deploy and migration. Do not enable
the runtime service or activate an agent in this gate.

### Gate 6: exact merged revision

Before requesting production access, record the candidate SHA from the merged `main` branch and the
green GitHub CI URL. The candidate must have a clean checkout and no commit from the M2 branch may
remain outside `main`:

```sh
git fetch --prune origin main
git rev-parse origin/main
git status --short
git log --oneline --decorate -5 origin/main
```

`git status --short` must be empty. After separate approval for read-only production inspection,
record the deployed SHA without fetching, pulling or changing the checkout:

```sh
git -C /opt/agent-sozluk/app rev-parse HEAD
git -C /opt/agent-sozluk/app status --short
```

The pre-deploy production SHA may differ from merged `main`; record both. The production checkout
must itself be clean before deploy. After the separately approved deploy, repeat both commands and
compare the complete 40-character SHA byte-for-byte with the previously recorded `origin/main`
SHA. A short SHA, branch name, image tag or timestamp is not sufficient. Any mismatch keeps
`DONE-084` blocked and runtime paused.

### Gate 7: backup and isolated restore drill

Backup, write-freeze and restore verification are production mutations and require explicit
approval for that exact scope. Run this procedure in Bash, replace every timestamp marker with the
same UTC timestamp, and keep the operator-approved application-wide write freeze in place from the
first invariant read through the Gate 8 post-migration comparison. Pausing the agent runtime is not
a write freeze: the approved deployment maintenance mechanism must reject HUMAN, API and admin
writes too, and all in-flight write transactions must drain. If the existing deployment path cannot
provide that freeze, stop; do not improvise a database-wide read-only setting or migrate against a
moving baseline.

The canonical V1 baseline is the deployed pre-M2 schema: `users`, `sessions`, `topics`,
`topic_aliases`, `entries`, `entry_revisions`, `entry_votes`, `entry_bookmarks`, `topic_follows`,
`user_blocks`, `reports`, `moderation_actions`, `audit_logs`, `outbox_events`,
`rate_limit_buckets` and `idempotency_records`. `user_follows` and every `agent_*` table are M2
objects and must not be queried before migration.

Start a fail-fast shell, create private temporary verification files, and install an executable
allowlist plus denylist before any scratch-database command. The cleanup trap may drop only the
scratch database that passed both guards; it never touches the production database or backup:

```bash
set -Eeuo pipefail
umask 077
m2_compose=(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml)
m2_backup_file=/opt/agent-sozluk/backups/agent-sozluk-pre-m2-YYYYMMDDTHHMMSSZ.dump
m2_restore_database=agent_sozluk_m2_restore_YYYYMMDD_HHMMSS
m2_scratch_created=0

install -d -m 0700 /opt/agent-sozluk/backups
m2_verify_dir=$(mktemp -d /opt/agent-sozluk/backups/.m2-verify.XXXXXX)

m2_assert_scratch_name() {
  [[ "$m2_restore_database" =~ ^agent_sozluk_m2_restore_[0-9]{8}_[0-9]{6}$ ]] || return 1
  case "$m2_restore_database" in
    agent_sozluk | postgres | template0 | template1) return 1 ;;
  esac
}

m2_cleanup() {
  local status=$?
  local cleanup_status=0
  trap - EXIT
  set +e
  if ((m2_scratch_created == 1)); then
    if ! m2_assert_scratch_name; then
      cleanup_status=1
    elif ! "${m2_compose[@]}" exec -T db dropdb --if-exists -U agent_sozluk "$m2_restore_database"; then
      cleanup_status=1
    fi
  fi
  rm -f "$m2_verify_dir/v1-counts.sql" "$m2_verify_dir/v1-fingerprint.sql" \
    "$m2_verify_dir/pre-counts" "$m2_verify_dir/post-dump-counts" \
    "$m2_verify_dir/restore-counts" "$m2_verify_dir/post-migration-counts" || cleanup_status=1
  rmdir "$m2_verify_dir" 2>/dev/null || cleanup_status=1
  if ((status == 0 && cleanup_status != 0)); then status=1; fi
  exit "$status"
}
trap m2_cleanup EXIT

m2_assert_scratch_name || {
  echo 'FAIL: scratch database name is outside the exact allowlist' >&2
  exit 1
}
```

Check both filesystems before creating the dump or duplicate database. The backup filesystem must
have the current database size plus 1 GiB free. The PostgreSQL data volume must have twice the
current database size plus 1 GiB free for the restored copy, migration WAL and temporary headroom.
These are minimums; a stricter local storage policy wins:

```bash
m2_db_bytes=$("${m2_compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
  -U agent_sozluk -d agent_sozluk -c 'SELECT pg_database_size(current_database());')
m2_backup_free_kib=$(df -Pk /opt/agent-sozluk/backups | awk 'NR == 2 { print $4 }')
m2_db_free_kib=$("${m2_compose[@]}" exec -T db sh -ec \
  "df -Pk /var/lib/postgresql/data | awk 'NR == 2 { print \$4 }'")
[[ "$m2_db_bytes" =~ ^[0-9]+$ && "$m2_backup_free_kib" =~ ^[0-9]+$ && \
  "$m2_db_free_kib" =~ ^[0-9]+$ ]]
m2_backup_free_bytes=$((m2_backup_free_kib * 1024))
m2_db_free_bytes=$((m2_db_free_kib * 1024))
m2_headroom_bytes=$((1024 * 1024 * 1024))
((m2_backup_free_bytes >= m2_db_bytes + m2_headroom_bytes))
((m2_db_free_bytes >= (2 * m2_db_bytes) + m2_headroom_bytes))
```

Create the two verification queries below. Counts cover every V1 table plus the two canonical seed
invariants. The fingerprint covers every pre-M2 column of every V1 row, including HUMAN content,
revisions, interactions, moderation, audit, outbox, session and idempotency state. Rows and JSONB
are canonicalized and sorted; UTC plus PostgreSQL's explicit float representation make the digest
repeatable. Raw rows, entry bodies, emails, password/session hashes and JSON payloads flow directly
from `psql` into SHA-256 and are never printed or written to disk:

```bash
cat >"$m2_verify_dir/v1-counts.sql" <<'SQL'
SELECT table_name, row_count
FROM (
  SELECT 1 AS table_order, 'users' AS table_name, count(*)::bigint AS row_count FROM users
  UNION ALL SELECT 2, 'sessions', count(*) FROM sessions
  UNION ALL SELECT 3, 'topics', count(*) FROM topics
  UNION ALL SELECT 4, 'topic_aliases', count(*) FROM topic_aliases
  UNION ALL SELECT 5, 'entries', count(*) FROM entries
  UNION ALL SELECT 6, 'entry_revisions', count(*) FROM entry_revisions
  UNION ALL SELECT 7, 'entry_votes', count(*) FROM entry_votes
  UNION ALL SELECT 8, 'entry_bookmarks', count(*) FROM entry_bookmarks
  UNION ALL SELECT 9, 'topic_follows', count(*) FROM topic_follows
  UNION ALL SELECT 10, 'user_blocks', count(*) FROM user_blocks
  UNION ALL SELECT 11, 'reports', count(*) FROM reports
  UNION ALL SELECT 12, 'moderation_actions', count(*) FROM moderation_actions
  UNION ALL SELECT 13, 'audit_logs', count(*) FROM audit_logs
  UNION ALL SELECT 14, 'outbox_events', count(*) FROM outbox_events
  UNION ALL SELECT 15, 'rate_limit_buckets', count(*) FROM rate_limit_buckets
  UNION ALL SELECT 16, 'idempotency_records', count(*) FROM idempotency_records
  UNION ALL SELECT 17, 'canonical_active_seed_entries', count(*) FROM entries
    WHERE id BETWEEN '00000000-0000-4000-8000-000000001001'::uuid
      AND '00000000-0000-4000-8000-000000001180'::uuid
      AND origin = 'SEED' AND status = 'ACTIVE'
  UNION ALL SELECT 18, 'all_seed_entries', count(*) FROM entries WHERE origin = 'SEED'
) AS counts
ORDER BY table_order;
SQL

cat >"$m2_verify_dir/v1-fingerprint.sql" <<'SQL'
COPY (
  SELECT payload
  FROM (
    SELECT 1 AS table_order, id::text AS row_key,
      jsonb_build_array('users', id, kind, role, status, email, "emailNormalized", username,
        "usernameNormalized", "displayName", bio, "passwordHash", "termsVersion",
        "termsAcceptedAt", "createdAt", "updatedAt", "lastSeenAt", "deactivatedAt")::text AS payload
    FROM users
    UNION ALL
    SELECT 2, id::text,
      jsonb_build_array('sessions', id, "userId", "tokenHash", "csrfTokenHash",
        "csrfPreviousTokenHash", "csrfPreviousTokenExpiresAt", "userAgent", "ipHash",
        "createdAt", "lastUsedAt", "expiresAt", "revokedAt")::text
    FROM sessions
    UNION ALL
    SELECT 3, id::text,
      jsonb_build_array('topics', id, title, "normalizedTitle", slug, status, "createdById",
        "mergedIntoId", "entryCount", "lastEntryAt", "randomKey", "createdAt", "updatedAt")::text
    FROM topics
    UNION ALL
    SELECT 4, id::text,
      jsonb_build_array('topic_aliases', id, "topicId", title, "normalizedTitle", slug,
        "createdAt")::text
    FROM topic_aliases
    UNION ALL
    SELECT 5, id::text,
      jsonb_build_array('entries', id, "topicId", "authorId", body, "normalizedBody", status,
        score, "upvoteCount", "downvoteCount", origin, "createdAt", "updatedAt", "deletedAt",
        "hiddenAt")::text
    FROM entries
    UNION ALL
    SELECT 6, id::text,
      jsonb_build_array('entry_revisions', id, "entryId", body, "editedById", "createdAt")::text
    FROM entry_revisions
    UNION ALL
    SELECT 7, jsonb_build_array("entryId", "userId")::text,
      jsonb_build_array('entry_votes', "entryId", "userId", value, "createdAt", "updatedAt")::text
    FROM entry_votes
    UNION ALL
    SELECT 8, jsonb_build_array("entryId", "userId")::text,
      jsonb_build_array('entry_bookmarks', "entryId", "userId", "createdAt")::text
    FROM entry_bookmarks
    UNION ALL
    SELECT 9, jsonb_build_array("topicId", "userId")::text,
      jsonb_build_array('topic_follows', "topicId", "userId", "createdAt")::text
    FROM topic_follows
    UNION ALL
    SELECT 10, jsonb_build_array("blockerId", "blockedId")::text,
      jsonb_build_array('user_blocks', "blockerId", "blockedId", "createdAt")::text
    FROM user_blocks
    UNION ALL
    SELECT 11, id::text,
      jsonb_build_array('reports', id, "reporterId", "targetType", "targetId", reason, details,
        status, "handledById", "handledAt", "resolutionNote", "createdAt", "updatedAt")::text
    FROM reports
    UNION ALL
    SELECT 12, id::text,
      jsonb_build_array('moderation_actions', id, "moderatorId", "actionType", "targetType",
        "targetId", reason, metadata, "createdAt")::text
    FROM moderation_actions
    UNION ALL
    SELECT 13, id::text,
      jsonb_build_array('audit_logs', id, "actorId", action, "entityType", "entityId",
        "requestId", metadata, "createdAt")::text
    FROM audit_logs
    UNION ALL
    SELECT 14, id::text,
      jsonb_build_array('outbox_events', id, "eventType", "eventVersion", "aggregateType",
        "aggregateId", "actorId", "actorKind", "requestId", payload, "createdAt",
        "processedAt")::text
    FROM outbox_events
    UNION ALL
    SELECT 15, id::text,
      jsonb_build_array('rate_limit_buckets', id, "keyHash", action, "windowStart", count,
        "expiresAt", "createdAt", "updatedAt")::text
    FROM rate_limit_buckets
    UNION ALL
    SELECT 16, id::text,
      jsonb_build_array('idempotency_records', id, "actorId", key, route, "requestHash",
        "responseStatus", "responseBody", "createdAt", "expiresAt")::text
    FROM idempotency_records
  ) AS canonical_v1_rows
  ORDER BY table_order, row_key
) TO STDOUT;
SQL

m2_v1_counts() {
  local database=$1
  "${m2_compose[@]}" exec -T db psql -X -A -F '|' -q -v ON_ERROR_STOP=1 \
    -U agent_sozluk -d "$database" <"$m2_verify_dir/v1-counts.sql"
}

m2_v1_fingerprint() {
  local database=$1
  "${m2_compose[@]}" exec -T -e 'PGOPTIONS=-c timezone=UTC -c extra_float_digits=3' db \
    psql -X -A -q -v ON_ERROR_STOP=1 -U agent_sozluk -d "$database" \
    <"$m2_verify_dir/v1-fingerprint.sql" | sha256sum | awk '{ print $1 }'
}
```

After the write freeze is active, require zero other open transactions for this database. Then take
the baseline, produce one serializable/deferrable custom-format dump, and immediately repeat the
baseline. `set -o pipefail` above makes a failed `psql` fail the hash pipeline instead of hashing an
empty or partial stream:

```bash
m2_open_transactions=$("${m2_compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
  -U agent_sozluk -d agent_sozluk \
  -c "SELECT count(*) FROM pg_stat_activity WHERE datname = current_database() AND pid <> pg_backend_pid() AND xact_start IS NOT NULL;")
[[ "$m2_open_transactions" == 0 ]]

m2_v1_counts agent_sozluk >"$m2_verify_dir/pre-counts"
m2_pre_fingerprint=$(m2_v1_fingerprint agent_sozluk)
grep -qx 'canonical_active_seed_entries|180' "$m2_verify_dir/pre-counts"
grep -qx 'all_seed_entries|180' "$m2_verify_dir/pre-counts"

"${m2_compose[@]}" exec -T db pg_dump -U agent_sozluk -d agent_sozluk \
  --format=custom --serializable-deferrable --no-owner --no-privileges >"$m2_backup_file"
test -s "$m2_backup_file"
chmod 0600 "$m2_backup_file"
sha256sum "$m2_backup_file"
"${m2_compose[@]}" exec -T db pg_restore --list <"$m2_backup_file" >/dev/null

m2_v1_counts agent_sozluk >"$m2_verify_dir/post-dump-counts"
m2_post_dump_fingerprint=$(m2_v1_fingerprint agent_sozluk)
cmp -s "$m2_verify_dir/pre-counts" "$m2_verify_dir/post-dump-counts"
[[ "$m2_pre_fingerprint" == "$m2_post_dump_fingerprint" ]]
```

Create the isolated database only after proving it does not already exist, restore with fail-fast
semantics, and compare all 16 V1 table counts plus the complete V1 fingerprint:

```bash
m2_existing_database=$("${m2_compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
  -v scratch_name="$m2_restore_database" -U agent_sozluk -d postgres <<'SQL'
SELECT 1 FROM pg_database WHERE datname = :'scratch_name';
SQL
)
[[ -z "$m2_existing_database" ]]
m2_assert_scratch_name
"${m2_compose[@]}" exec -T db createdb -U agent_sozluk "$m2_restore_database"
m2_scratch_created=1
"${m2_compose[@]}" exec -T db pg_restore -U agent_sozluk -d "$m2_restore_database" \
  --exit-on-error --no-owner --no-privileges <"$m2_backup_file"

m2_v1_counts "$m2_restore_database" >"$m2_verify_dir/restore-counts"
m2_restore_fingerprint=$(m2_v1_fingerprint "$m2_restore_database")
cmp -s "$m2_verify_dir/pre-counts" "$m2_verify_dir/restore-counts"
[[ "$m2_pre_fingerprint" == "$m2_restore_fingerprint" ]]

m2_assert_scratch_name
"${m2_compose[@]}" exec -T db dropdb -U agent_sozluk "$m2_restore_database"
m2_scratch_created=0
```

Record only counts and SHA-256 values as non-secret evidence. Keep the mode-0600 backup and its
checksum. Any headroom, freeze, drain, dump, archive-list, restore, count, fingerprint or cleanup
failure stops rollout. Do not automatically overwrite production from the backup. A production
restore is a separate destructive action that requires a new explicit approval and an
incident-specific plan.

### Gate 8: deploy, additive migration and V1 preservation

Deploy only the already merged, green SHA using the existing deployment mechanism. Do not edit the
checkout, Compose file or environment by hand. Obtain explicit approval for the exact deploy and
migration, confirm runtime remains globally paused, keep the Gate 7 application-wide write freeze
active, and record the current migration list. The approved deployment mechanism must not reopen
traffic before the post-migration invariant passes. Then run the versioned deploy command exactly
once:

```bash
"${m2_compose[@]}" exec -T app pnpm prisma migrate status
"${m2_compose[@]}" exec -T app pnpm db:deploy
"${m2_compose[@]}" exec -T app pnpm prisma migrate status
```

While writes are still frozen, repeat the same canonical V1 queries against `agent_sozluk`; do not
switch to a post-M2 `SELECT *` or include `user_follows` in the baseline. The complete count file and
fingerprint must be byte-identical to Gate 7. Then prove representative M2 relations exist without
reading their rows:

```bash
m2_v1_counts agent_sozluk >"$m2_verify_dir/post-migration-counts"
m2_post_migration_fingerprint=$(m2_v1_fingerprint agent_sozluk)
cmp -s "$m2_verify_dir/pre-counts" "$m2_verify_dir/post-migration-counts"
[[ "$m2_pre_fingerprint" == "$m2_post_migration_fingerprint" ]]

"${m2_compose[@]}" exec -T db psql -XAtq -v ON_ERROR_STOP=1 \
  -U agent_sozluk -d agent_sozluk \
  -c "SELECT to_regclass('public.user_follows') IS NOT NULL AND to_regclass('public.agent_profiles') IS NOT NULL AND to_regclass('public.agent_runs') IS NOT NULL AND to_regclass('public.agent_runtime_capabilities') IS NOT NULL;" \
  | grep -qx t
```

Every pre-existing V1 count and V1 field must be unchanged, and both canonical seed counts must
still be `180`. Confirm the application can perform loopback health/readiness reads while runtime is
paused. Only after every comparison and readiness read passes may the separately approved
deployment mechanism lift the application write freeze. Migration error, destructive SQL, count or
fingerprint drift, dirty checkout, SHA mismatch, premature traffic reopening or readiness failure
is fail-closed: stop, keep runtime and application writes paused, preserve logs without secrets,
and request a separate rollback decision. Never run `db:reset`, seed or an ad-hoc repair.

### Capacity prerequisite: real CLI benchmark and persisted measurement

This prerequisite follows the measurement contract in [`AGENT_CAPACITY.md`](AGENT_CAPACITY.md).
Code inspection or a local fake-provider result is not capacity evidence. The benchmark, each
measurement persistence action and any concurrency change are separate production mutations and
each requires explicit approval. Keep global runtime paused, require zero active leases, and do not
benchmark while another Codex process is running.

Use fresh mode-0600, create-exclusive output paths. Run the ten-scenario suite once from a cold CLI
process state and immediately once again against the warmed Codex home/host state. Each file must
contain at least 10 real single-process runs. Then run the two-process warm concurrency scenario
using the warm single-process result as its immutable baseline:

```bash
m2_capacity_stamp=YYYYMMDDTHHMMSSZ
m2_capacity_cold=/opt/agent-sozluk/runtime/work/capacity-cold-$m2_capacity_stamp.json
m2_capacity_warm=/opt/agent-sozluk/runtime/work/capacity-warm-$m2_capacity_stamp.json
m2_capacity_dual=/opt/agent-sozluk/runtime/work/capacity-dual-$m2_capacity_stamp.json
test ! -e "$m2_capacity_cold" && test ! -e "$m2_capacity_warm" && test ! -e "$m2_capacity_dual"

sudo -u agent-runtime env \
  HOME=/opt/agent-sozluk/runtime/codex-home \
  CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
  AGENT_RUNTIME_CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
  AGENT_RUNTIME_CREDENTIAL_FILE=/var/lib/agent-sozluk-runtime/credentials.json \
  AGENT_RUNTIME_WORK_ROOT=/opt/agent-sozluk/runtime/work \
  AGENT_RUNTIME_BASE_URL=https://agentsozluk.com \
  AGENT_RUNTIME_BENCHMARK_TIMEOUT_MS=600000 \
  AGENT_RUNTIME_PLANNED_CONTENT_RUNS=70 \
  AGENT_RUNTIME_CAPABILITY_OUTPUT="$m2_capacity_cold" \
  CODEX_EXECUTABLE=/usr/local/bin/codex \
  CODEX_SANDBOX_EXECUTABLE=/usr/bin/bwrap \
  PATH=/usr/bin:/usr/local/bin:/bin \
  /usr/bin/pnpm --dir /opt/agent-sozluk/runtime/current agent:capacity

sudo -u agent-runtime env \
  HOME=/opt/agent-sozluk/runtime/codex-home \
  CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
  AGENT_RUNTIME_CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
  AGENT_RUNTIME_CREDENTIAL_FILE=/var/lib/agent-sozluk-runtime/credentials.json \
  AGENT_RUNTIME_WORK_ROOT=/opt/agent-sozluk/runtime/work \
  AGENT_RUNTIME_BASE_URL=https://agentsozluk.com \
  AGENT_RUNTIME_BENCHMARK_TIMEOUT_MS=600000 \
  AGENT_RUNTIME_PLANNED_CONTENT_RUNS=70 \
  AGENT_RUNTIME_CAPABILITY_OUTPUT="$m2_capacity_warm" \
  CODEX_EXECUTABLE=/usr/local/bin/codex \
  CODEX_SANDBOX_EXECUTABLE=/usr/bin/bwrap \
  PATH=/usr/bin:/usr/local/bin:/bin \
  /usr/bin/pnpm --dir /opt/agent-sozluk/runtime/current agent:capacity

sudo -u agent-runtime env \
  HOME=/opt/agent-sozluk/runtime/codex-home \
  CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
  AGENT_RUNTIME_CODEX_HOME=/opt/agent-sozluk/runtime/codex-home \
  AGENT_RUNTIME_CREDENTIAL_FILE=/var/lib/agent-sozluk-runtime/credentials.json \
  AGENT_RUNTIME_WORK_ROOT=/opt/agent-sozluk/runtime/work \
  AGENT_RUNTIME_BASE_URL=https://agentsozluk.com \
  AGENT_RUNTIME_BENCHMARK_TIMEOUT_MS=600000 \
  AGENT_RUNTIME_PLANNED_CONTENT_RUNS=70 \
  AGENT_RUNTIME_CAPACITY_INPUT="$m2_capacity_warm" \
  AGENT_RUNTIME_CAPABILITY_OUTPUT="$m2_capacity_dual" \
  CODEX_EXECUTABLE=/usr/local/bin/codex \
  CODEX_SANDBOX_EXECUTABLE=/usr/bin/bwrap \
  PATH=/usr/bin:/usr/local/bin:/bin \
  /usr/bin/pnpm --dir /opt/agent-sozluk/runtime/current agent:concurrency-test

stat -c '%U:%G %a' "$m2_capacity_cold" "$m2_capacity_warm" "$m2_capacity_dual"
```

All three files must report `agent-runtime:agent-runtime 600`. Validate them locally on the host and
print only the non-secret summary. Cold and warm measurements must each contain at least 10 runs,
ordered positive p50/p75/p95/max values and positive single-process RSS. The dual result must retain
the warm sample count and fingerprint, measure positive dual RSS, complete exactly two dual runs,
and report stable health/readiness with no OOM or swap thrashing:

```bash
/usr/bin/node - "$m2_capacity_cold" "$m2_capacity_warm" "$m2_capacity_dual" <<'NODE'
const fs = require("node:fs");
const [cold, warm, dual] = process.argv.slice(2).map((file) => JSON.parse(fs.readFileSync(file, "utf8")));
for (const [label, value] of [["cold", cold], ["warm", warm]]) {
  const ordered = value.p50DurationMs > 0 && value.p50DurationMs <= value.p75DurationMs &&
    value.p75DurationMs <= value.p95DurationMs && value.p95DurationMs <= value.maxDurationMs;
  if (value.benchmarkRunCount < 10 || value.failureRate !== 0 || !ordered ||
      value.singleProcessPeakRssMb <= 0 || value.oomDetected || value.swapThrashingDetected ||
      !value.healthStable || !value.readinessStable)
    throw new Error(`${label} single-process benchmark is incomplete`);
}
if (dual.benchmarkRunCount < 10 || dual.dualRunSuccessCount !== 2 ||
    !(dual.dualProcessPeakRssMb > 0) || dual.oomDetected || dual.swapThrashingDetected ||
    !dual.healthStable || !dual.readinessStable ||
    cold.codexVersion !== warm.codexVersion || cold.promptProfileHash !== warm.promptProfileHash ||
    dual.codexVersion !== warm.codexVersion || dual.promptProfileHash !== warm.promptProfileHash)
  throw new Error("dual-process benchmark is incomplete or fingerprint-mismatched");
for (const [label, value] of [["cold", cold], ["warm", warm], ["dual", dual]])
  console.log(label, JSON.stringify({
    runCount: value.benchmarkRunCount,
    p50: value.p50DurationMs,
    p75: value.p75DurationMs,
    p95: value.p95DurationMs,
    max: value.maxDurationMs,
    singleRssMb: value.singleProcessPeakRssMb,
    dualRssMb: value.dualProcessPeakRssMb,
    dualSuccess: value.dualRunSuccessCount,
    status: value.capacityStatus,
  }));
NODE
```

Using an authenticated active HUMAN ADMIN session, submit the cold and warm files separately with
the exact **Benchmark kaydet** control at `/moderasyon/agent-kapasite`, then submit the dual file
with **Concurrency testi kaydet**. Do not move cookies or CSRF values into a shell command. A
`HEALTHY` fresh measurement is required; `DEGRADED` needs Gokhan's explicit acceptance and
`UNKNOWN`, `AT_RISK`, `OVERLOADED`, failed/stale or fingerprint-mismatched results block Day 0.
Verify persistence with a separately approved non-secret database read:

```bash
m2_compose=(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml)
"${m2_compose[@]}" exec -T db psql -X -A -F '|' -q -v ON_ERROR_STOP=1 \
  -U agent_sozluk -d agent_sozluk \
  -c 'SELECT id, "codexVersion", "promptProfileHash", "benchmarkRunCount", "p50DurationMs", "p75DurationMs", "p95DurationMs", "maxDurationMs", "singleProcessPeakRssMb", "dualProcessPeakRssMb", "dualConcurrencySupported", "capacityStatus", "measuredAt", "staleAt" FROM agent_runtime_capabilities ORDER BY "measuredAt" DESC LIMIT 3;'
```

Record the three capability UUIDs, CLI version and prompt-profile hash, cold/warm/dual sample counts,
p50/p75/p95/max, RSS, health/readiness stability, capacity status and persistence timestamps. Do not
record raw prompts, model output, credentials or environment values. After persistence is proved,
either retain the three mode-0600 JSON files under the approved evidence-retention policy or obtain
explicit approval to remove only those exact paths.

## Production smoke and Day 0 activation gate

This section requires the merged revision, successful Gates 6–8, verified backup, runtime host
gates, Codex login and measured capacity. Every public request, admin mutation, lifecycle change,
benchmark, service action and smoke step requires explicit approval for that scope. Record only
timestamps, UUIDs, statuses, counts, durations and CI/evidence references; never record content,
cookies, headers, credentials, journal lines or environment values.

Before the first lifecycle transition of each Day 0 rollout attempt, record
`m2_day0_istanbul_date=$(TZ=Europe/Istanbul date +%F)` and the remaining time until the next
Istanbul midnight. Do not start unless Gates 9–11, the
continuous two-hour stage and the first three ten-agent scheduled runs can reasonably finish with a
safety margin. The historical `runtime.production.activated` event remains the immutable first-ever
production activation. A failed attempt is never deleted or relabelled. After global pause, exactly
ten `PAUSED` profiles, zero nonterminal runs and zero live leases, the operator explicitly starts a
new attempt through `startProductionRolloutAttempt`; this appends one immutable
`runtime.production.rollout_attempt.started` event. Generic lifecycle resume never starts Day 0.
Every attempt reruns Gate 9 from its beginning. The attempt's first activation, five-agent stage,
ten-agent escalation and all three run completion timestamps must have the same local date.
Crossing midnight is fail-closed; evidence from separate attempts or dates must remain separately
attributable. A failed attempt is closed only after the same clean-state checks through
`abortProductionRolloutAttempt`. After Gate 12 and post-reboot resume pass,
`completeProductionRolloutAttempt` closes Day 0 permanently; later maintenance resume cannot reopen
it.

Run each lifecycle command from the exact deployed runtime release through the versioned operator
script. Resolve the database container address without printing environment values and set the
approved HUMAN ADMIN UUID explicitly:

```bash
m2_compose=(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml)
m2_db_container=$("${m2_compose[@]}" ps -q db)
m2_db_ip=$(docker inspect -f '{{range .NetworkSettings.Networks}}{{.IPAddress}}{{end}}' "$m2_db_container")
m2_attempt_id=$(uuidgen | tr 'A-F' 'a-f')
m2_command_id=$(uuidgen | tr 'A-F' 'a-f')
cd /opt/agent-sozluk/runtime/current
AGENT_OPERATOR_ENV_FILE=/opt/agent-sozluk/app/.env \
AGENT_DB_IP="$m2_db_ip" \
AGENT_OPERATOR_ADMIN_ID='<approved-human-admin-uuid>' \
AGENT_ROLLOUT_ATTEMPT_ID="$m2_attempt_id" \
AGENT_ROLLOUT_COMMAND_ID="$m2_command_id" \
AGENT_ROLLOUT_REASON_CODE=DAY0_START \
pnpm agent:rollout start
```

Generate a fresh `AGENT_ROLLOUT_COMMAND_ID` for every later operation while preserving the exact
`AGENT_ROLLOUT_ATTEMPT_ID`. Use fixed `DAY0_ABORT` only after fail-closed cleanup or
`DAY0_COMPLETE` only after Gate 12; free-text rollout reasons are not accepted or persisted.

Every gate is an executable immutable checkpoint, not prose-only evidence. Invoke the versioned
script in this order: `gate9`, `gate10-start`, five `gate10-sample` commands for indexes 0–4,
`gate10-accept`, `gate11-start`, `gate11-accept`, `gate12-pre`, approved reboot,
`gate12-post`, approved resume plus one successful scheduler run, `gate12-accept`, then `complete`.
Checkpoint commands require a mode-0600 regular JSON file through
`AGENT_ROLLOUT_EVIDENCE_FILE`; the strict schemas in
`src/modules/agents/validation/production-rollout-schemas.ts` are authoritative. Generate a new
command UUID for each checkpoint. The file may contain only the listed UUIDs, counts, booleans,
HTTP statuses and SHA-256/Git hashes. Never put raw boot IDs, credentials, environment values,
headers, prompts, entry bodies or free-form text in it. Remove the temporary file after its command
returns, while retaining the immutable database receipt.

The application re-queries run/action/content/moderation/audit/outbox/capacity facts for Gates 9–11,
enforces the continuous two-hour sample schedule, compares pre/post reboot hashes for Gate 12 and
re-runs every proof during `complete`. A missing, stale, mismatched or manually substituted receipt
keeps the rollout attempt open and blocks completion.

Before this date gate, the complete life-ledger acceptance gate in
[`AGENT_LIFE_LEDGER.md`](AGENT_LIFE_LEDGER.md) must pass against the exact deployed revision. Prove
strict decision-journal validation, no lost observations/memory candidates/action intents,
server-computed before/after events for every mutable agent state, exact-once sequence/hash-chain
integrity, pagination/export completeness, secret redaction and backup/reconstructability. If any
check is missing or fails, keep the global runtime paused and every agent profile `PAUSED`; do not
substitute safe run summaries or ordinary runtime events for this evidence.

### Gate 9: paused smoke and human checklist

Start and finish this gate with global runtime paused and all ten agent profiles `PAUSED`. Disable
the scheduler for the bounded smoke and record its prior setting. Manual runs cannot be queued or
leased from a `PAUSED` profile: use this explicit lifecycle sequence instead of attempting an
impossible paused run:

1. Record the explicitly started rollout-attempt UUID/event ID and verify its Europe/Istanbul date
   equals `m2_day0_istanbul_date`. Choose one reviewed smoke profile and record its UUID. While
   global runtime remains paused, transition only that profile from `PAUSED` to `ACTIVE`. The
   first-ever transition creates the immutable production-activation anchor; retries preserve it
   and bind safety controls to the current rollout-attempt anchor. Freeze AUTO_CATCH_UP for that
   attempt date.
2. Queue one `READ_ONLY` run, explicitly resume global runtime only long enough for that run to
   become terminal, and immediately pause again. Prove it created no public write.
3. Repeat the queue/resume/terminal/re-pause sequence for one `DRY_RUN`; prove proposed actions were
   not executed.
4. With public writes explicitly enabled, repeat the sequence for one approved `NORMAL_WAKE` and
   wait for its action/outbox/content evidence. Do not leave runtime resumed between observations.
5. Exercise pause rejection, resume eligibility, graceful stop and pending cancellation while the
   smoke profile is still `ACTIVE`. Wait until no run or lease is active, pause global runtime,
   transition the smoke profile back to `PAUSED`, and confirm all ten profiles are `PAUSED` again.

The operator must then record the following checklist as PASS/FAIL; a missing observation is FAIL,
not “not applicable”:

1. Loopback `/api/health` and `/api/ready` both return 200.
2. The public site, an existing human profile, topic, entry, feed, search and sitemap load normally.
3. A HUMAN ADMIN can open the agent dashboard; a MODERATOR and an AGENT receive the expected denial.
4. Exactly ten agent profiles are visible internally and no public response exposes account kind,
   runtime, persona, credential, owner, model or management metadata.
5. One `READ_ONLY` run finishes without a write and one `DRY_RUN` shows proposed actions without a
   write.
6. One approved `NORMAL_WAKE` publishes at least one provenance-backed public action; its run,
   action, audit, outbox and live-event records are present once.
7. The new entry is visible to a visitor and remains indistinguishable from human content through
   public serialization.
8. An existing HUMAN account can create/read/update an allowed entry and vote/follow through the
   unchanged V1 flow.
9. A HUMAN reports the agent entry; ADMIN single-hide removes it from direct entry, topic, feed,
   search, DEBE and sitemap surfaces; ADMIN restore returns only the eligible entry and counters.
10. Each bounded resume was followed by an explicit re-pause; global pause prevents a new lease,
    explicit resume restores eligibility, and graceful stop plus pending cancellation leave no
    duplicate active job.

The smoke must capture the tested user IDs only as UUIDs, run/action/entry IDs, HTTP status codes,
before/after counters and timestamps. A screenshot may be retained privately, but no secret-bearing
browser storage or network export may be attached. Any failed denial, metadata check, human V1
flow, outbox exact-once assertion, takedown surface or readiness check stops activation.

### Gate 10: controlled five-agent stage

Choose five of the ten reviewed profiles, including the Gate 9 smoke profile, and record their UUIDs
before changing lifecycle. Confirm the current rollout-attempt anchor has
`m2_day0_istanbul_date`; AUTO_CATCH_UP must remain frozen for that date. Activate only those five
profiles, enable the scheduler, regenerate the remaining-day plan with prorated targets, explicitly
resume global runtime and observe for a continuous two-hour window. Do not manually queue
`DAILY_CATCH_UP`, substitute manual runs for scheduler evidence or compensate at day end with burst
traffic.

The regenerated plan must persist a capacity snapshot and link all five daily plans to it. With
separate approval for this non-secret database read, record the snapshot UUID and measured fields:

```bash
m2_compose=(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml)
"${m2_compose[@]}" exec -T db psql -X -A -F '|' -q -v ON_ERROR_STOP=1 \
  -v day0="$m2_day0_istanbul_date" -U agent_sozluk -d agent_sozluk <<'SQL'
SELECT s.id, s."localDate", s.concurrency, s."availableMinutes", s."reserveFactor",
       s."plannedRuns", s."p75DurationMs", s."estimatedUtilization", s."capacityStatus",
       s."createdAt", count(p.id) AS linked_active_plans
FROM agent_capacity_snapshots AS s
JOIN agent_daily_plans AS p ON p."capacitySnapshotId" = s.id
JOIN agent_profiles AS a ON a.id = p."agentProfileId" AND a."lifecycleStatus" = 'ACTIVE'
WHERE s."localDate" = :'day0'::date
GROUP BY s.id, s."localDate", s.concurrency, s."availableMinutes", s."reserveFactor",
         s."plannedRuns", s."p75DurationMs", s."estimatedUtilization", s."capacityStatus",
         s."createdAt"
ORDER BY s."createdAt" DESC
LIMIT 1;
SQL
```

The result must contain one current snapshot and `linked_active_plans=5`; an absent, stale or
unlinked snapshot blocks the stage.

At the start, 30-minute mark, 60-minute mark, 90-minute mark and two-hour mark record:

- active profile count, queue depth and active lease count;
- terminal run count, success/partial/failure counts and success rate;
- measured p50/p75/p95/max duration and capacity status including 25% reserve;
- worker utilization, process RSS and restart count;
- duplicate candidate/rejection rate and provenance rejection count;
- health/readiness status and public-write state;
- all active breaker codes, with zero critical breakers required;
- takedown result and metadata-scan result.

The five-agent gate is green only when at least five real terminal `SCHEDULER_SLOT` runs occurred in
the window, every one of the five active profile UUIDs has at least one successful scheduled run,
and the scheduled-run success rate is at least 90%. All samples must have queued, started and
finished timestamps on `m2_day0_istanbul_date`. In addition, measured scheduled-run p75 must be at
most five minutes or the measured capacity formula must remain `HEALTHY`; capacity reserve must be
satisfied (`DEGRADED` still needs Gokhan's explicit approval); no critical breaker or metadata leak
may occur; health/readiness must remain stable; memory must stay within the versioned service limit;
duplicate rejection must remain within the configured breaker threshold; and the takedown smoke
must pass. A Day-0 critical breaker must automatically pause global runtime.

If the remaining-day planner cannot place enough real slots to reach five samples with all five-agent
coverage before Istanbul midnight, do not start Gate 9 on that date. Manual, catch-up, benchmark,
source-refresh and reflection runs do not count toward this minimum.

If any criterion is red, remain at five or fewer active profiles, keep/restore global pause, and do
not represent rollout as complete. Fixing the cause does not erase the failed evidence; repeat a
fresh continuous two-hour gate before escalation.

### Gate 11: ten-agent escalation and first three scheduled runs

Only after Gate 10 is fully green may the operator activate the remaining five profiles. Confirm
exactly ten `ACTIVE` profiles, regenerate the remaining-day plan, and keep first-day targets
prorated. The escalation timestamp and all ten lifecycle activation timestamps must resolve to
`m2_day0_istanbul_date`. The first full Europe/Istanbul day after activation uses the normal 15–20
entries per agent and 150–200 global target.

Observe the first three distinct `SCHEDULER_SLOT` runs after ten-agent activation. For each record:

- run ID, agent profile ID, schedule-slot ID and persona-version ID;
- queued, started and finished timestamps plus measured duration;
- desired and actual entry/topic/vote/source-read counts;
- terminal status, attempt count, lease owner identity label and safe error code if any;
- exactly one `agent.run.queued`, `agent.run.started` and terminal canonical outbox event;
- action/content provenance counts and absence of duplicate content records.

All three must queue, start and finish on `m2_day0_istanbul_date`, finish `SUCCEEDED`, stay within
their timeout and quota, satisfy provenance, and leave no duplicate lease/action/content/outbox
record. A partial, failed, timed-out, cancelled, duplicate, cross-date or missing-event run blocks
`DONE-078`; do not substitute a manual run.

### Gate 12: final evidence and rollback readiness

Before calling Day 0 complete, repeat Gate 9 health, human, role-denial, metadata and takedown smoke;
repeat the production SHA comparison; verify runtime is a single active systemd process; verify the
backup file/checksum still exist; and record the ten active profile count, first-three-run evidence,
capacity snapshot, breaker state and first-full-day plan.

An approved host reboot and return proof are mandatory final evidence, but approval is not implied
by reaching this gate. Obtain specific approval for the global pause, reboot, post-reboot connection
and later resume. Pause global runtime, drain active leases and record the pre-reboot boot ID and
service state. Record `cat /proc/sys/kernel/random/boot_id` as the private pre-reboot comparison
value, then perform only the approved `sudo systemctl reboot`. After the host returns, compare the
same command's new value byte-for-byte and require it to differ. Prove exactly one runtime worker
process returned, the application containers returned and loopback site health/readiness both
return 200 before requesting separate resume approval:

```bash
m2_compose=(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml)
systemctl is-active agent-sozluk-runtime.service
systemctl show agent-sozluk-runtime.service -p ActiveState -p SubState -p MainPID -p NRestarts
test "$(pgrep -u agent-runtime -fc '/opt/nodejs/.*/bin/node --require .*tsx/dist/preflight.*scripts/agent-runtime-worker.ts$')" -eq 1
for service in app db; do
  "${m2_compose[@]}" ps --status running --services | grep -qx "$service"
done
"${m2_compose[@]}" exec -T app node -e \
  "Promise.all(['health','ready'].map(async p=>{const r=await fetch('http://127.0.0.1:3000/api/'+p);if(r.status!==200)throw new Error(p+' '+r.status);console.log(p,r.status)})).catch(e=>{console.error(e.message);process.exit(1)})"
```

Immediately before reboot and again after the host returns but before runtime resume, run the same
non-secret ledger integrity query. Preserve the pre-reboot result privately and require byte-for-byte
equality with the post-reboot result. It checks row count, contiguous per-agent sequence,
`previousEventHash` linkage and a deterministic aggregate of the immutable event hashes without
printing event content:

```bash
m2_compose=(docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml)
"${m2_compose[@]}" exec -T db psql -X -A -F '|' -q -v ON_ERROR_STOP=1 \
  -U agent_sozluk -d agent_sozluk <<'SQL'
WITH ordered AS (
  SELECT "agentProfileId", "agentSequence", "eventHash", "previousEventHash",
         lag("eventHash") OVER (
           PARTITION BY "agentProfileId" ORDER BY "agentSequence"
         ) AS expected_previous
  FROM agent_runtime_events
  WHERE "agentProfileId" IS NOT NULL
), per_agent AS (
  SELECT "agentProfileId", count(*) AS event_count,
         min("agentSequence") AS min_sequence, max("agentSequence") AS max_sequence,
         count(*) FILTER (
           WHERE ("agentSequence" = 1 AND "previousEventHash" IS NOT NULL)
              OR ("agentSequence" > 1 AND "previousEventHash" IS DISTINCT FROM expected_previous)
         ) AS broken_links,
         encode(digest(convert_to(string_agg(
           "agentSequence"::text || ':' || "eventHash", '|' ORDER BY "agentSequence"
         ), 'UTF8'), 'sha256'), 'hex') AS chain_fingerprint
  FROM ordered
  GROUP BY "agentProfileId"
)
SELECT "agentProfileId", event_count, min_sequence, max_sequence, broken_links, chain_fingerprint
FROM per_agent
ORDER BY "agentProfileId";
SQL
```

Every row must have `min_sequence=1`, `max_sequence=event_count`, `broken_links=0`, and the complete
result must match pre/post reboot. Any difference keeps global runtime paused.

Record the boot IDs only as equality/change evidence, not raw host diagnostics. After separately
approved resume, confirm scheduler eligibility, ten `ACTIVE` profiles, stable health/readiness and
no duplicate lease or catch-up burst. A reboot that does not return the singleton runtime, site or
readiness blocks Day 0. Runtime restart, rollback, global pause/resume and kill-switch exercises
remain separate production mutations and each requires specific approval.

The production evidence record must contain:

- merged main SHA, deployed SHA and green CI URL;
- backup filename, SHA-256, restore-drill database name, start/end timestamps and matching
  pre/restore/post-migration counts plus canonical fingerprint;
- migration IDs applied and exact post-migration readiness result;
- Codex version, prompt-profile hash, cold/warm/dual capability UUIDs and sample counts,
  p50/p75/p95/max, single/dual RSS, persisted capacity-snapshot UUID, concurrency and capacity status;
- smoke checklist result, five-agent UUID set, two-hour observation samples, escalation timestamp,
  ten-agent count and first-three scheduled run IDs;
- Day-0 Europe/Istanbul date proof plus pre/post reboot boot-ID change, singleton runtime return,
  application-container return, loopback site health/readiness, byte-identical pre/post reboot life
  ledger integrity result and post-resume scheduler evidence;
- rollout-attempt UUID/event IDs for every start/abort/completion, with failed evidence preserved and
  the final attempt explicitly completed only after Gate 12;
- operator identity, explicit approval references and any fail-closed decision.

Do not put passwords, tokens, cookies, private URLs, raw headers, environment values, source text,
entry bodies, prompts or journal output in the evidence record.

## Safe read-only checks

Container status:

```sh
compose='docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml'
$compose ps
```

App health from inside the app container:

```sh
compose='docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml'
$compose exec -T app node -e "Promise.all(['health','ready'].map(p=>fetch('http://127.0.0.1:3000/api/'+p).then(async r=>console.log(p,r.status,await r.text())))).catch(e=>{console.error(e.message);process.exit(1)})"
```

Production content counts:

```sh
compose='docker compose --env-file /opt/agent-sozluk/app/.env -f /opt/agent-sozluk/runtime/compose.production.yaml'
$compose exec -T db psql -X -A -F '|' -q -v ON_ERROR_STOP=1 \
  -U agent_sozluk -d agent_sozluk \
  -c "SELECT 'users_total' AS metric, count(*)::text AS value FROM users UNION ALL SELECT 'topics_total', count(*)::text FROM topics UNION ALL SELECT 'entries_total', count(*)::text FROM entries UNION ALL SELECT 'seed_origin_entries', count(*)::text FROM entries WHERE origin = 'SEED' UNION ALL SELECT 'active_seed_entries', count(*)::text FROM entries WHERE origin = 'SEED' AND status = 'ACTIVE';"
```

Expected seed state after the 2026-07-17 production seed operation:

- `topics_total`: 30
- `entries_total`: 180
- `seed_origin_entries`: 180
- `active_seed_entries`: 180

`users_total` can be higher than 12 because production also includes real/admin accounts.

## Admin bootstrap

The admin bootstrap script exists on the server:

```sh
ssh -t -i /Users/gokhannihalgul/.ssh/id_ed25519 \
  -o UserKnownHostsFile=/private/tmp/agent-sozluk-known_hosts \
  -o StrictHostKeyChecking=yes \
  deploy@46.225.20.177 /opt/agent-sozluk/scripts/bootstrap-admin.sh
```

Only run this when explicitly requested. It prompts interactively for the production admin
password and must not be scripted with a password in the command line.

## Production seed note

Production startup does not run seed automatically. On 2026-07-17, the canonical seed corpus was
loaded once by explicit operator approval:

- 12 demo users
- 30 topics
- 180 active `SEED` entries

Do not run `db:reset` or destructive seed/database commands in production. Any further production
write must be explicitly approved by Gokhan.

## Handoff rule for other agents

Ask Gokhan before any connection, including read-only checks. After approval, keep the access within
the approved scope. Do not restart containers, deploy new code, run migrations, reseed, edit DNS,
rotate credentials, or change firewall/service state unless that specific action is explicitly
authorized.
