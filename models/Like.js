const likesCollection = require("../db").db().collection("likes")
const {ObjectID} = require("mongodb")

let Like = function (data) {
  this.data = data
  this.errors = []
}

Like.prototype.cleanUp = function () {
  if (typeof this.data.review != "string") {
    this.data.review = ""
  }

  if (typeof this.data.author != "string") {
    this.data.author = ""
  }

  if (typeof this.data.user != "string") {
    this.data.user = ""
  }

  //Get rid of any bogus properties
  this.data = {
    review: new ObjectID(this.data.review),
    author: new ObjectID(this.data.author),
    user: new ObjectID(this.data.user)
  }
}

Like.prototype.validate = function () {
  if (this.data.review == "" || !ObjectID.isValid(this.data.review)) {
    this.errors.push("Invalid review ID.")
  }
  if (this.data.author == "" || !ObjectID.isValid(this.data.author)) {
    this.errors.push("Invalid author ID.")
  }
  if (this.data.user == "" || !ObjectID.isValid(this.data.user)) {
    this.errors.push("Invalid user ID.")
  }
}

Like.prototype.register = function () {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate like data
    this.cleanUp()
    this.validate()

    if (!this.errors.length) {
      likesCollection
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

Like.get = function (user, review) {
  return new Promise(async function (resolve, reject) {
    if (!ObjectID.isValid(user) || !ObjectID.isValid(review)) {
      reject("Invalid user/review ID.")
      return
    }

    const like = await likesCollection.findOne({
      review: new ObjectID(review),
      user: new ObjectID(user)
    })
    if (like) {
      resolve(like)
    } else {
      resolve(null)
    }
  })
}

Like.delete = function (like) {
  return new Promise(async function (resolve, reject) {
    likesCollection
      .deleteOne({_id: like._id})
      .then(() => {
        resolve(like)
      })
      .catch(e => {
        console.log(e)
        reject()
      })
  })
}

module.exports = Like
