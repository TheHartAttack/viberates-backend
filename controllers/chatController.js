const Chat = require("../models/Chat")

exports.loadChat = async function (req, res) {
  try {
    const chat = await Chat.load(req.body.offset, 24)

    res.json({
      success: true,
      message: "Chat messages loaded.",
      messages: chat.messages,
      moreMessages: chat.moreMessages
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}
