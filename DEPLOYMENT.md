# Self-hosted deployment runbook

This is a runbook for the repository's current **single long-running Node.js + PostgreSQL** topology. It is not a record of a completed public production acceptance. Read [ARCHITECTURE.md](ARCHITECTURE.md) for data and trust boundaries and [QA.md](QA.md) for actual verification. The GitHub Actions workflow builds a container but does not deploy it.

## Prerequisites and ownership

- A Linux host with Docker Engine and Docker Compose, adequate disk space for PostgreSQL binary materials and backups, and an operator who controls its DNS and firewall.
- A domain with an A/AAAA record pointing to the host; inbound TCP 80 and 443 for the included Caddy overlay. The app's port is bound to host loopback only; PostgreSQL has no published host port.
- A secure place for `.env.production`, database backups and a **paired backup of the `app_secrets` volume**. Keep backups off the application host and restrict access.
- An authorized person to create the first staff account and approve actual admissions rules, staff permissions and retention policy before accepting real applicants.

The reverse proxy may be replaced, but the public origin, forwarded host, secure cookies and WebAuthn origin must remain consistent. A static host or short-lived serverless functions do not run the in-process audio/intake workers correctly.

## DNS and environment

Clone the repository on the server, then create the ignored environment file. Use a strong, unique database password; URL-encode reserved characters in the password portion of `DATABASE_URL`. The two passwords must match. Do not put real credentials in `git`, image layers, command history or issue comments.

```sh
git clone https://github.com/BAITC-Hacks/hack-051a0227-dogs.git
cd hack-051a0227-dogs
cp .env.production.example .env.production
chmod 600 .env.production
# Edit .env.production on this server: POSTGRES_PASSWORD, DATABASE_URL,
# APP_DOMAIN and APP_ORIGIN=https://the-same-domain.
```

The private GitHub repository requires a read-authorized checkout method. The template includes `ENABLE_LOCAL_SEED=false`, `ASSESSMENT_ENVIRONMENT=standard`, `COOKIE_SECURE=true` and local factual providers. Keep those values for a real installation. `APP_ORIGIN` must have `https://` and the same host as `APP_DOMAIN`; do not use `localhost` or `127.0.0.1` for a public deployment. The application currently runs from one container instance.

| Variable | Production purpose |
| --- | --- |
| `POSTGRES_PASSWORD` | Password used by the Compose PostgreSQL container. |
| `DATABASE_URL` | Matching Prisma URL using host `db`, database `invision` and the same password. |
| `APP_DOMAIN` / `APP_ORIGIN` | Public DNS host and exact HTTPS origin. |
| `COOKIE_SECURE` | Must be `true` behind public HTTPS. |
| `ENABLE_LOCAL_SEED` | Keep `false`; fictional local seed does not belong on a public database. |
| `ASSESSMENT_ENVIRONMENT` | Keep `standard`; `isolated-local` gates prepared fictional scoring. |
| `ASSESSMENT_PROVIDER` / `PROFILE_PROVIDER` | `local` is the supported baseline. A generic external numeric AXIS transport is not configured. |
| `INTAKE_WORKER_DISABLED` | Keep `false` for the long-running application's persistent jobs. |
| `AUDIO_DAILY_REQUEST_LIMIT` | Secondary request cap; owner-controlled monetary limits are separate. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional server-only OAuth Web client for Calendar/Meet. |

