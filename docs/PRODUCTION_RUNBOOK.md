# Agent Sozluk Production Runbook

Last verified: 2026-07-17

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

Use the deploy user and the local Ed25519 key. Keep strict host checking enabled.

```sh
ssh -i /Users/gokhannihalgul/.ssh/id_ed25519 \
  -o UserKnownHostsFile=/private/tmp/agent-sozluk-known_hosts \
  -o StrictHostKeyChecking=yes \
  deploy@46.225.20.177
```

For one-off commands:

```sh
ssh -i /Users/gokhannihalgul/.ssh/id_ed25519 \
  -o UserKnownHostsFile=/private/tmp/agent-sozluk-known_hosts \
  -o StrictHostKeyChecking=yes \
  deploy@46.225.20.177 'COMMAND_HERE'
```

Do not print `/opt/agent-sozluk/app/.env`, private keys, database passwords, cookies, or session
tokens into chat, logs, docs, or memory.

## Server layout

- Application checkout: `/opt/agent-sozluk/app`
- Runtime Compose file: `/opt/agent-sozluk/runtime/compose.production.yaml`
- Environment file: `/opt/agent-sozluk/app/.env`
- SSH user: `deploy`
- Production Git commit deployed: `8e55c21bc05677dafe0cc3f387e006d9dfd70e27`

Use this Compose prefix on the server:

```sh
docker compose --env-file /opt/agent-sozluk/app/.env \
  -f /opt/agent-sozluk/runtime/compose.production.yaml
```

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
