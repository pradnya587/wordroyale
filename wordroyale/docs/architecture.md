# Architecture notes

## Components and data ownership
- **auth-service** owns `users` in `auth_db`. Passwords are hashed with bcrypt. Issues HS256 JWTs (7 days for users, 12 hours for guests).
- **game-service** owns all live game state, in memory (`RoomManager` → `Room` state machine: lobby → round → intermission → … → finished). It has no database.
  Rooms are deleted 5 minutes after the game ends. Pure modules (`rounds.js`, `scoring.js`, `validator.js`) hold the rules and are unit tested; `Room`
  gets its clock, random numbers and dictionary injected, so tests run whole games with a fake clock.
- **stats-service** owns `games` and `game_players` in `stats_db` and builds the leaderboard with SQL aggregation.
- **Redis** carries one stream, `wordroyale:game.finished`, from game-service to stats-service (consumer group, ack after the database write).
- **gateway** is the only public container: routes by path prefix, upgrades WebSockets, rate-limits the auth endpoints.

Services share no tables and never call each other over HTTP. The only things they share are the JWT secret (to verify tokens) and the event format.

## Server-authoritative game
- Timer: game-service sets `endsAt = now + duration` and a server timer ends the round; submissions after `endsAt` are rejected even if the timer has not fired yet.
- Validation order: round active → player not eliminated → min length → round rule → dictionary → not already used.
- Duplicates are resolved at round end (provisional scores until then). A word submitted by several players is worth 0 to each.
- Elimination and tie-break are pure functions (`scoring.pickEliminated`); the tie-break rule that was used is sent to the clients as text. Elimination only happens while more than `MIN_ALIVE` (2) players are alive, so a game never ends early.
- Reconnect: the JWT is the identity. A returning socket for a user who is still in a room is re-attached and receives the full state; after 30 s without
  returning, the player is removed (mid-game: counted as eliminated) and the round continues without waiting.
- One connection per user: a second tab replaces the first (`session:replaced`).
- Word submissions are limited to 8 per second per socket.

## Failure behaviour
| Failure | Effect |
|---|---|
| stats-service down | games keep running; results wait in the Redis Stream and are stored when it returns |
| Redis down | games keep running; game-service keeps results in a small in-memory outbox and retries every 5 s |
| auth-service down | existing players keep playing (tokens are verified locally); nobody can log in or register until it returns |
| game-service restarts | live rooms are lost (state is in memory by design); players reconnect and are told they are no longer in a room |

## Scaling notes
game-service is a single instance because a room's state lives in one process. To scale out, route by room code (consistent hashing in the gateway)
or move room state to Redis and add the Socket.IO Redis adapter. auth-service and stats-service are stateless and can run several replicas.

## Resource use (single VM)
About 9 containers; the Node services idle at roughly 60–100 MB each. An `e2-medium` (4 GB) VM is comfortable; `e2-small` (2 GB) is tight once Grafana and Prometheus run.
