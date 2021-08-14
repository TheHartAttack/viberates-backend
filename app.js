const express = require("express")
const app = express()
const jwt = require("jsonwebtoken")
const Chat = require("./models/Chat")

app.use(express.urlencoded({extended: false}))
app.use(express.json())

app.use("/", require("./router"))

const server = require("http").createServer(app)
const io = require("socket.io")(server, {
  pingTimeout: 30000,
  cors: true
})

io.on("connection", function (socket) {
  socket.on("chatFromBrowser", async function (data) {
    try {
      const user = jwt.verify(data.token, process.env.JWTSECRET)
      const chat = new Chat({body: data.message})
      const response = await chat.register(user)

      socket.broadcast.emit("chatFromServer", response)
    } catch (e) {
      console.log(e)
    }
  })
})

module.exports = server
