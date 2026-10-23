function load(env = process.env) {
  if (!env.JWT_SECRET) throw new Error('JWT_SECRET is required')
  return {
    port: Number(env.PORT || 4003),
    databaseUrl: env.DATABASE_URL || 'postgres://wordroyale:wordroyale@localhost:5432/stats_db',
    redisUrl: env.REDIS_URL || 'redis://localhost:6379',
    gameEventsStream: env.GAME_EVENTS_STREAM || 'wordroyale:game.finished',
    deadLetterStream: env.DEAD_LETTER_STREAM || 'wordroyale:game.finished.dead',
    consumerGroup: env.CONSUMER_GROUP || 'stats-service',
    consumerName: env.CONSUMER_NAME || require('os').hostname(),
    maxDeliveryAttempts: Number(env.MAX_DELIVERY_ATTEMPTS || 5),
    jwtSecret: env.JWT_SECRET,
    corsOrigin: env.CORS_ORIGIN || '*',
    logLevel: env.LOG_LEVEL || 'info',
  }
}
module.exports = { load }
