const User = require("../models/User")

exports.getModerationQueue = async function (req, res) {
  try {
    const modQueue = await User.getModerationQueue()

    res.json({
      success: true,
      message: "Moderation queue loaded",
      modQueue
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.approve = async function (req, res) {
  try {
    const approve = await User.moderationApprove(req.user._id, req.body.id)

    res.json({
      success: true,
      message: "Moderation queue item approved"
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.reject = async function (req, res) {
  try {
    const reject = await User.moderationReject(req.user._id, req.body.id)

    res.json({
      success: true,
      message: "Moderation queue item rejected"
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}
