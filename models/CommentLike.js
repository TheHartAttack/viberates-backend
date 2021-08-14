const commentLikesCollection = require("../db").db().collection("commentLikes")
const {ObjectID} = require("mongodb")

let CommentLike = function (data) {
  this.data = data
  this.errors = []
}

CommentLike.prototype.cleanUp = function () {
  if (typeof this.data.comment != "string") {
    this.data.comment = ""
  }

  if (typeof this.data.user != "string") {
    this.data.user = ""
  }

  //Get rid of any bogus properties
  this.data = {
    comment: new ObjectID(this.data.comment),
    user: new ObjectID(this.data.user)
  }
}

CommentLike.prototype.validate = function (user) {
  if (this.data.comment == "" || !ObjectID.isValid(this.data.comment)) {
    this.errors.push("Invalid comment ID.")
  }
  if (this.data.user == "" || !ObjectID.isValid(this.data.user)) {
    this.errors.push("Invalid user ID.")
  }
}

CommentLike.prototype.register = function () {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate like data
    this.cleanUp()
    this.validate()

    if (!this.errors.length) {
      commentLikesCollection
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

CommentLike.get = function (user, comment) {
  return new Promise(async function (resolve, reject) {
    if (!ObjectID.isValid(user) || !ObjectID.isValid(comment)) {
      reject("Invalid user/comment ID.")
      return
    }

    const like = await commentLikesCollection.findOne({
      comment: new ObjectID(comment),
      user: new ObjectID(user)
    })
    if (like) {
      resolve(like)
    } else {
      resolve(null)
    }
  })
}

CommentLike.delete = function (like) {
  return new Promise(async function (resolve, reject) {
    commentLikesCollection
      .deleteOne({_id: like._id})
      .then(() => {
        resolve(like)
      })
      .catch(e => {
        console.log(e)
        reject("Server error.")
      })
  })
}

module.exports = CommentLike
