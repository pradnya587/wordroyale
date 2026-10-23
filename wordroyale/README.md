# wordRoyale — real-time multiplayer word game (microservices)

Up to six players join a private room by code and play **3 rounds** against a server-controlled clock.
The lowest scorer is eliminated after **Round 1, Round 2 and Round 3**, but never below 2 players, so every game plays all three rounds.
The frontend is the same Next.js UI as before — only the backend was split into services.

```
Browser ──► gateway (nginx :80) ──┬─► frontend       Next.js UI
                                  ├─► auth-service   register / login / guest, issues JWTs      ─► Postgres auth_db
                                  ├─► stats-service  leaderboard, profile, match history        ─► Postgres stats_db
                                  └─► game-service   Socket.IO: rooms, rounds, timer, scoring   (state in memory)
                                            │ game.finished (Redis Stream)
                                            └──────────────► Redis ──────► stats-service
Prometheus scrapes /metrics on every service ─► Grafana dashboard
```

| Service | Port (internal) | Owns | Tech |
|---|---|---|---|
| gateway | 80 (public) | routing, WebSocket upgrade, rate limit | nginx |
| frontend | 3000 | UI | Next.js 16, TypeScript |
| auth-service | 4001 | `users` (auth_db) | Express, pg, bcryptjs, JWT |
| game-service | 4002 | live game state (in memory) | Express, Socket.IO, ioredis |
| stats-service | 4003 | `games`, `game_players` (stats_db) | Express, pg, Redis Streams consumer |
| postgres / redis | 5432 / 6379 | data / event stream | |
| prometheus / grafana | 9090 / 3001 | metrics / dashboards | |

Why this split: login and the leaderboard are ordinary stateless request/response work, so they are separate services that can be
deployed, scaled and failed independently. The game itself (rooms, timers, validation, scoring, elimination) stays in **one** service
because it changes many times a second and must stay consistent — splitting it would only add network delay. The dictionary is a local
`words.txt` loaded into memory (as in the BRD). When a game ends, game-service publishes `game.finished` to a Redis Stream; stats-service
consumes it through a consumer group, so a result is never lost if stats-service is down.

## Run everything (Docker)

```bash
cp .env.example .env          # set JWT_SECRET, POSTGRES_PASSWORD, GRAFANA_ADMIN_PASSWORD
docker compose up -d --build
```

| What | URL |
|---|---|
| Game | http://localhost |
| Grafana dashboard "wordRoyale overview" | http://localhost:3001 (login from `.env`) |
| Prometheus | http://localhost:9090 |

Logs are structured JSON: `docker compose logs -f game-service`.

## Run a service on its own (development)

```bash
# infra only
docker compose up -d postgres redis
# a service (example)
cd services/game-service && npm install && JWT_SECRET=dev npm run dev
# frontend alone (talks to the gateway or to services you started yourself)
cd frontend && cp .env.example .env.local && npm install && npm run dev
```

Each service has its own `package.json`, `Dockerfile`, tests and README-level config in `src/config.js` (all settings come from environment variables).

## Game rules (implemented in game-service)

| Round | Type | Time | Rule |
|---|---|---|---|
| 1 | Word chain | 45 s | Each word must start with the last letter of your previous word (first word: the last letter of the seed word) |
| 2 | Letter builder | 60 s | Build words from the shared rack of letters; each tile once |
| 3 | Speed round | 20 s | Words must contain the given letter and a minimum length; streak bonus |

- Every word: min length, round rule, dictionary check, not already used by you. Scores are **provisional** until the round ends.
- If two or more players submit the same word in a round, it scores **0 for all of them** (duplicate).
- After each round the lowest **total** score is eliminated. Ties: lower score this round → reached their score later → joined later.
- Elimination stops when 2 players are left (`MIN_ALIVE`), so every game plays all 3 rounds: with 6 players 5 → 4 → 3 remain, with 4 players 3 → 2 → 2, with 2 players nobody is eliminated and the higher total wins. (If everyone else leaves mid-game, the last player wins at once.)
- A player who disconnects has **30 s** to reconnect (same login) with their score intact; the round never waits for them.
- All timing uses the server clock: `round:start` carries `endsAt` and `serverTime`, and late words are rejected by the server.

Round lengths and other values can be changed with environment variables (`ROUND_DURATIONS_MS`, `INTERMISSION_MS`, `RECONNECT_GRACE_MS`).

## Tests

```bash
cd services/auth-service  && npm install && npm test     # 10 tests: register, login, guest, JWT
cd services/game-service  && npm install && npm test     # 57 tests: validation, duplicates, scoring, elimination, tie-break, rooms, reconnect, real sockets
cd services/stats-service && npm install && npm test     # 19 tests (set REDIS_URL=redis://localhost:6379 to include the Redis Stream tests)
```

## Load test

```bash
cd loadtest && npm install
node bots.js --url http://localhost --rooms 10 --players 6 --think 900
```

Plays full games with bot players over real WebSockets through the gateway and prints throughput and word-submit latency percentiles.
Watch the Grafana dashboard while it runs. Tip: use short rounds on the server for a quick run
(`ROUND_DURATIONS_MS=8000,8000,5000 INTERMISSION_MS=2000`).

## CI/CD (.github/workflows/ci.yml)

On every push/PR: tests for each service (with a Redis service container), `npm audit`, frontend type-check and build.
On `main`: only the services whose folder changed are built, scanned with Trivy and pushed to GitHub Container Registry,
then the VM pulls the new images and restarts them (`docker compose pull && docker compose up -d`).
Repository secrets needed: `VM_HOST`, `VM_USER`, `VM_SSH_KEY`. On the VM, create `/opt/wordroyale/.env` once (copy of `.env.example`
with real secrets and `REGISTRY=ghcr.io/<your-github-username>`).

## The pages

| Page | What it does |
|---|---|
| `/` | Landing page, login / sign-up / guest. **Create room** and **Join room** talk to game-service and open the room |
| `/room/ABC123` | The whole match on one route, switched by what the server reports: **lobby** (6 seats, copy code / invite link, ready, host starts, kick) → **game** (round stepper, server-driven timer ring, per-round play area, word input, live scoreboard, spectator mode, round-end overlay with duplicates and elimination) → **results** (podium, standings, stats, play again) |
| reconnect | If the connection drops, a blurred overlay shows the 30 s grace countdown; the page restores itself from the server when the connection returns |

Invite links (`/room/ABC123`) also work for people who are not logged in yet: they are sent to the home page and continue into the room after logging in or choosing guest.

## More

- `docs/architecture.md` — design decisions, data ownership, failure behaviour
- `docs/api.md` — REST endpoints
- `docs/events.md` — Socket.IO events and payloads
