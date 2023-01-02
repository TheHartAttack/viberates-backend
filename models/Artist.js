const artistsCollection = require("../db").db().collection("artists")
const artistEditsCollection = require("../db").db().collection("artistEdits")
const slugify = require("slugify")
const lodash = require("lodash")
const mostCommon = require("most-common")
const ObjectID = require("mongodb").ObjectID

let Artist = function (data) {
  this.data = data
  this.errors = []
}

Artist.prototype.cleanUp = function () {
  if (typeof this.data.name != "string") {
    this.data.name = ""
  }

  if (typeof this.data.image != "string") {
    this.data.image = ""
  }

  //Get rid of any bogus properties
  this.data = {
    name: this.data.name.trim(),
    slug: slugify(this.data.name, {
      lower: true,
      strict: true
    }),
    image: this.data.image
  }
}

Artist.prototype.validate = function () {
  if (this.data.name == "") {
    this.errors.push("You must provide an artist name.")
  }
  if (this.data.name.length > 256) {
    this.errors.push("Artist name cannot exceed 256 characters.")
  }
}

Artist.prototype.register = function (user) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate artist data
    this.cleanUp()
    this.validate()

    //Resolve with artist ID string if it already exists
    let artistExists = await artistsCollection.findOne({slug: this.data.slug})
    if (artistExists) {
      resolve(this.data)
      return
    }

    //Only if there are no validation errors add new artist to database
    if (!this.errors.length) {
      try {
        //Add new artist data to database
        const result = await artistsCollection.insertOne(this.data)
        this.data._id = result.insertedId.toString()

        //Create edit object and add to database
        const editObject = {
          target: new ObjectID(this.data._id),
          date: new Date(),
          user: new ObjectID(user._id),
          initial: true,
          data: {
            name: this.data.name,
            image: this.data.image
          }
        }

        await artistEditsCollection.insertOne(editObject)

        resolve(this.data)
      } catch (e) {
        this.errors.push(e)
        reject(this.errors)
      }
    } else {
      reject(this.errors)
    }
  })
}

Artist.prototype.edit = async function (user, targetArtist) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate artist data
    this.cleanUp()
    this.validate()

    //Check that edit data is different from existing database data
    if (targetArtist.name == this.data.name && targetArtist.image == this.data.image) {
      resolve(targetArtist)
      return
    }

    //Check that artist name is not a duplicate
    let artistExists = await artistsCollection.findOne({slug: this.data.slug})
    if (artistExists) {
      resolve({
        success: false,
        message: `The database already contains an artist called ${targetArtist.name}.`,
        artist: this.data
      })
      return
    }

    //Update database
    if (!this.errors.length) {
      try {
        //Create edit object
        const editObject = {
          target: targetArtist._id,
          date: new Date(),
          user: new ObjectID(user._id),
          initial: false,
          data: {
            name: this.data.name,
            image: this.data.image
          }
        }

        await Promise.all([artistsCollection.updateOne({_id: targetArtist._id}, {$set: this.data}), artistEditsCollection.insertOne(editObject)])

        resolve({
          success: true,
          message: `${this.data.name} has been updated.`,
          artist: this.data,
          date: editObject.date,
          changes: true
        })
      } catch (e) {
        this.errors.push(e)
        reject(this.errors)
      }
    } else {
      reject(this.errors)
    }
  })
}

