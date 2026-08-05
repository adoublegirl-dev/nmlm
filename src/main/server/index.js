// 本地 Web 服务：托管渲染层 dist + /api/call 统一入口 + /shots 截图静态。
// token 校验：本机请求放行，局域网请求需 token。
const express = require('express')
const os = require('os')
const path = require('path')
const ipc = require('../ipc')
const settings = require('../services/settings')
const evidence = require('../services/evidence')

function localIPs() {
  const nets = os.networkInterfaces()
  const out = []
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) out.push(net.address)
    }
  }
  return out
}

function isLocalRequest(req) {
  const ip = req.ip || req.socket.remoteAddress || ''
  return ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1'
}

// 端口自动递增，避免占用即失败
function listen(app, port, cb) {
  let p = port
  const tryListen = () => {
    const server = app.listen(p, () => {
      cb(server, p)
    })
    server.on('error', (err) => {
      if (err.code === 'EADDRINUSE' && p < port + 10) {
        p += 1
        tryListen()
      } else {
        console.error('[server] 启动失败:', err.message)
        cb(null, p)
      }
    })
  }
  tryListen()
}

function createServer(port) {
  const app = express()
  const dist = path.join(__dirname, '../../../dist')

  app.use(express.json({ limit: '1mb' }))

  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) {
      if (isLocalRequest(req)) return next()
      const token = req.query.token || req.headers['x-token']
      if (token && token === settings.get('server.token')) return next()
      return res.status(401).json({ ok: false, error: 'unauthorized' })
    }
    next()
  })

  app.post('/api/call', async (req, res) => {
    const { channel, args } = req.body || {}
    if (!channel) return res.status(400).json({ ok: false, error: 'missing channel' })
    const result = await ipc.call(channel, args || {})
    res.json(result)
  })

  // 截图静态目录
  app.use('/shots', express.static(evidence.screenshotsDir()))

  // 根路径重定向到主面板（多入口构建无 index.html）
  app.get('/', (req, res) => res.redirect('/panel.html'))
  app.use(express.static(dist))

  return new Promise((resolve) => {
    listen(app, port, (server, actualPort) => {
      resolve({ server, actualPort })
    })
  })
}

module.exports = { createServer, localIPs }
