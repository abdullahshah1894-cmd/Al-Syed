const express = require("express");
const router = express.Router();
const productController = require("../controllers/productController");

router.get("/", productController.getProducts);
router.get("/search/:query", productController.searchByImei);
router.post("/", productController.createProduct);
router.put("/:id", productController.updateProduct);
router.post("/:id/stock", productController.addStock);
router.delete("/:id", productController.deleteProduct);

module.exports = router;
