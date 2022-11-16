const aws = require("aws-sdk")
const multer = require("multer")
const multerS3 = require("multer-s3-transform")
const sharp = require("sharp")
const path = require("path")
const slugify = require("slugify")

aws.config.update({
  secretAccessKey: process.env.SECRETACCESSKEY,
  accessKeyId: process.env.ACCESSKEYID,
  region: "eu-west-2"
})

const s3 = new aws.S3()

const fileFilter = (req, file, cb) => {
  if (file.mimetype == "image/jpeg" || file.mimetype == "image/jpg" || file.mimetype == "image/png") {
    cb(null, true)
  } else {
    cb(new Error("Invalid file type - must be JPG or PNG"), false)
  }
}

const fileTransform = (req, file, cb) => {
  if (req.header.filePath == "user") {
    cb(null, sharp().rotate().resize(250, 250).jpeg({quality: 100}))
  } else {
    if (req.header.ratio) {
      cb(
        null,
        sharp()
          .rotate()
          .resize(500 * req.header.ratio, 500)
          .jpeg({quality: 100})
      )
    } else {
      cb(null, sharp().rotate().resize(500, 500).jpeg({quality: 100}))
    }
  }
}

const filePath = (req, file) => {
  let filePath
  let fileSubpath = ""

  if (req.body.name) {
    fileSubpath = `${slugify(req.body.name, {
      lower: true,
      strict: true
    })}`
  } else if (req.body.title) {
    fileSubpath = `${slugify(req.body.title, {
      lower: true,
      strict: true
    })}`
  }

  if (req.header.filePath) {
    if (fileSubpath) {
      filePath = `${req.header.filePath}/${fileSubpath}`
    } else {
      filePath = `${req.header.filePath}`
    }
  } else if (fileSubpath) {
    filePath = fileSubpath
  } else {
    filePath = "uploads"
  }

  filePath = `${filePath}/${Date.now().toString()}${path.extname(file.originalname)}`

  return filePath
}

const upload = multer({
  limits: {
    fileSize: 1024 * 1024 * 3
  },
  fileFilter,
  storage: multerS3({
    s3,
    bucket: "viberates",
    acl: "public-read",
    contentType: "image/jpeg",
    shouldTransform: function (req, file, cb) {
      cb(null, /^image/i.test(file.mimetype))
    },
    transforms: [
      {
        id: "original",
        key: function (req, file, cb) {
          cb(null, filePath(req, file))
        },
        transform: fileTransform
      }
    ]
  })
})

module.exports = upload
