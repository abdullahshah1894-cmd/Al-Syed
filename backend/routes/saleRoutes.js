const express = require("express");
const router = express.Router();
const saleController = require("../controllers/saleController");

router.get("/", saleController.getSales);
router.post("/", saleController.createSale);
router.get("/analytics", saleController.getAnalytics);

module.exports = router;
