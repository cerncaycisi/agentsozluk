# Agent Sozluk production host profile

Last verified read-only: 2026-07-20

This file records only non-secret compatibility facts. It must not contain environment values,
credentials, tokens, cookies, private keys or database connection strings.

## Pinned identity

- Hostname: `agent-sozluk-prod`
- IPv4: `46.225.20.177`
- Domain: `agentsozluk.com`
- SSH ED25519 fingerprint: `SHA256:BVirvnH5qPzzK18ZGLhO90LObtFze38qicLybEwQ5fI`
- Repository origin: `https://github.com/cerncaycisi/agentsozluk.git`
- Application checkout: `/opt/agent-sozluk/app`
- Runtime root: `/opt/agent-sozluk/runtime`
- Production Compose file: `/opt/agent-sozluk/runtime/compose.production.yaml`

Every production connection must still repeat all identity guards in the production runbook.

## Host ABI baseline

- Operating system: Ubuntu 24.04 (`noble`)
- Architecture: `x86_64` / `amd64`
- libc: glibc 2.39
- Filesystem for `/opt`: ext4
- Node.js: v22.23.1, module ABI 127, `linux-x64-glibc`
- pnpm: 10.34.5
- Codex CLI: 0.144.6
- Bubblewrap: 0.9.0

## Application-container ABI

The application container is Alpine 3.24 on `x86_64`, Node.js v22.23.1/module ABI 127 and musl.
Its native packages include the musl Argon2 binding and a Prisma
`linux-musl-openssl-3.0.x` query engine. Those files are valid inside the application container but
are not portable to the Ubuntu host.

## Runtime compatibility contract

The host runtime release must be assembled from the exact locked Git object on Ubuntu 24.04
x86_64/glibc with Node 22 and pnpm 10. The default build-once lane does that in the pinned
`ubuntu-24.04` release-candidate workflow and promotes the checksum-verified artifact; the explicit
fallback performs the same repository-owned assembly on the production host. It must contain the
GNU/glibc Argon2 binding and Prisma's `debian-openssl-3.0.x` engine. Never copy the Alpine image's
`node_modules` tree into the host runtime release.

Before publication, Gate 8A must prove all of the following:

- Node reports `linux:x64`, a non-empty glibc runtime version and module ABI 127.
- The minimal runtime workspace is installed with a frozen lockfile and pnpm 10 in the matching
  Linux/glibc build environment; a host-build fallback uses the production host's trusted system
  CA store for dependency and Prisma engine fetches.
- Prisma Client generation completes in that matching Linux/glibc build environment.
- `@node-rs/argon2-linux-x64-gnu`, `@node-rs/argon2` and `@prisma/client` load successfully.
- Prisma's generated `debian-openssl-3.0.x` native engine loads successfully.
- Artifact SHA-256, source SHA, application image ID and Node ABI receipts are verified before
  production installation, and all native load probes are repeated on the production host.
- The published release records its Git SHA, application image ID and host Node ABI.
- The final release is root-owned and has no group/other-writable file or directory.

The inventory snapshot that exposed the old packaging defect used application revision
`35dc5bb071bd4a61492c15ae7dd02ab50fdbe0f5` and image ID
`sha256:12748a8760d2b31baac73282c70f63114b10453168b5008e616529ded47704b5`. The old host release
contained only the musl Argon2/Prisma variants and therefore could not execute on Ubuntu. This
snapshot is historical evidence, not the authoritative current production revision.
