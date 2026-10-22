const express = require("express");
const router = express.Router();
const saleController = require("../controllers/saleController");

router.get("/", saleController.getSales);
router.post("/", saleController.createSale);
router.get("/analytics", saleController.getAnalytics);
router.post("/:id/returns", saleController.returnItems);
router.put("/:id", saleController.updateSale);
router.delete("/:id", saleController.deleteSale);

module.exports = router;
