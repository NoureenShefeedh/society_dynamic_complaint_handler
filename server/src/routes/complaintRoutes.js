import express from "express";
import {
  createComplaint,
  getMyComplaints,
  getAllComplaints,
  getComplaintById,
  updateComplaintStatus,
  confirmResolution,
  reopenComplaint,
  assignComplaint,
} from "../controllers/complaintController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";

const router = express.Router();

// Resident creates a complaint (with optional photo field named "photo")
router.post("/", requireAuth, requireRole("resident"), upload.single("photo"), createComplaint);

// Resident views their own complaints
router.get("/mine", requireAuth, requireRole("resident"), getMyComplaints);

// Admin views all complaints, with optional filters via query params
router.get("/", requireAuth, requireRole("admin"), getAllComplaints);

// Admin changes status (photo field "photo" required when resolving)
router.patch("/:id/status", requireAuth, requireRole("admin"), upload.single("photo"), updateComplaintStatus);

// Resident confirms or disputes a Resolved complaint
router.post("/:id/confirm", requireAuth, requireRole("resident"), confirmResolution);
router.post("/:id/reopen", requireAuth, requireRole("resident"), reopenComplaint);
router.patch("/:id/assign", requireAuth, requireRole("admin"), assignComplaint);

// Either role can view a single complaint (ownership checked inside controller)
router.get("/:id", requireAuth, getComplaintById);

export default router;
