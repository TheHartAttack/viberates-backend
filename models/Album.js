const albumsCollection = require("../db").db().collection("albums")
const artistsCollection = require("../db").db().collection("artists")
const tagsCollection = require("../db").db().collection("tags")
const albumEditsCollection = require("../db").db().collection("albumEdits")
const slugify = require("slugify")
const lodash = require("lodash")
const ObjectID = require("mongodb").ObjectID
const Artist = require("./Artist")
const User = require("./User")
const {trimEnd} = require("lodash")

let Album = function (data) {
  this.data = data
  this.errors = []
}

Album.prototype.cleanUp = function () {
  if (typeof this.data.title != "string") {
    this.data.name = ""
  }

  if (typeof this.data.image != "string") {
    this.data.image = ""
  }

  if (typeof this.data.label != "string") {
    this.data.label = ""
  }

  if (typeof this.data.type != "string") {
    this.data.type = ""
  }

  if (typeof this.data.releaseDate != "string") {
    this.data.releaseDate = null
  }

  this.data.tracklist = JSON.parse(this.data.tracklist)
  if (!Array.isArray(this.data.tracklist)) {
    this.data.tracklist = []
  }

  //Get rid of any bogus properties
  this.data = {
    title: this.data.title.trim(),
    slug: slugify(this.data.title, {
      lower: true,
      strict: true
    }),
    image: this.data.image,
    releaseDate: new Date(this.data.releaseDate),
    type: this.data.type,
    label: this.data.label,
    tracklist: this.data.tracklist,
    deleted: false
  }
}

Album.prototype.validate = function () {
  //Validate title
  if (this.data.title == "") {
    this.errors.push("You must provide an album title.")
  }
  if (this.data.title.length > 256) {
    this.errors.push("Album title cannot exceed 256 characters.")
  }

  //Validate label
  if (this.data.label.length > 256) {
    this.errors.push("Album label cannot exceed 256 characters.")
  }

  //Validate type
  const validTypes = ["Studio", "EP", "Live", "Compilation"]
  if (!validTypes.includes(this.data.type) || this.data.type == "") {
    this.errors.push("Invalid album type.")
  }

  //Validate tracklist
  this.data.tracklist.map(track => {
    if (typeof track != "string") {
      this.errors.push("Invalid tracklist.")
    }
  })
}

Album.prototype.register = function (user, artistSlug) {
  return new Promise(async (resolve, reject) => {
    try {
      //Clean up and validate album data
      this.cleanUp()
      this.validate()

      //Resolve with album ID string if it already exists
      let artist = await artistsCollection.findOne({slug: artistSlug})
      this.data.artist = new ObjectID(artist._id)

      let albumExists = await albumsCollection.findOne({slug: this.data.slug, artist: new ObjectID(artist._id)})
      if (albumExists) {
        const response = {
          success: false,
          message: `The database already contains an album by ${artist.name} called ${albumExists.title}.`,
          album: this.data
        }
        resolve(response)
        return
      }

      //Only if there are no validation errors add new album to database
      if (!this.errors.length) {
        //Add new album data to database
        const result = await albumsCollection.insertOne(this.data)
        this.data._id = result.insertedId.toString()

        //Create moderation object and add to database
        const editObject = {
          target: new ObjectID(this.data._id),
          date: new Date(),
          user: new ObjectID(user._id),
          initial: true,
          deleted: false,
          data: {
            title: this.data.title,
            releaseDate: this.data.releaseDate,
            label: this.data.label,
            type: this.data.type,
            image: this.data.image,
            tracklist: this.data.tracklist
          }
        }

        await albumEditsCollection.insertOne(editObject)

        resolve({
          success: true,
          message: `${this.data.title} has been added to the database.`,
          album: this.data
        })
      } else {
        reject(this.errors[0])
      }
    } catch (e) {
      this.errors.push(e)
      reject(this.errors)
    }
  })
}