`OPENAI_API_KEY` is not a supported deployment setting. The code deliberately uses an owner connection record and a protected local master-key store. See [OpenAI limitation](#openai-configuration-and-current-limitation) below.

## Build and start

Check DNS before starting Caddy. Then use **both** Compose files for HTTPS:

```sh
docker compose --env-file .env.production -f compose.yaml -f compose.public.yaml up -d --build
docker compose --env-file .env.production -f compose.yaml -f compose.public.yaml ps
curl -fsS https://YOUR_DOMAIN/api/health
```

Replace `YOUR_DOMAIN` with the configured host. `compose.yaml` starts PostgreSQL, waits for its health check and starts the app. The Dockerfile's command applies committed Prisma migrations (`npm run db:migrate`) and then starts Next.js on `0.0.0.0:3000` as the non-root `node` user. `compose.public.yaml` starts Caddy after the app is healthy; Caddy obtains/renews TLS and proxies to `app:3000`. The app also binds `127.0.0.1:${APP_PORT:-3000}` on the host for local diagnostics. Restrict shell access to the server; neither database nor secret volume is exposed as a public service.

For a **closed local test only**, omit `compose.public.yaml`, choose an exact HTTP `APP_ORIGIN` that matches the browser and set `COOKIE_SECURE=false`. WebAuthn treats `localhost` and `127.0.0.1` as different origins. Do not use this setting for a public internet deployment.

A 200 response from `/api/health` proves only that the Next.js process can query PostgreSQL (`SELECT 1`). It does not prove sign-in, worker execution, Google/OpenAI connectivity, file privacy or World gameplay. Verify those separately on a controlled test account.

## Database migrations and first staff account

Migrations are additive files in `prisma/migrations/`. The container automatically runs `prisma migrate deploy` on startup; it does **not** run the seed. Check the app logs if migration/startup fails:

```sh
docker compose --env-file .env.production -f compose.yaml -f compose.public.yaml logs --tail=80 app
```

Create the first `STAFF` only after organizationally verifying the account holder. The bootstrap script requires the password on stdin (14–128 characters), uses a transaction and rejects a second bootstrap once any staff account exists. This example keeps the password out of command arguments and shell history:

```sh
read -r -s -p 'First staff password: ' INITIAL_STAFF_PASSWORD
printf '\n'
printf %s "$INITIAL_STAFF_PASSWORD" | docker compose --env-file .env.production -f compose.yaml -f compose.public.yaml exec -T app npm run staff:bootstrap -- staff@your-domain.example 'Full Name'
unset INITIAL_STAFF_PASSWORD
```

Use the authorized person's real work email; the script does **not** verify email ownership. It is an operator action, not public staff registration. Do not use the fictional local seed password for this account. The bootstrap path was tested on a separate empty database; a public-host run has not been performed.

## OpenAI configuration and current limitation

Current intended control is `/settings/openai`: a distinct owner, server-stored connection key, model choices, permission switches, monetary budget and call history. The gateway rejects unavailable models and never reads a public `NEXT_PUBLIC_*` key. Ordinary local operation, submission, local factual preparation and World do not need an OpenAI key. Paid model calls require a connected key plus the relevant consent and budget.

**A fresh Linux VPS cannot currently complete the first-owner setup through that UI.** `src/lib/openai-settings.server.ts` accepts only a loopback `APP_ORIGIN`; `beginOwnerSetup()` presents its pairing code through a native macOS dialog. A public HTTPS request is rejected before the setup screen can operate, and Linux has no such dialog. The Compose configuration provides persistent master-key storage, but it does not solve owner pairing. Do not claim live OpenAI support for a clean public install or paste `OPENAI_API_KEY` into `.env.production` as a workaround. A separately specified, security-reviewed operator pairing path is required before enabling public live AI. An already encrypted connection can be restored only with its matching database **and** master-key volume, subject to origin/owner checks.

For a local macOS installation, the owner connection can be established through its existing protected flow. The selected text, complex, transcription and speech model IDs are configurable in the owner screen; defaults are defined in `prisma/schema.prisma`. Tests use local or isolated transports and do not make paid requests.

## Google Calendar and Meet

The Calendar adapter is optional. To use it, a Google Cloud operator must enable Calendar API, configure the OAuth consent screen, create a **Web application** OAuth client and provide `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` to the server. Register the exact redirect URI:

```text
https://YOUR_DOMAIN/api/google/callback
```

Authorized staff connect an **owned** calendar that supports Meet in `/settings/calendar`. The requested scopes are `calendar.events.owned`, `calendar.events.freebusy` and `calendar.calendarlist.readonly`. The app checks OAuth state, account/calendar ownership, attendee availability where granted, stable event identity and asynchronous Meet conference creation. `UNKNOWN` availability is not free time. A pending conference has no fake link; rescheduling/cancellation target the linked event.

The adapter and recovery behavior have controlled tests. **Real OAuth, a live event/invitation and a confirmed Meet URL have not been accepted** in the release verification. Use only a dedicated test calendar and approved test recipients for a live run; `GOOGLE_CALENDAR_TEST_ONLY`, `GOOGLE_TEST_CALENDAR_ID` and `GOOGLE_TEST_ATTENDEES` support that allowlist. Do not invite fictional seed addresses. Vision Desk does not join Google Meet calls.

## Persistent volumes and backups

Compose declares `db_data`, `app_secrets`, `caddy_data` and `caddy_config`. `db_data` holds **all** PostgreSQL state, including uploaded original files. `app_secrets` maps to `/home/node/.invision-u-secrets` and holds per-connection master-key files; encrypted provider credentials live in the database. `caddy_data` contains TLS material. All three data-bearing concerns need a backup/renewal policy.

Take an application-consistent backup before each update and rehearse restoration on a separate host. At minimum, capture PostgreSQL and the matching secret volume together. One operator-controlled example from the repository root:

```sh
umask 077
mkdir -p ../invision-backup-YYYYMMDD
docker compose --env-file .env.production -f compose.yaml -f compose.public.yaml exec -T db pg_dump -U invision -d invision -Fc > ../invision-backup-YYYYMMDD/invision.dump
app_id=$(docker compose --env-file .env.production -f compose.yaml -f compose.public.yaml ps -q app)
docker cp "$app_id":/home/node/.invision-u-secrets ../invision-backup-YYYYMMDD/secrets
```

Replace the dated directory name; move the result to encrypted off-host storage. Inspect file ownership and restoreability rather than assuming a successful command is a usable backup. Losing `app_secrets` while retaining PostgreSQL makes stored OpenAI/Google credentials unreadable. Losing PostgreSQL loses applications, decisions, files, World saves and job state. No automated backup scheduler is included.

## Upgrade, rollback and recovery

1. Record the currently running Git commit and test the backup pair on a **separate** environment. Do not run tests against the production database.
2. Fetch the reviewed target commit, inspect migrations, then rebuild with the same `docker compose ... up -d --build` command. Docker starts `prisma migrate deploy` before Next.js. Never use `prisma migrate reset` on retained data.
3. Check `ps`, `/api/health`, sign-in, a private file, one authorized candidate/staff path, worker progress and one save/reload in World. Check external integrations only with approved test accounts/calendars.
4. If an update fails, do not assume an old image can read a newly migrated schema. Stop external traffic, restore a **matching** pre-update PostgreSQL dump and master-key volume to an isolated staging installation, verify it, then execute an approved production recovery. Migrations are additive but are not automatically reversed by rolling back code.

The repository does not provide a one-command tested production rollback. Do not delete Compose volumes (`down -v`) during upgrade or recovery. Keep application and database versions, backup timestamp and restore notes together.

## Monitoring and post-start verification

Watch the HTTP 503 rate from `/api/health`, application restarts, disk space and PostgreSQL size, failed/old `AudioJob` and `ScoringRun` records, Calendar operation failures, TLS renewal and backup freshness. Health does not inspect queues or third-party APIs. Keep logs free of raw application materials and secrets. Perform a controlled browser walkthrough after deployment: guest landing, candidate draft and submission, staff review, private file access, World entry/save/reload and logout. The release CI and local browser check do not substitute for this external HTTPS walkthrough.

## Do not run on a production database

- `npm run setup`, `npm run db:seed`, `assessment:fixtures`, `showcase:scoring`, `intake:examples` or `seed-world*` scripts.
- `npm test`, `quality:check` or any cleanup script against real applications.
- Local trust-auth PostgreSQL, HTTP cookies or fictional shared credentials on a public host.
- Paid OpenAI probes or Google invitations without configured permissions, consent, budget and approved recipients.

The local seed has both an explicit `ENABLE_LOCAL_SEED=true` gate and a loopback database-host check, but operator practice must still keep test work away from retained data.
