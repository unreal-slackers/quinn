import { Listener } from 'hiei.js'
import log from '../utilities/logger.js'

class ClientError extends Listener {
  constructor () {
    super({
      name: 'ClientError',
      emitter: 'client',
      event: 'error'
    })
  }

  run (error) {
    return log.error({ event: 'client-error', error: error.name, code: error.code, message: error.message, cause: error.cause, stack: error.stack })
  }
}

export default ClientError
