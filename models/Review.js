const artistsCollection = require("../db").db().collection("artists")
const albumsCollection = require("../db").db().collection("albums")
const reviewsCollection = require("../db").db().collection("reviews")
const tagsCollection = require("../db").db().collection("tags")
const {ObjectID} = require("mongodb")
const slugify = require("slugify")

let Review = function (data) {
  this.data = data
  this.errors = []
}

Review.prototype.cleanUp = function () {
  return new Promise(async (resolve, reject) => {
    if (typeof this.data.title != "string") {
      this.data.title = ""
    }

    if (typeof this.data.summary != "string") {
      this.data.summary = ""
    }

    if (typeof this.data.review != "string") {
      this.data.review = ""
    }

    if (typeof this.data.tags != "object") {
      this.data.tags = []
    }

    this.data.tags.forEach((tag, index) => {
      if (typeof tag != "string" || tag == "") {
        this.data.tags.splice(index, 1)
      }
    })

    if (typeof this.data.rating != "number") {
      this.data.rating = null
    }

    if (this.data.rating > 10) {
      this.data.rating = 10
    }

    if (this.data.rating < 0) {
      this.data.rating = 0
    }

    //Get rid of any bogus properties
    this.data = {
      title: this.data.title.trim(),
      summary: this.data.summary.trim(),
      review: this.data.review.trim(),
      rating: Math.floor(this.data.rating),
      tags: this.data.tags
    }

    //Process tags
    let tagsArray = []
    for (let tag of this.data.tags) {
      const tagSlug = slugify(tag, {
        lower: true,
        strict: true
      })

      //Check if tag exists in database
      const tagExists = await tagsCollection.findOne({slug: tagSlug})

      if (tagExists) {
        tagsArray.push(tagExists._id)
      } else {
        const newTag = await tagsCollection.insertOne({
          name: tag,
          slug: tagSlug
        })

        tagsArray.push(newTag.insertedId)
      }
    }
    this.data.tags = tagsArray

    resolve()
  })
}

Review.prototype.validate = function () {
  //Validate title
  if (this.data.title == "") {
    this.errors.push("You must provide a review title.")
  }
  if (this.data.title.length > 128) {
    this.errors.push("Review title cannot exceed 128 characters.")
  }

  //Validate summary
  if (this.data.summary == "") {
    this.errors.push("You must provide a review summary.")
  }
  if (this.data.summary.length > 256) {
    this.errors.push("Review summary cannot exceed 256 characters.")
  }

  //Validate review
  if (this.data.review.length > 99999) {
    this.errors.push("Review cannot exceed 99999 characters.")
  }

  //Validate rating
  if (!this.data.rating) {
    this.errors.push("You must provide a rating.")
  }
}

Review.prototype.register = function (user, artistSlug, albumSlug) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate album data
    await this.cleanUp()
    this.validate()

    //Resolve with review ID string if it already exists
    let artist = await artistsCollection.findOne({slug: artistSlug})
    let album = await albumsCollection.findOne({
      slug: albumSlug,
      artist: new ObjectID(artist._id)
    })
    let reviewExists = await reviewsCollection.findOne({
      album: new ObjectID(album._id),
      author: new ObjectID(user._id)
    })
    if (reviewExists) {
      resolve(reviewExists)
      return
    }

    //Only if there are no validation errors add new album to database
    if (!this.errors.length) {
      //Add album
      this.data.album = new ObjectID(album._id)

      //Author and date info
      this.data.author = new ObjectID(user._id)
      this.data.date = new Date()

      reviewsCollection
        .insertOne(this.data)
        .then(result => {
          this.data._id = result.insertedId.toString()
          resolve(this.data)
        })
        .catch(error => {
          this.errors.push(error)
          reject(this.errors)
        })
    } else {
      reject(this.errors)
    }
  })
}

Review.prototype.edit = function (targetReview) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate album data
    await this.cleanUp()
    this.validate()

    //Check that edit data is different from existing database data
    if (targetReview.title == this.data.title && targetReview.summary == this.data.summary && targetReview.review == this.data.review && targetReview.tags == this.data.tags && targetReview.rating == this.data.rating) {
      console.log("Data unchanged")
      resolve(targetReview)
      return
    }

    //Edit review in database
    if (!this.errors.length) {
      const reviewsUpdate = reviewsCollection
        .updateOne({_id: targetReview._id}, {$set: this.data})
        .then(() => {
          resolve(this.data)
        })
        .catch(error => {
          this.errors.push(error)
          reject(this.errors)
        })
    } else {
      reject(this.errors)
    }
  })
}

