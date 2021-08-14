const Comment = require("../models/Comment")

exports.addComment = async function (req, res) {
  try {
    let comment = new Comment(req.body)
    let response = await comment.register(req.user, req.params.review)
    res.json(response)
  } catch (e) {
    res.json({
      success: false,
      message: e[0]
    })
  }
}

exports.editComment = async function (req, res) {
  try {
    let comment = new Comment(req.body)
    let response = await comment.edit(req.comment)
    res.json(response)
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e[0]
    })
  }
}

exports.isUserAuthor = async function (req, res, next) {
  try {
    const comment = await Comment.getById(req.params.comment)
    if (comment.author == req.user._id) {
      req.comment = comment
      next()
    } else {
      res.json({
        success: false,
        message: "You do not have permission to perform that action."
      })
    }
  } catch (e) {
    res.json({
      success: false,
      message: "You do not have permission to perform that action."
    })
  }
}