Artist.reusableArtistQuery = function (uniqueOperations) {
  return new Promise(async (resolve, reject) => {
    let aggOperations = uniqueOperations.concat([
      {
        $lookup: {
          from: "albums",
          let: {artist: "$_id"},
          pipeline: [
            {$match: {deleted: false}},
            {$match: {$expr: {$eq: ["$artist", "$$artist"]}}},

            {
              $lookup: {
                from: "reviews",
                let: {album: "$_id"},
                pipeline: [
                  {$match: {$expr: {$eq: ["$album", "$$album"]}}},
                  {
                    $lookup: {
                      from: "users",
                      let: {id: "$_id"},
                      pipeline: [
                        {$match: {$expr: {$eq: ["$author", "$$id"]}}},
                        {
                          $project: {
                            username: true
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
                      postDate: true,
                      author: {$arrayElemAt: ["$author", 0]}
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
                image: true,
                releaseDate: true,
                tracklist: true,
                label: true,
                type: true,
                reviews: true,
                rating: {$trunc: [{$avg: "$reviews.rating"}, 1]}
              }
            },

            {$sort: {releaseDate: 1}}
          ],
          as: "albums"
        }
      },

      {
        $lookup: {
          from: "albums",
          let: {artist: "$_id"},
          pipeline: [
            {$match: {deleted: false}},
            {$match: {$expr: {$eq: ["$artist", "$$artist"]}}},

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
                  {$limit: 5}
                ],
                as: "reviewTags"
              }
            },

            {
              $project: {
                _id: false,
                tags: {
                  $map: {
                    input: "$reviewTags",
                    as: "tag",
                    in: "$$tag._id"
                  }
                }
              }
            },

            {$unwind: "$tags"},
            {
              $group: {
                _id: "$tags",
                count: {$sum: 1}
              }
            },
            {$sort: {count: -1, _id: 1}},
            {$limit: 5}
          ],
          as: "albumTags"
        }
      },

      {
        $project: {
          _id: true,
          name: true,
          slug: true,
          image: true,
          albums: true,
          tags: {
            $map: {
              input: "$albumTags",
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
      }
    ])

    let artist = await artistsCollection.aggregate(aggOperations).toArray()

    artist = artist[0]

    if (artist) {
      resolve(artist)
    } else {
      reject("Artist not found.")
    }
  })
}

Artist.getBySlug = function (artistSlug) {
  return new Promise(async function (resolve, reject) {
    try {
      if (typeof artistSlug != "string") {
        reject()
        return
      }

      const artist = await Artist.reusableArtistQuery([{$match: {slug: artistSlug}}])

      if (artist) {
        resolve(artist)
      } else {
        reject("Artist not found.")
      }
    } catch (e) {
      reject(e)
    }
  })
}

Artist.getById = function (artistId) {
  return new Promise(async function (resolve, reject) {
    if (typeof artistId != "string" || !ObjectID.isValid(artistId)) {
      reject("Invalid artist ID.")
      return
    }

    const artist = await Artist.reusableArtistQuery([{$match: {_id: artistId}}])

    if (artist) {
      resolve(artist)
    } else {
      reject("Artist not found.")
    }
  })
}

Artist.getEditHistory = function (artistSlug, offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    if (typeof artistSlug != "string") {
      reject()
      return
    }

    const artist = await artistsCollection.findOne({slug: artistSlug})

    const editHistory = await artistEditsCollection
      .aggregate([
        {$match: {target: artist._id}},

        {$sort: {date: -1}},

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
  })
}

Artist.revert = function (editId, user) {
  return new Promise(async function (resolve, reject) {
    if (typeof editId != "string" || !ObjectID.isValid(editId)) {
      reject("Invalid edit ID.")
      return
    }

    let edit = await artistEditsCollection
      .aggregate([
        {$match: {_id: new ObjectID(editId)}},

        {
          $lookup: {
            from: "artists",
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

    //Check that artist name is not a duplicate
    let targetArtist = await Artist.reusableArtistQuery([{$match: {_id: edit.target._id}}])
    let artistExists = await artistsCollection.findOne({
      slug: slugify(edit.data.name, {
        lower: true,
        strict: true
      })
    })
    if (artistExists) {
      resolve({
        success: false,
        message: `The database already contains an artist called ${targetArtist.name}.`,
        artist: this.data
      })
      return
    }

    //Reject if user already edited within last minute
    if (!user.type.includes("mod") || !user.type.includes("admin")) {
      const lastEditByCurrentUser = await artistEditsCollection
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
    if (edit.target.name == edit.data.name && edit.target.image == edit.data.image) {
      reject("No changes between current and previous data.")
    } else {
      const revert = {
        name: edit.data.name,
        slug: slugify(edit.data.name, {
          lower: true,
          strict: true
        }),
        image: edit.data.image
      }

      const editObject = {
        target: new ObjectID(edit.target._id),
        date: new Date(),
        user: new ObjectID(user._id),
        initial: false,
        data: {
          name: revert.name,
          image: revert.image
        }
      }

      const [result, newEdit] = await Promise.all([artistsCollection.updateOne({_id: edit.target._id}, {$set: revert}), artistEditsCollection.insertOne(editObject)])

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
              name: revert.name,
              slug: revert.slug,
              image: revert.image
            }
          }
        })
      } else {
        reject("ERROR")
      }
    }
  })
}

Artist.search = function (searchTerm) {
  return new Promise(async (resolve, reject) => {
    //Check search term is a string
    if (typeof searchTerm != "string") {
      reject()
      return
    }

    //Find artists in database
    const artists = await artistsCollection
      .aggregate([
        {
          $match: {
            name: {
              $regex: searchTerm,
              $options: "i"
            }
          }
        },

        {
          $project: {
            name: true,
            slug: true,
            image: true
          }
        },

        {$sort: {name: 1}}
      ])
      .toArray()

    if (artists) {
      resolve(artists)
    } else {
      resolve([])
    }
  })
}

module.exports = Artist
