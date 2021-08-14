const User = require("../models/User")
const Album = require("../models/Album")
const Review = require("../models/Review")
const jwt = require("jsonwebtoken")
const slugify = require("slugify")
const upload = require("../upload")
const singleUpload = upload.single("image")
const tagsCollection = require("../db").db().collection("tags")

const tokenLasts = "365d"

exports.checkToken = function (req, res) {
  try {
    req.apiUser = jwt.verify(req.body.token, process.env.JWTSECRET)
    res.json(true)
  } catch (e) {
    res.json(false)
  }
}

exports.register = function (req, res) {
  let user = new User(req.body)
  user
    .register()
    .then(() => {
      res.json({
        success: true,
        message: "Account created!",
        token: jwt.sign(
          {
            _id: user.data._id,
            username: user.data.username,
            slug: user.data.slug,
            email: user.data.email,
            type: user.data.type,
            image: user.data.image
          },
          process.env.JWTSECRET,
          {expiresIn: tokenLasts}
        ),
        username: user.data.username,
        suspended: user.data.suspended,
        type: user.data.type,
        _id: user.data._id.toString(),
        slug: user.data.slug,
        email: user.data.email,
        image: user.data.image
      })
    })
    .catch(e => {
      console.log(e)
      res.json({
        success: false,
        message: e[0]
      })
    })
}

exports.login = function (req, res) {
  let user = new User(req.body)
  user
    .login()
    .then(() => {
      res.json({
        success: true,
        message: "Logged in.",
        user: {
          token: jwt.sign(
            {
              _id: user.data._id,
              username: user.data.username,
              slug: user.data.slug,
              email: user.data.email,
              type: user.data.type,
              image: user.data.image
            },
            process.env.JWTSECRET,
            {expiresIn: tokenLasts}
          ),
          username: user.data.username,
          suspended: user.data.suspended,
          type: user.data.type,
          _id: user.data._id.toString(),
          slug: user.data.slug,
          email: user.data.email,
          image: user.data.image
        }
      })
    })
    .catch(e => {
      res.json({
        success: false,
        message: e
      })
    })
}

exports.isLoggedIn = function (req, res, next) {
  try {
    let token
    if (req.headers.authorization) {
      token = req.headers.authorization
    } else {
      token = req.body.token
    }
    req.user = jwt.verify(token, process.env.JWTSECRET)
    next()
  } catch (e) {
    res.json({
      success: false,
      message: "You must be logged in to perform that action."
    })
  }
}

exports.isAdmin = async function (req, res, next) {
  try {
    const user = await User.getById(req.user._id)
    if (user.type.includes("admin")) {
      next()
    } else {
      res.json({
        success: false,
        message: "You must be an admin to perform that action."
      })
    }
  } catch (e) {
    console.log(e)
  }
}

exports.isAdminOrMod = async function (req, res, next) {
  try {
    const user = await User.getById(req.user._id)
    if (user.type.includes("admin") || user.type.includes("mod")) {
      next()
    } else {
      res.json({
        success: false,
        message: "You must be an admin or mod to perform that action."
      })
    }
  } catch (e) {
    console.log(e)
  }
}

exports.targetNotAdmin = async function (req, res, next) {
  try {
    const user = await User.getBySlug(req.params.userSlug)
    if (!user.type.includes("admin")) {
      next()
    } else {
      res.json({
        status: "failed",
        message: "You cannot perform that action."
      })
    }
  } catch (e) {
    console.log(e)
  }
}

exports.targetNotUser = function (req, res, next) {
  try {
    if (req.user.slug != req.params.userSlug) {
      next()
    } else {
      res.json({
        status: "failed",
        message: "You cannot perform that action."
      })
    }
  } catch (e) {
    console.log(e)
  }
}

exports.isTargetUser = async function (req, res, next) {
  try {
    if (req.user._id == req.params.userId) {
      next()
    } else {
      res.json({
        success: false,
        message: "You do not have permission to perform that action."
      })
    }
  } catch (e) {
    console.log(e)
  }
}

exports.isNotSuspended = async function (req, res, next) {
  const user = await User.getById(req.user._id, true)
  if (!user.suspended) {
    next()
  } else {
    res.json({
      success: false,
      message: "This account is suspended from adding/editing data."
    })
  }
}

