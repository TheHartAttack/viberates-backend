const usersCollection = require("../db").db().collection("users")
const reviewsCollection = require("../db").db().collection("reviews")
const bcrypt = require("bcryptjs")
const validator = require("validator")
const slugify = require("slugify")
const {ObjectID} = require("mongodb")
const generator = require("generate-password")
const nodemailer = require("nodemailer")
const reviewCount = 12

let User = function (data) {
  this.data = data
  this.errors = []
}

User.prototype.cleanUp = function () {
  if (typeof this.data.username != "string") {
    this.data.username = ""
  }
  if (typeof this.data.email != "string") {
    this.data.email = ""
  }
  if (typeof this.data.password != "string") {
    this.data.password = ""
  }

  // get rid of any bogus properties
  this.data = {
    username: this.data.username.trim(),
    email: this.data.email.trim().toLowerCase(),
    password: this.data.password
  }
}

User.prototype.validate = function () {
  return new Promise(async (resolve, reject) => {
    if (this.data.username == "") {
      this.errors.push("You must provide a username.")
    }
    if (this.data.username != "" && !validator.isAlphanumeric(this.data.username)) {
      this.errors.push("Username can only contain letters and numbers.")
    }
    if (!validator.isEmail(this.data.email)) {
      this.errors.push("You must provide a valid email address.")
    }
    if (this.data.password == "") {
      this.errors.push("You must provide a password.")
    }
    if (this.data.password.length > 0 && this.data.password.length < 8) {
      this.errors.push("Password must be at least 8 characters.")
    }
    if (this.data.password.length > 32) {
      this.errors.push("Password cannot exceed 32 characters.")
    }
    if (this.data.username.length > 0 && this.data.username.length < 2) {
      this.errors.push("Username must be at least 2 characters.")
    }
    if (this.data.username.length > 32) {
      this.errors.push("Username cannot exceed 32 characters.")
    }

    // Only if username is valid then check to see if it's already taken
    if (this.data.username.length > 2 && this.data.username.length < 31 && validator.isAlphanumeric(this.data.username)) {
      const slug = slugify(this.data.username, {
        lower: true,
        strict: true
      })
      let usernameExists = await usersCollection.findOne({slug})
      if (usernameExists) {
        this.errors.push("That username is already taken.")
      }
    }

    // Only if email is valid then check to see if it's already taken
    if (validator.isEmail(this.data.email)) {
      let emailExists = await usersCollection.findOne({email: this.data.email})
      if (emailExists) {
        this.errors.push("That email is already being used.")
      }
    } else {
      this.errors.push("Invalid email.")
    }
    resolve()
  })
}

User.prototype.register = function () {
  return new Promise(async (resolve, reject) => {
    // Step #1: Validate user data
    this.cleanUp()
    await this.validate()

    // Step #2: Only if there are no validation errors
    // then save the user data into a database
    if (!this.errors.length) {
      // Hash user password
      let salt = bcrypt.genSaltSync(10)
      this.data.password = bcrypt.hashSync(this.data.password, salt)

      //Set user image, slug, type and edit permission
      this.data.image = ""
      this.data.slug = slugify(this.data.username, {
        lower: true,
        strict: true
      })
      this.data.type = ["user"]
      this.data.suspended = false

      const newUser = await usersCollection.insertOne(this.data)
      this.data._id = newUser.insertedId
      resolve(this.data)
    } else {
      reject(this.errors)
    }
  })
}

User.prototype.login = function () {
  return new Promise((resolve, reject) => {
    this.cleanUp()

    const slug = slugify(this.data.username, {
      lower: true,
      strict: true
    })

    usersCollection
      .findOne({slug})
      .then(attemptedUser => {
        if (attemptedUser && bcrypt.compareSync(this.data.password, attemptedUser.password)) {
          this.data = attemptedUser
          resolve(this.data)
        } else {
          reject("Invalid username / password.")
        }
      })
      .catch(function (e) {
        reject("Please try again later.")
      })
  })
}

