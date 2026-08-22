import express from "express";
import { getDashboardStats } from "../controllers/dashboardController.js";
import { requireAuth, requireRole } from "../middleware/auth.js";

const router = express.Router();

router.get("/", requireAuth, requireRole("admin"), getDashboardStats);

export default router;
