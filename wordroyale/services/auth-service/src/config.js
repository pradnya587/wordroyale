function load(env = process.env) {
  const secret = env.JWT_SECRET
  if (!secret) throw new Error('JWT_SECRET is required')
  return {
    port: Number(env.PORT || 4001),
    databaseUrl: env.DATABASE_URL || 'postgres://wordroyale:wordroyale@localhost:5432/auth_db',
    jwtSecret: secret,
    userTokenTtl: env.USER_TOKEN_TTL || '7d',
    guestTokenTtl: env.GUEST_TOKEN_TTL || '12h',
    bcryptRounds: Number(env.BCRYPT_ROUNDS || 10),
    corsOrigin: env.CORS_ORIGIN || '*',
    rateLimitPerMinute: Number(env.AUTH_RATE_LIMIT_PER_MIN || 30), // 0 disables
    logLevel: env.LOG_LEVEL || 'info',
  }
}
module.exports = { load }