Review.reusableReviewQuery = function (uniqueOperations) {
  return new Promise(async (resolve, reject) => {
    let aggOperations = uniqueOperations.concat([
      {
        $lookup: {
          from: "users",
          let: {author: "$author"},
          pipeline: [
            {$match: {$expr: {$eq: ["$_id", "$$author"]}}},
            {
              $project: {
                _id: true,
                username: true,
                slug: true,
                image: true
              }
            }
          ],
          as: "author"
        }
      },

      {
        $lookup: {
          from: "albums",
          let: {album: "$album"},
          pipeline: [
            {$match: {$expr: {$eq: ["$_id", "$$album"]}}},

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
                as: "reviews"
              }
            },

            {
              $project: {
                title: true,
                slug: true,
                type: true,
                releaseDate: true,
                image: true,
                artist: "$artist.name",
                artistSlug: "$artist.slug",
                rating: {$trunc: [{$avg: "$reviews.rating"}, 1]}
              }
            }
          ],
          as: "album"
        }
      },

      {
        $lookup: {
          from: "comments",
          let: {review: "$_id"},
          pipeline: [
            {$match: {$expr: {$eq: ["$review", "$$review"]}}},
            {
              $lookup: {
                from: "users",
                let: {author: "$author"},
                pipeline: [
                  {$match: {$expr: {$eq: ["$_id", "$$author"]}}},
                  {
                    $project: {
                      _id: false,
                      username: true,
                      slug: true,
                      image: true
                    }
                  }
                ],
                as: "author"
              }
            },
            {
              $lookup: {
                from: "commentLikes",
                foreignField: "comment",
                localField: "_id",
                as: "likes"
              }
            },
            {
              $project: {
                comment: true,
                date: true,
                likes: {
                  $map: {
                    input: "$likes",
                    as: "like",
                    in: "$$like.user"
                  }
                },
                likeCount: {$size: "$likes"},
                parent: true,
                author: {$arrayElemAt: ["$author", 0]}
              }
            },
            {$sort: {likeCount: -1, date: -1}},
            {$unset: "likeCount"}
          ],
          as: "comments"
        }
      },

      {$lookup: {from: "likes", localField: "_id", foreignField: "review", as: "likes"}},

      {$lookup: {from: "tags", localField: "tags", foreignField: "_id", as: "tags"}},

      {
        $project: {
          title: true,
          summary: true,
          review: true,
          rating: true,
          date: true,
          album: {$arrayElemAt: ["$album", 0]},
          author: {$arrayElemAt: ["$author", 0]},
          comments: true,
          likes: {
            $map: {
              input: "$likes",
              as: "like",
              in: "$$like.user"
            }
          },
          tags: true
        }
      }
    ])
    let reviews = await reviewsCollection.aggregate(aggOperations).toArray()

    if (reviews) {
      resolve(reviews)
    } else {
      reject("Server error")
    }
  })
}

Review.getById = function (reviewId) {
  return new Promise(async function (resolve, reject) {
    if (typeof reviewId != "string" || !ObjectID.isValid(reviewId)) {
      reject("Invalid review ID.")
      return
    }

    let reviews = await Review.reusableReviewQuery([{$match: {_id: new ObjectID(reviewId)}}])

    if (reviews) {
      resolve(reviews[0])
    } else {
      reject("Review not found.")
    }
  })
}

Review.getRecent = function (offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    let reviews = await reviewsCollection
      .aggregate([
        {$sort: {date: -1}},
        {$skip: offset},
        {$limit: resultCount + 1},

        {
          $lookup: {
            from: "users",
            let: {author: "$author"},
            pipeline: [
              {$match: {$expr: {$eq: ["$_id", "$$author"]}}},
              {
                $project: {
                  _id: true,
                  username: true,
                  slug: true,
                  image: true
                }
              }
            ],
            as: "author"
          }
        },

        {
          $lookup: {
            from: "albums",
            let: {album: "$album"},
            pipeline: [
              {$match: {$expr: {$eq: ["$_id", "$$album"]}}},

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
                  as: "reviews"
                }
              },

              {
                $project: {
                  title: true,
                  slug: true,
                  type: true,
                  releaseDate: true,
                  image: true,
                  artist: true,
                  rating: {$trunc: [{$avg: "$reviews.rating"}, 1]}
                }
              }
            ],
            as: "album"
          }
        },

        {
          $lookup: {
            from: "comments",
            let: {review: "$_id"},
            pipeline: [
              {$match: {$expr: {$eq: ["$review", "$$review"]}}},
              {
                $lookup: {
                  from: "users",
                  let: {author: "$author"},
                  pipeline: [
                    {$match: {$expr: {$eq: ["$_id", "$$author"]}}},
                    {
                      $project: {
                        _id: false,
                        username: true,
                        slug: true,
                        image: true
                      }
                    }
                  ],
                  as: "author"
                }
              },
              {
                $lookup: {
                  from: "commentLikes",
                  foreignField: "comment",
                  localField: "_id",
                  as: "likes"
                }
              },
              {
                $project: {
                  comment: true,
                  date: true,
                  likes: {
                    $map: {
                      input: "$likes",
                      as: "like",
                      in: "$$like.user"
                    }
                  },
                  likeCount: {$size: "$likes"},
                  parent: true,
                  author: {$arrayElemAt: ["$author", 0]}
                }
              },
              {$sort: {likeCount: -1, date: -1}},
              {$unset: "likeCount"}
            ],
            as: "comments"
          }
        },

        {$lookup: {from: "likes", localField: "_id", foreignField: "review", as: "likes"}},

        {$lookup: {from: "tags", localField: "tags", foreignField: "_id", as: "tags"}},

        {
          $project: {
            title: true,
            summary: true,
            review: true,
            rating: true,
            date: true,
            album: {$arrayElemAt: ["$album", 0]},
            author: {$arrayElemAt: ["$author", 0]},
            comments: true,
            likes: {
              $map: {
                input: "$likes",
                as: "like",
                in: "$$like.user"
              }
            },
            tags: true
          }
        }
      ])
      .toArray()

    //Check if more reviews
    let moreReviews
    if (reviews.length > resultCount) {
      moreReviews = true
      reviews.pop()
    } else {
      moreReviews = false
    }

    if (reviews) {
      resolve({
        reviews,
        moreReviews
      })
    } else {
      reject("Reviews not found.")
    }
  })
}

module.exports = Review