User.reusableUserQuery = function (uniqueOperations, options) {
  return new Promise(async (resolve, reject) => {
    let optionalOps = []
    if (options.getReviews) {
      optionalOps = optionalOps.concat([
        {
          $lookup: {
            from: "reviews",
            let: {id: "$_id"},
            pipeline: [
              {$match: {$expr: {$eq: ["$$id", "$author"]}}},
              {
                $lookup: {
                  from: "albums",
                  let: {album: "$album"},
                  pipeline: [
                    {$match: {$expr: {$eq: ["$$album", "$_id"]}}},
                    {
                      $lookup: {
                        from: "artists",
                        let: {artist: "$artist"},
                        pipeline: [
                          {$match: {$expr: {$eq: ["$$artist", "$_id"]}}},
                          {
                            $project: {
                              _id: true,
                              name: true,
                              slug: true,
                              image: true
                            }
                          }
                        ],
                        as: "artist"
                      }
                    },
                    {
                      $project: {
                        _id: true,
                        title: true,
                        slug: true,
                        image: true,
                        releaseDate: true,
                        label: true,
                        artist: {$arrayElemAt: ["$artist", 0]}
                      }
                    }
                  ],
                  as: "album"
                }
              },

              {
                $lookup: {
                  from: "likes",
                  localField: "_id",
                  foreignField: "review",
                  as: "likes"
                }
              },

              {
                $project: {
                  _id: true,
                  title: true,
                  summary: true,
                  review: true,
                  rating: true,
                  author: true,
                  date: true,
                  tags: true,
                  likes: true,
                  album: {$arrayElemAt: ["$album", 0]}
                }
              },
              {$sort: {date: -1}},
              {$limit: reviewCount + 1}
            ],
            as: "reviews"
          }
        }
      ])
    }

    let aggOperations = optionalOps.concat([
      {
        $lookup: {
          from: "likes",
          localField: "_id",
          foreignField: "author",
          as: "likes"
        }
      },

      {
        $project: {
          _id: true,
          username: true,
          slug: true,
          image: true,
          type: true,
          suspended: true,
          reviews: true,
          likes: {$size: "$likes"}
        }
      }
    ])

    aggOperations = uniqueOperations.concat(aggOperations)

    let user = await usersCollection.aggregate(aggOperations).toArray()
    user = user[0]

    if (user) {
      if (user.reviews) {
        //Check if more reviews
        if (user.reviews.length > reviewCount) {
          user.moreReviews = true
          user.reviews.pop()
        } else {
          user.moreReviews = false
        }
      }

      resolve(user)
    } else {
      reject("User not found.")
    }
  })
}

User.getByUsername = function (username) {
  return new Promise(async (resolve, reject) => {
    let user = await usersCollection.findOne({username})

    if (user) {
      //Cleanup user data
      user = {
        _id: user._id,
        username: user.username,
        slug: user.slug,
        type: user.type,
        suspended: user.suspended
      }
      resolve(user)
    } else {
      reject("User not found.")
    }
  })
}

User.getBySlug = function (slug, getReviews) {
  return new Promise(async (resolve, reject) => {
    const uniqueOperations = [{$match: {slug: slug}}]

    let user = await User.reusableUserQuery(uniqueOperations, {type: "slug", data: slug, getReviews})

    if (user) {
      resolve(user)
    } else {
      reject("User not found.")
    }
  })
}

User.getById = function (id, getReviews) {
  return new Promise(async (resolve, reject) => {
    const uniqueOperations = [{$match: {_id: new ObjectID(id)}}]

    let user = await User.reusableUserQuery(uniqueOperations, {type: "id", data: id, getReviews})

    if (user) {
      resolve(user)
    } else {
      reject("User not found.")
    }
  })
}

User.doesSlugExist = function (userSlug) {
  return new Promise(async function (resolve, reject) {
    if (typeof userSlug != "string") {
      reject()
      return
    }
    usersCollection
      .findOne({slug: userSlug})
      .then(function (userDoc) {
        if (userDoc) {
          resolve(userDoc)
        } else {
          reject()
        }
      })
      .catch(function (e) {
        reject()
      })
  })
}

User.doesEmailExist = function (email) {
  return new Promise(async function (resolve, reject) {
    if (typeof email != "string") {
      resolve(false)
      return
    }

    let user = await usersCollection.findOne({email: email})
    if (user) {
      resolve(true)
    } else {
      resolve(false)
    }
  })
}

User.promoteMod = function (user) {
  return new Promise(async (resolve, reject) => {
    const moddedUser = await usersCollection.updateOne({_id: new ObjectID(user._id)}, {$push: {type: "mod"}})
    if (moddedUser) {
      resolve()
    } else {
      reject("Server error")
    }
  })
}

