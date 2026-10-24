const http = require('http')
const express = require('express')
const { Server } = require('socket.io')
const { RoomManager } = require('./game/RoomManager')
const { createRound } = require('./game/rounds')
const { createMetrics } = require('./metrics')
const { registerSocketHandlers } = require('./sockets/handlers')

const realClock = { now: () => Date.now(), setTimeout: (fn, ms) => setTimeout(fn, ms), clearTimeout: (h) => clearTimeout(h) }

/**
 * Builds the HTTP + Socket.IO server. Everything external (dictionary, event bus, clock, rng)
 * is passed in, so tests can run the real server with a tiny dictionary and short rounds.
 */
function createGameServer({ config, dictionary, bus, logger, clock = realClock, rng = Math.random, createRoundFn = createRound }) {
  const app = express()
  app.disable('x-powered-by')
  const httpServer = http.createServer(app)
  const io = new Server(httpServer, {
    cors: { origin: config.corsOrigin === '*' ? true : config.corsOrigin.split(',') },
    pingInterval: 10000, pingTimeout: 10000, // detect dead connections within ~20s
  })

  const manager = new RoomManager({})
  const metrics = createMetrics(manager)
  manager.roomDeps = {
    config, dictionary, clock, rng, logger, metrics,
    createRound: createRoundFn,
    publish: (type, payload) => bus.publish(type, payload),
    transport: {
      broadcast: (code, event, data) => io.to(code).emit(event, data),
      sendTo: (socketId, event, data) => io.to(socketId).emit(event, data),
    },
  }

  app.get('/health', (req, res) => res.json({ status: 'ok', service: 'game-service', ...manager.stats(), eventBus: bus.connected ? 'up' : 'down' }))
  app.get('/metrics', async (req, res) => { res.set('Content-Type', metrics.registry.contentType); res.end(await metrics.registry.metrics()) })

  registerSocketHandlers(io, { manager, config, logger, metrics })
  return { app, httpServer, io, manager, metrics }
}

module.exports = { createGameServer }
