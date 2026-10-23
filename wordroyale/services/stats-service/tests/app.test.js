const request = require('supertest')
const jwt = require('jsonwebtoken')
const { createApp } = require('../src/app')
const repo = require('../src/repo')
const { makeDb, gameEvent, silent } = require('./helpers')

const config = { jwtSecret: 'test-secret', corsOrigin: '*' }
const token = (sub, guest = false) => jwt.sign({ sub, username: sub, guest }, 'test-secret', { expiresIn: '1h' })
let app, db
beforeEach(async () => {
  db = await makeDb()
  app = createApp({ db, config, logger: silent })
  await repo.storeGame(db, gameEvent({ players: [{ playerId: 'u1', username: 'ann', totalScore: 100, bestWord: 'cares', bestWordPoints: 9 }, { playerId: 'u2', username: 'bob', totalScore: 50 }] }))
})

describe('stats API', () => {
  it('GET /api/stats/leaderboard (public)', async () => {
    const res = await request(app).get('/api/stats/leaderboard?range=weekly')
    expect(res.status).toBe(200)
    expect(res.body.range).toBe('weekly')
    expect(res.body.entries[0]).toMatchObject({ rank: 1, username: 'ann', wins: 1, bestWord: 'cares' })
  })
  it('falls back to "today" for an unknown range', async () => {
    expect((await request(app).get('/api/stats/leaderboard?range=bogus')).body.range).toBe('today')
  })
  it('GET /api/stats/me needs a valid token', async () => {
    expect((await request(app).get('/api/stats/me')).status).toBe(401)
    expect((await request(app).get('/api/stats/me').set('Authorization', 'Bearer nope')).status).toBe(401)
    const ok = await request(app).get('/api/stats/me').set('Authorization', `Bearer ${token('u1')}`)
    expect(ok.status).toBe(200)
    expect(ok.body.summary).toMatchObject({ games: 1, wins: 1, totalScore: 100 })
    expect(ok.body.history).toHaveLength(1)
  })
  it('guests get a clear 403 on /me', async () => {
    const res = await request(app).get('/api/stats/me').set('Authorization', `Bearer ${token('guest:1', true)}`)
    expect(res.status).toBe(403)
  })
  it('GET /api/stats/summary, /health, /metrics', async () => {
    expect((await request(app).get('/api/stats/summary')).body).toEqual({ gamesTotal: 1, gamesToday: 1, players: 2 })
    expect((await request(app).get('/health')).body.status).toBe('ok')
    expect((await request(app).get('/metrics')).text).toContain('http_request_duration_seconds')
  })
})
