import express from "express";
import { signup, login, getProfile } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", requireAuth, getProfile);

export default router;
