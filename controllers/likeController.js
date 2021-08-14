const Like = require("../models/Like")

exports.handleLike = async function (req, res) {
  try {
    let like = await Like.get(req.user._id, req.params.review)
    if (like) {
      const response = await Like.delete(like)
      res.json({
        success: true,
        status: "likeDeleted",
        message: `You unliked this review.`,
        like: response
      })
    } else {
      like = new Like({
        review: req.params.review,
        author: req.params.author,
        user: req.user._id
      })
      const response = await like.register()
      res.json({
        success: true,
        status: "likeCreated",
        message: `You liked this review.`,
        like: response
      })
    }
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}
