import express from "express";
import {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  getComplaintById,
} from "../controllers/complaintController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

router.post("/", requireAuth, requireRole("resident"), upload.single("photo"), createComplaint);
router.get("/mine", requireAuth, requireRole("resident"), getMyComplaints);
router.get("/", requireAuth, requireRole("admin"), getAllComplaints);
router.get("/:id", requireAuth, getComplaintById);

export default router;