exports.getUserBySlug = async function (req, res) {
  try {
    let user = await User.getBySlug(req.params.userSlug, true)
    res.json({
      success: true,
      message: "Retrieved user data.",
      user
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.doesUsernameExist = function (req, res) {
  User.doesSlugExist(
    slugify(req.body.username, {
      lower: true,
      strict: true
    })
  )
    .then(function () {
      res.json(true)
    })
    .catch(function (e) {
      res.json(false)
    })
}

exports.doesEmailExist = async function (req, res) {
  let emailBool = await User.doesEmailExist(req.body.email)
  res.json(emailBool)
}

exports.handleMod = async function (req, res) {
  try {
    const user = await User.getBySlug(req.params.userSlug)

    if (user.type.includes("mod")) {
      await User.demoteMod(user)
      res.json({
        success: true,
        status: "unmodded",
        message: `${user.username} is no longer a moderator.`
      })
    } else {
      await User.promoteMod(user)
      res.json({
        success: true,
        status: "modded",
        message: `${user.username} is now a moderator.`
      })
    }
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.handleSuspend = async function (req, res) {
  try {
    const user = await User.getBySlug(req.params.userSlug)

    if (user.suspended) {
      await User.unsuspend(user)
      res.json({
        success: true,
        status: "unsuspended",
        message: `${user.username} is no longer suspended.`
      })
    } else {
      await User.suspend(user)
      res.json({
        success: true,
        status: "suspended",
        message: `${user.username} is now suspended.`
      })
    }
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.uploadImage = function (req, res) {
  req.header.filePath = "user"
  req.header.ratio = 1
  singleUpload(req, res, async function () {
    if (req.file) {
      try {
        const imageUrl = req.file.transforms[0].location
        await User.updateImage(req.user._id, imageUrl)

        res.json({
          success: true,
          message: "Image uploaded.",
          image: imageUrl
        })
      } catch (e) {
        console.log(e)
        res.json({
          success: false,
          message: e
        })
      }
    } else {
      res.json({
        success: false,
        message: "Server error."
      })
    }
  })
}

exports.deleteImage = async function (req, res) {
  try {
    await User.deleteImage(req.user._id)
    res.json({
      success: true
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.changePassword = async function (req, res) {
  try {
    await User.changePassword(req.params.userId, req.body)
    res.json({
      success: true,
      message: "Password updated."
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.resetPassword = async function (req, res) {
  try {
    await User.resetPassword(req.body.email)
    res.json({
      success: true,
      message: "Password reset - please check your email for your new password."
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.loadMoreReviews = async function (req, res) {
  try {
    const data = await User.loadMoreReviews(req.params.userId, req.body.offset)
    res.json({
      success: true,
      message: "",
      reviews: data.reviews,
      moreReviews: data.moreReviews
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getHome = async function (req, res) {
  try {
    const [hotAlbums, topRated, newReleases, recentReviews, topUsers] = await Promise.all([Album.getHotAlbums(90, 0, 24), Album.getTopRated(Infinity, 0, 24), Album.getNewReleases(0, 24), Review.getRecent(0, 12), User.getTopUsers(0, 6)])

    res.json({
      success: true,
      hotAlbums,
      topRated,
      newReleases,
      recentReviews,
      topUsers
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getHotAlbums = async function (req, res) {
  try {
    let hotAlbums = await Album.getHotAlbums(req.body.option, req.body.offset, 24)

    res.json({
      success: true,
      message: "Hot albums loaded",
      albums: hotAlbums.albums,
      moreAlbums: hotAlbums.moreAlbums
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getTopRated = async function (req, res) {
  try {
    const topRated = await Album.getTopRated(req.body.option, req.body.offset, 24)

    res.json({
      success: true,
      message: "Top rated loaded",
      albums: topRated.albums,
      moreAlbums: topRated.moreAlbums
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getNewReleases = async function (req, res) {
  try {
    const newReleases = await Album.getNewReleases(req.body.offset, 24)

    res.json({
      success: true,
      message: "Top rated loaded",
      albums: newReleases.albums,
      moreAlbums: newReleases.moreAlbums
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getTopUsers = async function (req, res) {
  try {
    const topUsers = await User.getTopUsers(req.body.offset, 24)

    res.json({
      success: true,
      message: "Top users loaded.",
      users: topUsers.users,
      moreUsers: topUsers.moreUsers
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getTag = async function (req, res, next) {
  try {
    req.tag = await tagsCollection.findOne({slug: req.params.tagSlug})

    next()
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getRecentReviews = async function (req, res) {
  try {
    const data = await Review.getRecent(req.body.offset, 12)

    res.json({
      success: true,
      message: "Retrieved review data.",
      reviews: data.reviews,
      moreReviews: data.moreReviews
    })
  } catch (e) {
    reject({
      success: false,
      message: e
    })
  }
}

exports.contact = async function (req, res) {
  try {
    const contact = await User.contactAdmin(req.body)

    res.json({
      success: true,
      message: "Message sent."
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}
