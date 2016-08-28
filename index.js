#!/usr/bin/env node
const path = require('path')
const ffmpeg = require('./lib/ffmpeg.js')
const robot = require('robotjs')
const express = require('express')
const bodyParser = require('body-parser')
const app = express()
const os = require('os')
const interfaces = os.networkInterfaces()
const argv = require('minimist')(process.argv.slice(2))
const port = argv.p || process.env.PORT || 3000
const secret = argv.s
const mouseRatio = argv.r || 1
const ws = require('express-ws')(app)
let clients = []
let addresses = []
let width = argv.d && argv.d.split('x')[0] || 1000
let height = argv.d && argv.d.split('x')[1] || 562
let last = ''

for (var i in interfaces) {
  for (var i2 in interfaces[i]) {
    var address = interfaces[i][i2]
    if (address.family === 'IPv4' && !address.internal) {
      addresses.push(address.address)
    }
  }
}

const domain = addresses[0] + ':' + port

if (argv.h || !argv.s) {
  console.log(
		'Usage: \n' +
		'npm start [-- <args>]\n\n' +
    'Arguments: \n' +
    '-h: Access this menu. \n' +
    '-p [3000]: Change the host port. \n' +
    '-d [720x405]: Change the video dimensions. \n' +
    '-s [\'12345\']: Change the secret. \n' +
    '-r [1]: Ratio of rotation of phone to speed of mouse. \n' +
    '-i [false]: Invert the mouse movement (For computer control).'
	)
  process.exit()
}

app.use(express.static(path.join(__dirname, '/www/dist')))
app.use(bodyParser.urlencoded({ extended: true }))

app.post('/:secret/:width?/:height?/:image', (req, res) => {
  if (req.params.secret === secret) {
    width = req.params.width || 720
    height = req.params.height || 405

    let msg = 'Stream: ' +
      req.connection.remoteAddress + ':' +
      ' size: ' + width + 'x' + height

    if (msg !== last) {
      console.log(msg)
      last = msg
    }

    req.on('data', (data) => {
      ws.broadcast(data)
    })
  } else {
    let msg = 'Failed Stream Connection: ' +
    req.connection.remoteAddress +
    ' - incorrect secret'

    if (msg !== last) {
      console.log(msg)
      last = msg
    }
    res.end()
  }
})

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '/www/index.html'))
})

app.ws('/', (socket, req) => {
  clients.push(socket)

  let header = new Buffer(8)
  header.write('jsmp')
  header.writeUInt16BE(width, 4)
  header.writeUInt16BE(height, 6)
  socket.send(header, { binary: true })

  console.log('New WebSocket Connection')

  socket.on('message', (event) => {
    if (event === 'invertX') {
      argv.i = !argv.i
      return
    } else if (event === 'mouseClick') {
      return robot.mouseClick()
    } else if (event === 'rightClick') {
      return robot.mouseClick('right')
    } else if (event === 'recalibrate') {
      let screen = robot.getScreenSize()
      return robot.moveMouse(screen.width / 2, screen.height / 2)
    }
    let data = JSON.parse(event)
    let mouse = robot.getMousePos()
    let y = Math.round(data.gamma)
    let x = argv.i ? Math.round(data.alpha) : -Math.round(data.alpha)

    x *= mouseRatio
    y *= mouseRatio

    x += mouse.x
    y += mouse.y

    robot.setMouseDelay(10)
    robot.moveMouse(x, y)
  })

  socket.on('disconnect', () => {
    if (clients.indexOf(socket) > -1) clients.splice(clients.indexOf(socket), 1)
    console.log('Socket disconnected')
  })
})

ws.broadcast = function (data) {
  for (var i in clients) {
    if (clients[i].readyState === 1) {
      clients[i].send(data, {binary: true})
    }
  }
}

app.listen(port, () => {
  ffmpeg(process.platform, 'http://localhost:' + port + '/' + secret + '/' + width + '/' + height + '/image-%3d.jpg', height, width, (err, msg) => {
    if (err) {} else if (msg) {
      console.log(msg)
    }
  })

  console.log(' _________________________________')
  console.log('|                                 |')
  console.log('|  Turn on your phone and go to:  |')
  console.log('|  ' + domain + new Array(32 - domain.length).join(' ') + '|')
  console.log('|                                 |')
  console.log(' ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\n')

  console.log('Listening on port: ' + port)
})
