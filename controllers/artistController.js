const Artist = require("../models/Artist")
const upload = require("../upload")
const singleUpload = upload.single("image")

exports.addArtist = async function (req, res) {
  try {
    let artist = new Artist(req.body)
    let response = await artist.register(req.user)

    res.json({
      success: true,
      message: `${response.name} has been added to the database.`,
      artist: response
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.editArtist = async function (req, res) {
  try {
    let artist = new Artist(req.body)
    let targetArtist = await Artist.getBySlug(req.params.artist)
    let response = await artist.edit(req.user, targetArtist)

    res.json({
      success: true,
      message: `${response.name} has been updated.`,
      artist: response
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.uploadImage = function (req, res, next) {
  req.header.filePath = "artist"
  req.header.ratio = 1.5
  singleUpload(req, res, async function () {
    if (req.file) {
      req.body.image = req.file.transforms[0].location
    }
    next()
  })
}

exports.getArtistBySlug = async function (req, res) {
  try {
    const artist = await Artist.getBySlug(req.params.artist)

    res.json({
      success: true,
      message: "Successfully loaded artist data.",
      artist
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getArtistById = async function (req, res) {
  try {
    let artist = await Artist.getById(req.params.artist)

    res.json({
      success: true,
      message: "Successfully loaded artist data.",
      artist
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getArtistEditHistory = async function (req, res) {
  try {
    const [artist, editHistory] = await Promise.all([Artist.getBySlug(req.params.artist), Artist.getEditHistory(req.params.artist, req.body.offset, 12)])

    res.json({
      success: true,
      message: "Successfully retrieved edit history data",
      artist: artist,
      editHistory: editHistory.edits,
      moreResults: editHistory.moreResults
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.revertEdit = async function (req, res) {
  try {
    const revertEdit = await Artist.revert(req.body.editId, req.user)

    res.json(revertEdit)
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}