Album.prototype.edit = async function (user, targetAlbum) {
  return new Promise(async (resolve, reject) => {
    try {
      //Clean up and validate album data
      this.cleanUp()
      this.validate()

      //Check that edit data is different from existing database data
      if (targetAlbum.title == this.data.title && targetAlbum.image == this.data.image && targetAlbum.label == this.data.label && targetAlbum.type == this.data.type && targetAlbum.releaseDate.getDate() == this.data.releaseDate.getDate() && targetAlbum.releaseDate.getMonth() == this.data.releaseDate.getMonth() && targetAlbum.releaseDate.getFullYear() == this.data.releaseDate.getFullYear() && lodash.isEqual(targetAlbum.tracklist, this.data.tracklist)) {
        resolve({
          data: targetAlbum,
          changes: false
        })
        return
      }

      //Check that album title is not a duplicate
      let albumExists = await albumsCollection.findOne({slug: this.data.slug, artist: new ObjectID(targetAlbum.artist._id)})
      if (albumExists) {
        resolve({
          success: false,
          message: `The database already contains an album by ${targetAlbum.artist.name} called ${albumExists.title}.`,
          album: this.data
        })
        return
      }

      //Update database
      if (!this.errors.length) {
        //Create edit object
        const editObject = {
          target: targetAlbum._id,
          date: new Date(),
          user: new ObjectID(user._id),
          initial: false,
          deleted: false,
          data: {
            title: this.data.title,
            releaseDate: this.data.releaseDate,
            label: this.data.label,
            type: this.data.type,
            image: this.data.image,
            tracklist: this.data.tracklist
          }
        }

        await Promise.all([albumsCollection.updateOne({_id: targetAlbum._id}, {$set: this.data}), albumEditsCollection.insertOne(editObject)])

        resolve({
          success: true,
          message: `${this.data.title} has been updated.`,
          album: this.data,
          date: editObject.date,
          changes: true
        })
      } else {
        reject(this.errors)
      }
    } catch (e) {
      this.errors.push(e)
      reject(this.errors)
    }
  })
}

