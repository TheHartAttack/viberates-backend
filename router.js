const router = require("express").Router()
const userController = require("./controllers/userController")
const artistController = require("./controllers/artistController")
const albumController = require("./controllers/albumController")
const reviewController = require("./controllers/reviewController")
const likeController = require("./controllers/likeController")
const commentController = require("./controllers/commentController")
const commentLikeController = require("./controllers/commentLikeController")
const searchController = require("./controllers/searchController")
const chatController = require("./controllers/chatController")
const cors = require("cors")

router.use(cors())

router.get("/", (req, res) => res.json("Hello, if you see this message that means your backend is up and running successfully. Congrats! Now let's continue learning React!"))

//Page routes
router.get("/home", userController.getHome)
router.post("/hot-albums", userController.getHotAlbums)
router.post("/top-rated", userController.getTopRated)
router.post("/new-releases", userController.getNewReleases)
router.post("/top-users", userController.getTopUsers)
router.post("/recent-reviews", userController.getRecentReviews)
router.post("/tag/:tagSlug", userController.getTag, albumController.getAlbumsByTag)
router.post("/search", searchController.search)

//User routes
router.post("/checkToken", userController.checkToken)
router.post("/register", userController.register)
router.post("/login", userController.login)
router.post("/doesUsernameExist", userController.doesUsernameExist)
router.post("/doesEmailExist", userController.doesEmailExist)
router.get("/user/:userSlug", userController.getUserBySlug)
router.post("/user/:userId/load-reviews", userController.loadMoreReviews)
router.post("/mod/:userSlug", userController.isLoggedIn, userController.isAdmin, userController.targetNotAdmin, userController.handleMod)
router.post("/suspend/:userSlug", userController.isLoggedIn, userController.isNotSuspended, userController.isAdminOrMod, userController.targetNotAdmin, userController.targetNotUser, userController.handleSuspend)
router.post("/edit/user/:userId/image", userController.isLoggedIn, userController.isTargetUser, userController.uploadImage)
router.delete("/edit/user/:userId/image", userController.isLoggedIn, userController.isTargetUser, userController.deleteImage)
router.post("/edit/user/:userId/password", userController.isLoggedIn, userController.isTargetUser, userController.changePassword)
router.post("/reset-password", userController.resetPassword)
router.post("/contact", userController.contact)

//Artist routes
router.post("/add-artist", userController.isLoggedIn, userController.isNotSuspended, artistController.uploadImage, artistController.addArtist)
router.post("/edit/artist/:artist", userController.isLoggedIn, userController.isNotSuspended, artistController.uploadImage, artistController.editArtist)
router.get("/artist/:artist", artistController.getArtistBySlug)
router.post("/edit-history/artist/:artist", artistController.getArtistEditHistory)
router.post("/revert/artist", userController.isLoggedIn, userController.isNotSuspended, artistController.revertEdit)

//Album routes
router.post("/add-album/:artist", userController.isLoggedIn, userController.isNotSuspended, albumController.uploadImage, albumController.addAlbum)
router.post("/edit/artist/:artist/album/:album", userController.isLoggedIn, userController.isNotSuspended, albumController.uploadImage, albumController.editAlbum)
router.get("/artist/:artist/album/:album", albumController.getAlbumBySlug)
router.post("/edit-history/artist/:artist/album/:album", albumController.getAlbumEditHistory)
router.post("/revert/album", userController.isLoggedIn, userController.isNotSuspended, albumController.revertEdit)
router.post("/deleteAlbum", userController.isLoggedIn, userController.isNotSuspended, userController.isAdminOrMod, albumController.deleteAlbum)

//Review routes
router.post("/add-review/:artist/:album", userController.isLoggedIn, userController.isNotSuspended, reviewController.addReview)
router.post("/edit/artist/:artist/album/:album/review/:review", userController.isLoggedIn, userController.isNotSuspended, reviewController.isUserAuthor, reviewController.editReview)
router.get("/artist/:artist/album/:album/review/:review", reviewController.getReviewById)

//Like routes
router.post("/like/review/:review/:author", userController.isLoggedIn, likeController.handleLike)

//Comment routes
router.post("/add-comment/:review", userController.isLoggedIn, userController.isNotSuspended, commentController.addComment)
router.post("/edit-comment/comment/:comment", userController.isLoggedIn, userController.isNotSuspended, commentController.isUserAuthor, commentController.editComment)

//Comment like routes
router.post("/like/comment/:comment", userController.isLoggedIn, commentLikeController.handleCommentLike)

//Chat routes
router.post("/load-chat", userController.isLoggedIn, chatController.loadChat)

module.exports = router
