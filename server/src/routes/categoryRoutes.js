import express from "express";
import { getCategories } from "../controllers/categoryController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();
router.get("/", requireAuth, getCategories);

export default router;