User.demoteMod = function (user) {
  return new Promise(async (resolve, reject) => {
    const unmoddedUser = await usersCollection.updateOne({_id: new ObjectID(user._id)}, {$pull: {type: "mod"}})
    if (unmoddedUser) {
      resolve()
    } else {
      reject("Server error")
    }
  })
}

User.suspend = function (user) {
  return new Promise(async (resolve, reject) => {
    const suspendedUser = await usersCollection.updateOne({_id: new ObjectID(user._id)}, {$set: {suspended: true}})

    if (suspendedUser) {
      resolve()
    } else {
      reject("Server error")
    }
  })
}

User.unsuspend = function (user) {
  return new Promise(async (resolve, reject) => {
    const unsuspendedUser = await usersCollection.updateOne({_id: new ObjectID(user._id)}, {$set: {suspended: false}})
    if (unsuspendedUser) {
      resolve()
    } else {
      reject("Server error")
    }
  })
}

User.updateImage = function (userId, imageUrl) {
  return new Promise(async (resolve, reject) => {
    usersCollection
      .updateOne({_id: new ObjectID(userId)}, {$set: {image: imageUrl}})
      .then(() => {
        resolve()
      })
      .catch(err => {
        console.log(err)
        reject(err)
      })
  })
}

User.deleteImage = function (userId) {
  return new Promise(async (resolve, reject) => {
    usersCollection
      .updateOne({_id: new ObjectID(userId)}, {$set: {image: ""}})
      .then(() => {
        resolve()
      })
      .catch(err => {
        console.log(err)
        reject(err)
      })
  })
}

User.changePassword = function (userId, data) {
  return new Promise(async (resolve, reject) => {
    //Validate password
    if (typeof data.newPassword != "string") {
      reject("New password is invalid.")
      return
    }
    if (data.newPassword == "") {
      reject("You must provide a new password.")
      return
    }
    if (data.newPassword.length > 0 && data.newPassword.length < 8) {
      reject("New password must be at least 8 characters.")
      return
    }
    if (data.newPassword.length > 32) {
      reject("New password cannot exceed 32 characters.")
      return
    }

    //Validate user ID
    if (typeof userId != "string" || !ObjectID.isValid(userId)) {
      reject("Invalid user ID.")
      return
    }

    //Check new password matches confirm
    if (data.newPassword != data.confirmPassword) {
      reject("New password does not match confirmation.")
      return
    }

    //Compare current password to password in database
    const attemptedUser = await usersCollection.findOne({_id: new ObjectID(userId)})

    if (!bcrypt.compareSync(data.currentPassword, attemptedUser.password)) {
      reject("Incorrect current password.")
      return
    }

    //Hash user password and update
    const salt = bcrypt.genSaltSync(10)
    const newPassword = bcrypt.hashSync(data.newPassword, salt)

    usersCollection
      .updateOne({_id: new ObjectID(userId)}, {$set: {password: newPassword}})
      .then(() => {
        resolve()
      })
      .catch(err => {
        console.log(err)
        reject(err)
      })
  })
}

User.resetPassword = function (email) {
  return new Promise(async (resolve, reject) => {
    try {
      if (!validator.isEmail(email)) {
        reject("Invalid email.")
        return
      }

      const newPassword = generator.generate({
        length: 10,
        numbers: true
      })

      //Hash user password and update
      const salt = bcrypt.genSaltSync(10)
      const hashedPassword = bcrypt.hashSync(newPassword, salt)

      await usersCollection.updateOne({email: email}, {$set: {password: hashedPassword}})

      const transporter = nodemailer.createTransport({
        host: "mail.thehartattack.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.EMAILPASS
        },
        tls: {
          rejectUnauthorized: false
        }
      })

      const mailOptions = {
        from: process.env.EMAIL,
        to: email,
        subject: `Your new ${process.env.SITENAME} password`,
        text: newPassword,
        html: `
        Your new password is: <strong>${newPassword}</strong>
        `
      }

      const info = await transporter.sendMail(mailOptions)
      resolve()
    } catch (e) {
      console.log(e)
      reject(e)
    }
  })
}

