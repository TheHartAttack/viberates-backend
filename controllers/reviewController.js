const Album = require("../models/Album")
const Review = require("../models/Review")

exports.addReview = async function (req, res) {
  try {
    let review = new Review(req.body)
    let response = await review.register(req.user, req.params.artist, req.params.album)

    res.json({
      success: true,
      message: `Successfully posted review of ${response.title}.`,
      review: response
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.editReview = async function (req, res) {
  try {
    let review = new Review(req.body)
    const response = await review.edit(req.review)

    res.json({
      success: true,
      message: `Your review of ${req.review.album.title} has been updated.`,
      review: response
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getReviewById = async function (req, res) {
  try {
    let [review, album] = await Promise.all([Review.getById(req.params.review, true), Album.getBySlug(req.params.artist, req.params.album)])
    review.album = album

    res.json({
      success: true,
      message: "Retrieved review data.",
      review
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.isUserAuthor = async function (req, res, next) {
  try {
    const review = await Review.getById(req.params.review)

    if (review.author._id == req.user._id) {
      req.review = review
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
