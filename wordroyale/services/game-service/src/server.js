const { load } = require('./config')
const makeLogger = require('./logger')
const { loadDictionary } = require('./dictionary')
const { RedisEventBus } = require('./events/bus')
const { createGameServer } = require('./createGameServer')

function main() {
  const config = load()
  const logger = makeLogger(config.logLevel)
  const dictionary = loadDictionary(config.dictionaryPath)
  logger.info({ words: dictionary.size }, 'dictionary loaded')

  // metrics object is created inside createGameServer; the bus is given it afterwards
  const bus = new RedisEventBus({ url: config.redisUrl, stream: config.gameEventsStream, logger })
  const { httpServer, io, metrics } = createGameServer({ config, dictionary, bus, logger })
  bus.metrics = metrics

  httpServer.listen(config.port, () => logger.info({ port: config.port, rounds: config.roundDurationsMs }, 'game-service listening'))
  const shutdown = async () => {
    logger.info('shutting down')
    io.close()
    await bus.close()
    process.exit(0)
  }
  process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown)
}
main()
