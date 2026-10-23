const list = (v, fallback) => (v ? v.split(',').map((n) => Number(n.trim())) : fallback)

function load(env = process.env) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required')
  const cfg = {
    port: Number(env.PORT || 4002),
    jwtSecret: env.JWT_SECRET,
    redisUrl: env.REDIS_URL || 'redis://localhost:6379',
    gameEventsStream: env.GAME_EVENTS_STREAM || 'wordroyale:game.finished',
    dictionaryPath: env.DICTIONARY_PATH || require('path').join(__dirname, '..', 'data', 'words.txt'),
    corsOrigin: env.CORS_ORIGIN || '*',
    logLevel: env.LOG_LEVEL || 'info',
    // game rules (BRD: up to six players, three rounds, server-controlled timer, 30s reconnect grace)
    minPlayers: Number(env.MIN_PLAYERS || 2),
    maxPlayers: Number(env.MAX_PLAYERS || 6),
    minAlive: Number(env.MIN_ALIVE || 2), // elimination stops when only this many players are left
    roundDurationsMs: list(env.ROUND_DURATIONS_MS, [45000, 60000, 20000]), // word chain, letter builder, speed round
    intermissionMs: Number(env.INTERMISSION_MS || 7000),
    reconnectGraceMs: Number(env.RECONNECT_GRACE_MS || 30000),
    finishedRoomTtlMs: Number(env.FINISHED_ROOM_TTL_MS || 5 * 60_000),
    rackSize: Number(env.RACK_SIZE || 7),
    wordSubmitsPerSecond: Number(env.WORD_SUBMITS_PER_SECOND || 8),
  }
  if (cfg.roundDurationsMs.length !== 3 || cfg.roundDurationsMs.some((n) => !(n > 0))) {
    throw new Error('ROUND_DURATIONS_MS must list exactly 3 positive millisecond values')
  }
  return cfg
}
module.exports = { load }