User.loadMoreReviews = function (userId, offset) {
  return new Promise(async (resolve, reject) => {
    //Validate user ID
    if (typeof userId != "string" || !ObjectID.isValid(userId)) {
      reject("Invalid user ID.")
      return
    }

    const reviews = await reviewsCollection
      .aggregate([
        {$match: {author: new ObjectID(userId)}},

        {
          $lookup: {
            from: "albums",
            let: {album: "$album"},
            pipeline: [
              {$match: {$expr: {$eq: ["$$album", "$_id"]}}},
              {
                $lookup: {
                  from: "artists",
                  let: {artist: "$artist"},
                  pipeline: [
                    {$match: {$expr: {$eq: ["$$artist", "$_id"]}}},
                    {
                      $project: {
                        _id: true,
                        name: true,
                        slug: true,
                        image: true
                      }
                    }
                  ],
                  as: "artist"
                }
              },
              {
                $project: {
                  _id: true,
                  title: true,
                  slug: true,
                  image: true,
                  releaseDate: true,
                  label: true,
                  artist: {$arrayElemAt: ["$artist", 0]}
                }
              }
            ],
            as: "album"
          }
        },
        {
          $project: {
            _id: true,
            title: true,
            summary: true,
            review: true,
            rating: true,
            author: true,
            date: true,
            tags: true,
            album: {$arrayElemAt: ["$album", 0]}
          }
        },
        {$sort: {date: -1}},
        {$skip: offset},
        {$limit: reviewCount + 1}
      ])
      .toArray()

    //Check if more reviews
    let moreReviews
    if (reviews.length > reviewCount) {
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

User.getTopUsers = function (offset, resultCount) {
  return new Promise(async function (resolve, reject) {
    let users = await usersCollection
      .aggregate([
        {
          $lookup: {
            from: "likes",
            localField: "_id",
            foreignField: "author",
            as: "likes"
          }
        },

        {
          $project: {
            _id: true,
            username: true,
            slug: true,
            image: true,
            likes: {$size: "$likes"}
          }
        },

        {$sort: {likes: -1}},
        {$skip: offset},
        {$limit: resultCount + 1}
      ])
      .toArray()

    //Check if more users
    let moreUsers
    if (users.length > resultCount) {
      moreUsers = true
      users.pop()
    } else {
      moreUsers = false
    }

    if (users) {
      resolve({
        users,
        moreUsers
      })
    } else {
      reject("Error")
    }
  })
}

User.search = function (searchTerm) {
  return new Promise(async (resolve, reject) => {
    //Check search term is a string
    if (typeof searchTerm != "string") {
      reject()
      return
    }

    //Find users in database
    const users = await usersCollection
      .aggregate([
        {
          $match: {username: {$regex: searchTerm, $options: "i"}}
        },

        {
          $lookup: {
            from: "likes",
            localField: "_id",
            foreignField: "author",
            as: "likes"
          }
        },

        {
          $project: {
            username: true,
            slug: true,
            image: true,
            likes: {$size: "$likes"}
          }
        }
      ])
      .toArray()

    if (users) {
      resolve(users)
    } else {
      resolve([])
    }
  })
}

User.contactAdmin = function (message) {
  return new Promise(async (resolve, reject) => {
    try {
      if (typeof message.username != "string") {
        reject("Invalid username.")
        return
      }
      if (typeof message.email != "string") {
        reject("Invalid email.")
        return
      }
      if (typeof message.content != "string") {
        reject("Invalid message.")
        return
      }

      const transporter = nodemailer.createTransport({
        host: "mail.thehartattack.com",
        port: 465,
        secure: true,
        auth: {
          user: process.env.EMAIL,
          pass: process.env.EMAILPASS
        },
        tls: {
          rejectUnauthorized: false
        }
      })

      const mailOptions = {
        from: `${message.username} <${message.email}>`,
        to: "thehartattack@hotmail.co.uk",
        subject: `Message from ${process.env.SITENAME} user - ${message.username} [${message.email}]`,
        text: message.content,
        html: `
          ${message.content}
          <br />
          <br />
          <strong>${message.username}</strong>
          <br />
          ${message.email}
        `
      }

      const info = await transporter.sendMail(mailOptions)
      resolve(info)
    } catch (e) {
      console.log(e)
      reject(e)
    }
  })
}

module.exports = User
