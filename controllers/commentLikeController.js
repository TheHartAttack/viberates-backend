const CommentLike = require("../models/CommentLike")

exports.handleCommentLike = async function (req, res) {
  try {
    let like = await CommentLike.get(req.user._id, req.params.comment)
    if (like) {
      const response = await CommentLike.delete(like)
      res.json({
        success: true,
        status: "likeDeleted",
        message: `You unliked this comment.`,
        commentLike: response
      })
    } else {
      like = new CommentLike({
        comment: req.params.comment,
        user: req.user._id
      })
      const response = await like.register()
      res.json({
        success: true,
        status: "likeCreated",
        message: `You liked this comment.`,
        commentLike: response
      })
    }
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}
