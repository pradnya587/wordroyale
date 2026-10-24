# REST API (all paths go through the gateway)

Errors are JSON: `{ "error": "message" }`. Protected endpoints need `Authorization: Bearer <token>`.

## auth-service — `/api/auth/*`
| Method | Path | Body | Success |
|---|---|---|---|
| POST | `/api/auth/register` | `{ username, email, password }` — username 3–20 chars (letters, digits, `_`), password 4–72 chars | `201 { token, user: { id, username } }` · `409` if username/email taken |
| POST | `/api/auth/login` | `{ email, password }` | `200 { token, user }` · `401` invalid email or password |
| POST | `/api/auth/guest` | `{}` | `200 { token, user: { id, username } }` — temporary identity so guests can play (not on the leaderboard) |
| GET | `/api/auth/me` | — | `200 { user: { id, username, guest } }` |
| GET | `/health`, `/metrics` | — | internal (not routed by the gateway; Prometheus scrapes `/metrics`) |

The JWT (HS256, signed with `JWT_SECRET`) is used for the REST calls below **and** for the Socket.IO handshake (`auth: { token }`).
game-service and stats-service verify it themselves; they never call auth-service.

## stats-service — `/api/stats/*`
| Method | Path | Notes |
|---|---|---|
| GET | `/api/stats/leaderboard?range=today\|weekly\|all&limit=50` | `{ range, entries: [{ rank, playerId, username, games, wins, totalScore, bestWord, bestWordPoints }] }` — registered players only |
| GET | `/api/stats/me` | (auth) `{ user, summary: { games, wins, winRate, totalScore, bestWord, bestWordPoints }, history: [...] }` |
