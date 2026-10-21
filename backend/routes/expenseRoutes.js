const express = require("express");
const router = express.Router();
const ctrl = require("../controllers/expenseController");

router.get("/", ctrl.getExpenses);
router.post("/", ctrl.createExpense);
router.put("/:id", ctrl.updateExpense);
router.delete("/:id", ctrl.deleteExpense);

module.exports = router;
