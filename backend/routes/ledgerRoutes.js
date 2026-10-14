const express = require("express");
const router = express.Router();
const ledgerController = require("../controllers/ledgerController");

router.get("/", ledgerController.getLedgerEntries);
router.post("/", ledgerController.addLedgerEntry);
router.delete("/:id", ledgerController.deleteLedgerEntry);

module.exports = router;
