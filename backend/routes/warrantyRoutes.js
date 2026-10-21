const express = require("express");
const router = express.Router();
const warrantyController = require("../controllers/warrantyController");

router.get("/", warrantyController.getWarranties);
router.get("/:imei", warrantyController.getWarrantyByImei);
router.post("/:imei/claims", warrantyController.addClaim);

module.exports = router;
