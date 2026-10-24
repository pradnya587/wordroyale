const pino = require('pino')
module.exports = (level = 'info') => pino({ level, base: { service: 'game-service' }, timestamp: pino.stdTimeFunctions.isoTime })
