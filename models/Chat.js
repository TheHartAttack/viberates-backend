const chatCollection = require("../db").db().collection("chat")
const {ObjectID} = require("mongodb")

let Chat = function (data) {
  this.data = data
  this.errors = []
}

Chat.prototype.cleanUp = function () {
  if (typeof this.data.body != "string") {
    this.data.body = ""
  }

  //Get rid of any bogus properties
  this.data = {
    body: this.data.body.trim()
  }
}

Chat.prototype.validate = function () {
  if (this.data.body == "") {
    this.errors.push("You must provide message text.")
  }
  if (this.data.body.length > 256) {
    this.errors.push("Message cannot exceed 256 characters.")
  }
}

Chat.prototype.register = function (user) {
  return new Promise(async (resolve, reject) => {
    //Clean up and validate chat data
    this.cleanUp()
    this.validate()

    //Only if there are no validation errors add new artist to database
    if (!this.errors.length) {
      try {
        //Add date info
        this.data.date = new Date()
        this.data.user = new ObjectID(user._id)

        //Add new artist data to database
        const result = await chatCollection.insertOne(this.data)
        this.data._id = result.insertedId.toString()
        this.data.user = {
          _id: user._id,
          username: user.username,
          slug: user.slug,
          image: user.image
        }

        resolve(this.data)
      } catch (e) {
        this.errors.push(e)
        reject(this.errors)
      }
    }
  })
}

Chat.load = function (offset, numberOfMessages) {
  return new Promise(async function (resolve, reject) {
    let chat = await chatCollection
      .aggregate([
        {
          $lookup: {
            from: "users",
            let: {user: "$user"},
            pipeline: [
              {$match: {$expr: {$eq: ["$_id", "$$user"]}}},
              {
                $project: {
                  username: true,
                  slug: true,
                  image: true
                }
              }
            ],
            as: "user"
          }
        },

        {
          $project: {
            user: {$arrayElemAt: ["$user", 0]},
            date: true,
            body: true
          }
        },

        {$sort: {date: -1}},
        {$skip: offset},
        {$limit: numberOfMessages + 1}
      ])
      .toArray()

    //Check if more results
    let moreResults
    if (chat.length > numberOfMessages) {
      moreResults = true
      chat.pop()
    } else {
      moreResults = false
    }

    if (chat) {
      resolve({
        messages: chat.reverse(),
        moreMessages: moreResults
      })
    } else {
      reject("Chat could not be loaded.")
    }
  })
}

module.exports = Chat
