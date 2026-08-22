import express from "express";
import { createNotice, getNotices } from "../controllers/noticeController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.post("/", requireAuth, requireRole("admin"), createNotice);
router.get("/", requireAuth, getNotices);

export default router;
