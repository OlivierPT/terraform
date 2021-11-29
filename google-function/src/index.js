const fastify = require('fastify')
const app = fastify({ logger: true })

app.get('/', async (req, res) => {
  return { works: true }
})

exports.app = async (req, res) => {
  await app.ready()
  app.server.emit('request', req, res)
}