Album.reusableAlbumQuery = function (uniqueOperations) {
  return new Promise(async (resolve, reject) => {
    try {
      let aggOperations = uniqueOperations.concat([
        {
          $match: {
            deleted: false
          }
        },

        {
          $lookup: {
            from: "artists",
            localField: "artist",
            foreignField: "_id",
            as: "artist"
          }
        },

        {$unwind: "$artist"},

        {
          $lookup: {
            from: "reviews",
            let: {album: "$_id"},
            pipeline: [
              {$match: {$expr: {$eq: ["$album", "$$album"]}}},
              {
                $lookup: {
                  from: "users",
                  let: {user: "$author"},
                  pipeline: [
                    {$match: {$expr: {$eq: ["$_id", "$$user"]}}},
                    {
                      $project: {
                        _id: true,
                        username: true,
                        slug: true
                      }
                    }
                  ],
                  as: "author"
                }
              },
              {
                $project: {
                  title: true,
                  summary: true,
                  body: true,
                  rating: true,
                  date: true,
                  tags: true,
                  author: {$arrayElemAt: ["$author", 0]}
                }
              },
              {$sort: {date: -1}}
            ],
            as: "reviews"
          }
        },

        {
          $lookup: {
            from: "reviews",
            let: {album: "$_id"},
            pipeline: [
              {$match: {$expr: {$eq: ["$album", "$$album"]}}},
              {$unwind: "$tags"},
              {
                $group: {
                  _id: "$tags",
                  count: {$sum: 1}
                }
              },
              {$sort: {count: -1, _id: 1}},
              {$limit: 3}
            ],
            as: "tagCounts"
          }
        },

        {
          $project: {
            title: true,
            slug: true,
            type: true,
            releaseDate: true,
            type: true,
            tracklist: true,
            // tracklist: {$ifNull: ["$tracklist", []]},
            label: true,
            image: true,
            artist: true,
            reviews: true,
            rating: {$trunc: [{$avg: "$reviews.rating"}, 1]},
            tags: {
              $map: {
                input: "$tagCounts",
                as: "tag",
                in: "$$tag._id"
              }
            }
          }
        },

        {
          $lookup: {
            from: "tags",
            localField: "tags",
            foreignField: "_id",
            as: "tags"
          }
        },

        {$sort: {releaseDate: -1}}
      ])
      const albums = await albumsCollection.aggregate(aggOperations).toArray()

      if (albums) {
        resolve(albums)
      } else {
        throw new Error("Server error.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getBySlug = function (artistSlug, albumSlug) {
  return new Promise(async function (resolve, reject) {
    try {
      if (typeof albumSlug != "string") {
        reject("Invalid album slug.")
        return
      }

      let artist = await Artist.reusableArtistQuery([{$match: {slug: artistSlug}}])

      if (!artist) {
        reject("Artist not found.")
      }

      let [album] = await Album.reusableAlbumQuery([{$match: {slug: albumSlug, artist: new ObjectID(artist._id)}}])

      if (album) {
        album.artist = artist
        resolve(album)
      } else {
        throw new Error("Album not found.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getById = function (albumId) {
  return new Promise(async function (resolve, reject) {
    try {
      if (typeof albumId != "string" || !ObjectID.isValid(albumId)) {
        reject("Invalid album ID.")
        return
      }

      let [album] = await Album.reusableAlbumQuery([{$match: {_id: new ObjectID(albumId)}}])

      if (album) {
        resolve(album)
      } else {
        throw new Error("Artist not found.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getHotAlbums = function (numberOfDays, offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    try {
      let albums = await albumsCollection
        .aggregate([
          {$match: {deleted: false}},

          {
            $lookup: {
              from: "artists",
              foreignField: "_id",
              localField: "artist",
              as: "artist"
            }
          },

          {
            $unwind: "$artist"
          },

          {
            $lookup: {
              from: "reviews",
              foreignField: "album",
              localField: "_id",
              as: "allReviews"
            }
          },

          {
            $lookup: {
              from: "reviews",
              let: {album: "$_id"},
              pipeline: [
                {
                  $match: {
                    $expr: {$eq: ["$album", "$$album"]},
                    date: {
                      $gt: new Date(Date.now() - 1000 * 60 * 60 * 24 * numberOfDays),
                      $lt: new Date()
                    }
                  }
                }
              ],
              as: "reviews"
            }
          },

          {
            $project: {
              title: true,
              slug: true,
              type: true,
              releaseDate: true,
              tracklist: true,
              image: true,
              artist: "$artist",
              reviews: {$size: "$reviews"},
              rating: {$trunc: [{$avg: "$allReviews.rating"}, 1]}
            }
          },

          {$match: {reviews: {$gt: 0}}},
          {$sort: {reviews: -1, releaseDate: -1}},
          {$skip: offset},
          {$limit: resultCount + 1}
        ])
        .toArray()

      //Check if more albums
      let moreAlbums
      if (albums.length > resultCount) {
        moreAlbums = true
        albums.pop()
      } else {
        moreAlbums = false
      }

      if (albums) {
        resolve({
          albums,
          moreAlbums
        })
      } else {
        throw new Error("No albums found.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getTopRated = function (type, option, offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    try {
      let prefixOps = [{$match: {deleted: false}}]

      if (type == "year") {
        prefixOps.push({
          $match: {
            releaseDate: {
              $gte: new Date(Number(option), 0, 1),
              $lt: new Date(Number(option) + 1, 0, 1)
            }
          }
        })
      } else if (type == "decade") {
        prefixOps.push({
          $match: {
            releaseDate: {
              $gte: new Date(Number(option), 0, 1),
              $lt: new Date(Number(option) + 10, 0, 1)
            }
          }
        })
      }

      let aggOps = [
        {
          $lookup: {
            from: "artists",
            localField: "artist",
            foreignField: "_id",
            as: "artist"
          }
        },

        {
          $unwind: "$artist"
        },

        {
          $lookup: {
            from: "reviews",
            localField: "_id",
            foreignField: "album",
            as: "reviews"
          }
        },

        {
          $project: {
            title: true,
            slug: true,
            type: true,
            releaseDate: true,
            tracklist: true,
            image: true,
            artist: "$artist",
            rating: {$trunc: [{$avg: "$reviews.rating"}, 1]},
            reviewCount: {$size: "$reviews"}
          }
        },

        {$sort: {rating: -1, reviewCount: -1, releaseDate: -1}},
        {$skip: offset},
        {$limit: resultCount + 1}
      ]

      let albums = await albumsCollection.aggregate(prefixOps.concat(aggOps)).toArray()

      //Check if more albums
      let moreAlbums
      if (albums.length > resultCount) {
        moreAlbums = true
        albums.pop()
      } else {
        moreAlbums = false
      }

      if (albums) {
        resolve({
          albums,
          moreAlbums
        })
      } else {
        throw new Error("No albums found.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getNewReleases = function (offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    try {
      let albums = await albumsCollection
        .aggregate([
          {$match: {deleted: false}},
          {$match: {releaseDate: {$lte: new Date(Date.now())}}},
          {$sort: {releaseDate: -1}},
          {$skip: offset},
          {$limit: resultCount + 1},

          {
            $lookup: {
              from: "artists",
              localField: "artist",
              foreignField: "_id",
              as: "artist"
            }
          },

          {
            $unwind: "$artist"
          },

          {
            $lookup: {
              from: "reviews",
              localField: "_id",
              foreignField: "album",
              as: "reviews"
            }
          },

          {
            $project: {
              title: true,
              slug: true,
              type: true,
              releaseDate: true,
              tracklist: true,
              image: true,
              artist: "$artist",
              rating: {$trunc: [{$avg: "$reviews.rating"}, 1]}
            }
          }
        ])
        .toArray()

      //Check if more albums
      let moreAlbums
      if (albums.length > resultCount) {
        moreAlbums = true
        albums.pop()
      } else {
        moreAlbums = false
      }

      if (albums) {
        resolve({
          albums,
          moreAlbums
        })
      } else {
        throw new Error("No albums found.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getByTagSlug = function (tagSlug, option, offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    try {
      if (typeof tagSlug != "string") {
        reject()
        return
      }

      let sortOps = []
      if (option == "new") {
        sortOps = [{$sort: {releaseDate: -1}}, {$skip: offset}, {$limit: resultCount + 1}]
      } else {
        sortOps = [{$sort: {rating: -1}}, {$skip: offset}, {$limit: resultCount + 1}]
      }

      const mainOps = [
        {$match: {deleted: false}},

        {
          $lookup: {
            from: "artists",
            localField: "artist",
            foreignField: "_id",
            as: "artist"
          }
        },

        {$unwind: "$artist"},

        {
          $lookup: {
            from: "reviews",
            let: {album: "$_id"},
            pipeline: [
              {$match: {$expr: {$eq: ["$album", "$$album"]}}},
              {
                $project: {
                  _id: false,
                  rating: true
                }
              }
            ],
            as: "reviews"
          }
        },

        {
          $lookup: {
            from: "reviews",
            let: {album: "$_id"},
            pipeline: [
              {$match: {$expr: {$eq: ["$album", "$$album"]}}},
              {$unwind: "$tags"},
              {
                $group: {
                  _id: "$tags",
                  count: {$sum: 1}
                }
              },
              {$sort: {count: -1, _id: 1}},
              {$limit: 3}
            ],
            as: "tagCounts"
          }
        },

        {
          $project: {
            _id: true,
            title: true,
            slug: true,
            image: true,
            releaseDate: true,
            tracklist: true,
            label: true,
            artist: true,
            rating: {$trunc: [{$avg: "$reviews.rating"}, 1]},
            tags: {
              $map: {
                input: "$tagCounts",
                as: "tag",
                in: "$$tag._id"
              }
            }
          }
        },

        {
          $lookup: {
            from: "tags",
            localField: "tags",
            foreignField: "_id",
            as: "tags"
          }
        },

        {
          $match: {
            tags: {$elemMatch: {slug: tagSlug}}
          }
        }
      ]

      const [albums, tag] = await Promise.all([albumsCollection.aggregate(mainOps.concat(sortOps)).toArray(), tagsCollection.findOne({slug: tagSlug})])

      //Check if more results
      let moreResults
      if (albums.length > resultCount) {
        moreResults = true
        albums.pop()
      } else {
        moreResults = false
      }

      if (albums) {
        resolve({
          tag,
          albums,
          moreResults
        })
      } else {
        throw new Error("No albums found.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getEditHistory = function (albumSlug, offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    try {
      if (typeof albumSlug != "string") {
        reject()
        return
      }

      const album = await albumsCollection.findOne({slug: albumSlug})

      const editHistory = await albumEditsCollection
        .aggregate([
          {$match: {target: album._id}},

          {
            $lookup: {
              from: "users",
              let: {user: "$user"},
              pipeline: [
                {$match: {$expr: {$eq: ["$_id", "$$user"]}}},

                {
                  $project: {
                    username: true,
                    slug: true
                  }
                }
              ],
              as: "user"
            }
          },

          {
            $project: {
              _id: true,
              target: true,
              date: true,
              user: {$arrayElemAt: ["$user", 0]},
              data: true,
              initial: true
            }
          },

          {$sort: {date: -1}},
          {$skip: offset},
          {$limit: resultCount + 1}
        ])
        .toArray()

      //Check if more results
      let moreResults
      if (editHistory.length > resultCount) {
        moreResults = true
        editHistory.pop()
      } else {
        moreResults = false
      }

      if (editHistory) {
        resolve({
          edits: editHistory,
          moreResults
        })
      } else {
        resolve([])
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.revert = function (editId, user) {
  return new Promise(async function (resolve, reject) {
    try {
      if (typeof editId != "string" || !ObjectID.isValid(editId)) {
        reject("Invalid edit ID.")
        return
      }

      let edit = await albumEditsCollection
        .aggregate([
          {$match: {_id: new ObjectID(editId)}},

          {
            $lookup: {
              from: "albums",
              localField: "target",
              foreignField: "_id",
              as: "target"
            }
          },

          {
            $unwind: "$target"
          }
        ])
        .toArray()
      edit = edit[0]

      //Check that album title is not a duplicate
      let targetAlbum = await Album.reusableAlbumQuery([{$match: {_id: edit.target._id}}])
      let albumExists = await albumsCollection.findOne({
        slug: slugify(edit.data.title, {
          lower: true,
          strict: true
        }),
        artist: new ObjectID(targetAlbum[0].artist._id)
      })
      if (albumExists) {
        resolve({
          success: false,
          message: `The database already contains an album by ${targetAlbum[0].artist.name} called ${albumExists.title}.`,
          album: this.data
        })
        return
      }

      //Reject if user already edited within last minute
      if (!user.type.includes("mod") || !user.type.includes("admin")) {
        const lastEditByCurrentUser = await albumEditsCollection
          .aggregate([
            {
              $match: {
                user: new ObjectID(user._id),
                target: new ObjectID(edit.target._id)
              }
            },

            {$sort: {date: -1}}
          ])
          .toArray()

        const timeSinceLastEdit = Math.round((new Date() - lastEditByCurrentUser[0].date) / 1000)

        if (timeSinceLastEdit < 60) {
          reject(`Please wait ${60 - timeSinceLastEdit} seconds before editing data again.`)
          return
        }
      }

      //Check for differences between current and reverted data
      if (edit.target.title == edit.data.title && edit.data.releaseDate.getDate() == edit.target.releaseDate.getDate() && edit.data.releaseDate.getMonth() == edit.target.releaseDate.getMonth() && edit.data.releaseDate.getFullYear() == edit.target.releaseDate.getFullYear() && edit.target.label == edit.data.label && edit.target.type == edit.data.type && edit.target.image == edit.data.image) {
        reject("No changes between current and previous data.")
      } else {
        const revert = {
          title: edit.data.title,
          slug: slugify(edit.data.title, {
            lower: true,
            strict: true
          }),
          releaseDate: edit.data.releaseDate,
          label: edit.data.label,
          type: edit.data.type,
          image: edit.data.image,
          tracklist: edit.data.tracklist
        }

        const editObject = {
          target: new ObjectID(edit.target._id),
          date: new Date(),
          user: new ObjectID(user._id),
          initial: false,
          data: {
            title: revert.title,
            releaseDate: revert.releaseDate,
            label: revert.label,
            type: revert.type,
            image: revert.image,
            tracklist: revert.tracklist
          }
        }

        const [result, newEdit] = await Promise.all([albumsCollection.updateOne({_id: new ObjectID(edit.target._id)}, {$set: revert}), albumEditsCollection.insertOne(editObject)])

        if (result.modifiedCount && newEdit.insertedCount) {
          resolve({
            success: true,
            message: "Successfully reverted to previous data.",
            edit: {
              _id: new ObjectID(newEdit.insertedId),
              target: new ObjectID(edit.target._id),
              date: new Date(),
              user: {
                _id: user._id,
                username: user.username,
                slug: user.slug
              },
              initial: false,
              data: {
                title: revert.title,
                slug: revert.slug,
                releaseDate: revert.releaseDate,
                label: revert.label,
                type: revert.type,
                image: revert.image,
                tracklist: revert.tracklist
              }
            }
          })
        } else {
          throw new Error("Server error.")
        }
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.search = function (searchTerm) {
  return new Promise(async (resolve, reject) => {
    try {
      //Check search term is a string
      if (typeof searchTerm != "string") {
        reject()
        return
      }

      //Find albums in database
      const albums = await albumsCollection
        .aggregate([
          {
            $lookup: {
              from: "artists",
              localField: "artist",
              foreignField: "_id",
              as: "artist"
            }
          },

          {
            $lookup: {
              from: "reviews",
              let: {album: "$_id"},
              pipeline: [
                {$match: {$expr: {$eq: ["$album", "$$album"]}}},
                {
                  $project: {
                    _id: false,
                    rating: true
                  }
                }
              ],
              as: "reviews"
            }
          },

          {
            $project: {
              _id: true,
              title: true,
              slug: true,
              image: true,
              releaseDate: true,
              tracklist: true,
              label: true,
              artist: {$arrayElemAt: ["$artist", 0]},
              rating: {$trunc: [{$avg: "$reviews.rating"}, 1]}
            }
          },

          {
            $match: {
              $or: [{title: {$regex: searchTerm, $options: "i"}}, {"artist.name": {$regex: searchTerm, $options: "i"}}]
            }
          },

          {$sort: {title: 1}}
        ])
        .toArray()

      if (albums) {
        resolve(albums)
      } else {
        resolve([])
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.getYearsWithReleases = function () {
  return new Promise(async (resolve, reject) => {
    try {
      //Get dates of all albums in database
      const dates = await albumsCollection.distinct("releaseDate")

      //Create array of unique years with album releases plus current year
      let yearsArray = dates.map(date => {
        return date.getFullYear()
      })
      yearsArray.push(new Date().getFullYear())
      const years = [...new Set(yearsArray)]

      //Create array of unique decades with albums releases plus current decade
      let decadesArray = dates.map(date => {
        return Math.floor(date.getFullYear() / 10) * 10
      })
      decadesArray.push(Math.floor(new Date().getFullYear() / 10) * 10)
      const decades = [...new Set(decadesArray)]

      if (years && decades) {
        resolve({
          years,
          decades
        })
      } else {
        resolve({
          years: [],
          decades: []
        })
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

Album.delete = function (userId, albumId) {
  return new Promise(async (resolve, reject) => {
    try {
      const deleted = await albumsCollection.updateOne({_id: new ObjectID(albumId)}, {$set: {deleted: new ObjectID(userId)}})

      if (deleted) {
        resolve(deleted)
      } else {
        reject("Server error.")
      }
    } catch (e) {
      reject(e.message)
    }
  })
}

module.exports = Album
