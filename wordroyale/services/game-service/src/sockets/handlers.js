const { RoomError } = require('../game/Room')
const { verifyToken } = require('../auth')

// Small token bucket per socket so a bot cannot spam word:submit.
function makeLimiter(perSecond) {
  let tokens = perSecond
  let last = Date.now()
  return () => {
    const now = Date.now()
    tokens = Math.min(perSecond, tokens + ((now - last) / 1000) * perSecond)
    last = now
    if (tokens < 1) return false
    tokens -= 1
    return true
  }
}

const fail = (err, logger) => {
  if (err instanceof RoomError) return { ok: false, error: err.code, message: err.message, ...(err.code === 'ALREADY_IN_ROOM' && err.data ? { code: err.data } : {}) }
  logger.error({ err: err.stack || err.message }, 'unexpected handler error')
  return { ok: false, error: 'INTERNAL', message: 'Something went wrong' }
}

function registerSocketHandlers(io, { manager, config, logger, metrics }) {
  // ---- authentication (JWT issued by auth-service) ----
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token || socket.handshake.query?.token
      if (!token) return next(new Error('unauthorized'))
      socket.data.user = verifyToken(String(token), config.jwtSecret)
      next()
    } catch {
      next(new Error('unauthorized'))
    }
  })

  io.on('connection', (socket) => {
    const user = socket.data.user
    metrics.wsConnections.inc()
    const canSubmit = makeLimiter(config.wordSubmitsPerSecond)

    // One live connection per user: a new tab/device replaces the old one.
    for (const [id, other] of io.sockets.sockets) {
      if (id !== socket.id && other.data.user?.id === user.id) { other.emit('session:replaced'); other.data.replaced = true; other.disconnect(true) }
    }

    // Reconnect: if this user is still in a room (e.g. after a dropped connection), re-attach them.
    const existing = manager.findByUser(user.id)
    if (existing) {
      try {
        socket.join(existing.code)
        existing.reconnect(user.id, socket.id)
        logger.info({ room: existing.code, playerId: user.id }, 'player reconnected')
      } catch (e) { logger.warn({ err: e.message }, 'reconnect failed') }
    }

    const handle = (event, fn) => socket.on(event, (payload, ack) => {
      if (typeof payload === 'function') { ack = payload; payload = {} }
      const done = typeof ack === 'function' ? ack : () => {}
      try { done(fn(payload && typeof payload === 'object' ? payload : {})) } catch (err) { done(fail(err, logger)) }
    })

    handle('room:create', () => {
      const room = manager.create(user, socket.id)
      socket.join(room.code)
      return { ok: true, code: room.code, state: room.stateFor(user.id) }
    })

    handle('room:join', ({ code }) => {
      const c = String(code ?? '').trim().toUpperCase()
      if (!/^[A-Z0-9]{6}$/.test(c)) throw new RoomError('BAD_CODE', 'Room codes are 6 characters')
      const room = manager.join(c, user, socket.id)
      socket.join(room.code)
      return { ok: true, code: room.code, state: room.stateFor(user.id) }
    })

    handle('room:sync', () => {
      const room = manager.findByUser(user.id)
      if (!room) throw new RoomError('NOT_IN_ROOM', 'You are not in a room')
      return { ok: true, state: room.stateFor(user.id) }
    })

    handle('room:ready', ({ ready }) => {
      const room = manager.findByUser(user.id)
      if (!room) throw new RoomError('NOT_IN_ROOM', 'You are not in a room')
      room.setReady(user.id, ready)
      return { ok: true }
    })

    handle('room:kick', ({ playerId }) => {
      const room = manager.findByUser(user.id)
      if (!room) throw new RoomError('NOT_IN_ROOM', 'You are not in a room')
      const target = room.kick(user.id, String(playerId ?? ''))
      io.sockets.sockets.get(target.socketId)?.leave(room.code) // stop sending room events to the kicked player
      return { ok: true }
    })

    handle('game:start', () => {
      const room = manager.findByUser(user.id)
      if (!room) throw new RoomError('NOT_IN_ROOM', 'You are not in a room')
      room.start(user.id)
      return { ok: true }
    })

    handle('word:submit', ({ word }) => {
      if (!canSubmit()) return { ok: false, error: 'RATE_LIMITED', message: 'Slow down' }
      const room = manager.findByUser(user.id)
      if (!room) throw new RoomError('NOT_IN_ROOM', 'You are not in a room')
      if (typeof word !== 'string' || word.length > 40) throw new RoomError('BAD_REQUEST', 'Invalid word')
      return { ok: true, ...room.submitWord(user.id, word) }
    })

    handle('room:leave', () => {
      const room = manager.leave(user.id)
      if (room) socket.leave(room.code)
      return { ok: true }
    })

    socket.on('disconnect', () => {
      metrics.wsConnections.dec()
      if (socket.data.replaced) return // the newer connection took over
      const room = manager.findByUser(user.id)
      if (room) room.markDisconnected(user.id)
    })
  })
}

module.exports = { registerSocketHandlers }
