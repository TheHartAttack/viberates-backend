const Album = require("../models/Album")
const Artist = require("../models/Artist")
const upload = require("../upload")
const singleUpload = upload.single("image")

exports.addAlbum = async function (req, res) {
  try {
    let album = new Album(req.body)
    let response = await album.register(req.user, req.params.artist)

    res.json({
      success: true,
      message: `${response.title} has been added to the database.`,
      album: response
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.editAlbum = async function (req, res) {
  try {
    let album = new Album(req.body)
    let targetAlbum = await Album.getBySlug(req.params.artist, req.params.album)
    let response = await album.edit(req.user, targetAlbum)

    res.json({
      success: true,
      message: `${response.title} has been updated.`,
      album: response
    })
  } catch (e) {
    res.json(e)
  }
}

exports.uploadImage = function (req, res, next) {
  req.header.filePath = "album"
  req.header.ratio = 1
  singleUpload(req, res, async function () {
    if (req.file) {
      req.body.image = req.file.transforms[0].location
    }
    next()
  })
}

exports.getAlbumBySlug = async function (req, res) {
  try {
    let album = await Album.getBySlug(req.params.artist, req.params.album)

    res.json({
      success: true,
      message: "Album data successfully retrieved from database.",
      album
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getAlbumById = async function (req, res) {
  try {
    let album = await Album.getById(req.params.album)
    res.json({
      success: true,
      message: "Album data successfully retrieved from database.",
      album
    })
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getAlbumsByTag = async function (req, res) {
  try {
    const results = await Album.getByTagSlug(req.params.tagSlug, req.body.option, req.body.offset, 24)

    res.json({
      success: true,
      message: "Tagged albums loaded",
      tag: results.tag,
      albums: results.albums,
      morealbums: results.moreAlbums
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}

exports.getAlbumEditHistory = async function (req, res) {
  try {
    const [album, editHistory] = await Promise.all([Album.getBySlug(req.params.artist, req.params.album), Album.getEditHistory(req.params.album, req.body.offset, 12)])

    res.json({
      success: true,
      message: "Successfully retrieved edit history data",
      album: album,
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
    const revertEdit = await Album.revert(req.body.editId, req.user)

    res.json(revertEdit)
  } catch (e) {
    res.json({
      success: false,
      message: e
    })
  }
}
