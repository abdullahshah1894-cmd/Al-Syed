const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const { requireAuth, requireAdmin } = require("../middleware/auth");

router.post("/login", authController.login);
router.post("/password", requireAuth, authController.changePassword);
router.get("/users", requireAuth, requireAdmin, authController.getUsers);
router.post("/users", requireAuth, requireAdmin, authController.createUser);

module.exports = router;
