const express = require("express");
const { getIssues, createIssue, updateIssueStatus, deleteIssue } = require("../controllers/issueController");

const router = express.Router();

router.get("/", getIssues);
router.post("/", createIssue);
router.put("/:id/status", updateIssueStatus);
router.delete("/:id", deleteIssue);

module.exports = router;
