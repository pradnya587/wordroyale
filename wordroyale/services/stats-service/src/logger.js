const pino = require('pino')
module.exports = (level = 'info') => pino({ level, base: { service: 'stats-service' }, timestamp: pino.stdTimeFunctions.isoTime })
