const User = require("../models/User")
const Album = require("../models/Album")
const Artist = require("../models/Artist")

exports.search = async function (req, res) {
  try {
    const [artists, albums, users] = await Promise.all([Artist.search(req.body.searchTerm), Album.search(req.body.searchTerm), User.search(req.body.searchTerm)])

    res.json({
      success: true,
      message: "Successfully retrieved search results.",
      artists,
      albums,
      users
    })
  } catch (e) {
    console.log(e)
    res.json({
      success: false,
      message: e
    })
  }
}
