const commentsCollection = require("../db").db().collection("comments")
const {ObjectID} = require("mongodb")
const User = require("./User")

let Comment = function (data) {
  this.data = data
  this.errors = []
}

Comment.prototype.cleanUp = function () {
  if (typeof this.data.comment != "string") {
    this.data.comment = ""
  }

  //Get rid of any bogus properties
  this.data = {
    comment: this.data.comment
  }
}

Comment.prototype.validate = function () {
  if (this.data.comment == "") {
    this.errors.push("You must provide a comment.")
  }

  if (this.data.comment.length > 9999) {
    this.errors.push("Comment cannot exceed 9999 characters.")
  }
}

Comment.prototype.register = function (user, reviewId) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate album data
    this.cleanUp()
    this.validate()

    //Check user has not commented in last 60 seconds
    const userComments = await commentsCollection.find({author: new ObjectID(user._id)}).toArray()

    for (let comment of userComments) {
      const timeSinceLastComment = Math.ceil((new Date() - comment.date) / 1000)
      if (timeSinceLastComment < 60) {
        this.errors.push(`Please wait ${60 - timeSinceLastComment} second${60 - timeSinceLastComment == 1 ? "" : "s"} before posting another comment.`)
        break
      }
    }

    //Only if there are no validation errors add new album to database
    if (!this.errors.length) {
      //Add review
      this.data.review = new ObjectID(reviewId)

      //Author and date info
      this.data.author = new ObjectID(user._id)
      this.data.date = new Date()

      commentsCollection
        .insertOne(this.data)
        .then(async result => {
          this.data._id = result.insertedId.toString()
          this.data.author = await User.getById(user._id)

          resolve({
            success: true,
            message: `Your comment has been posted.`,
            body: this.data
          })
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

Comment.prototype.edit = function (targetComment) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate album data
    this.cleanUp()
    this.validate()

    //Check that edit data is different from existing database data
    if (targetComment.comment == this.data.comment) {
      const response = {
        success: true,
        message: "Comment unchanged.",
        comment: targetComment
      }
      resolve(response)
      return
    }

    //Edit comment in database
    if (!this.errors.length) {
      const commentsUpdate = commentsCollection
        .updateOne({_id: targetComment._id}, {$set: this.data})
        .then(() => {
          const response = {
            success: true,
            message: `Your comment has been updated.`,
            comment: this.data
          }
          resolve(response)
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

Comment.getById = function (commentId) {
  return new Promise(async function (resolve, reject) {
    if (typeof commentId != "string" || !ObjectID.isValid(commentId)) {
      reject("Invalid comment ID.")
      return
    }

    let comment = await commentsCollection.findOne({_id: new ObjectID(commentId)})

    if (comment) {
      resolve(comment)
    } else {
      reject("Comment not found.")
    }
  })
}

module.exports = Comment
