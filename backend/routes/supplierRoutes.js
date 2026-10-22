const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/supplierController");

router.get("/", ctrl.getSuppliers);
router.post("/", ctrl.createSupplier);
router.put("/transactions/:txId", ctrl.updateTransaction);
router.delete("/transactions/:txId", ctrl.deleteTransaction);
router.put("/:id", ctrl.updateSupplier);
router.delete("/:id", ctrl.deleteSupplier);
router.post("/:id/purchases", ctrl.addPurchase);
router.post("/:id/payments", ctrl.addPayment);

module.exports = router;
