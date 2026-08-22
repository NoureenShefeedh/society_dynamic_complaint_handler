import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import pool from "./db/pool.js";
import authRoutes from "./routes/authRoutes.js";
import complaintRoutes from "./routes/complaintRoutes.js";
import noticeRoutes from "./routes/noticeRoutes.js";
import dashboardRoutes from "./routes/dashboardRoutes.js";
import categoryRoutes from "./routes/categoryRoutes.js";

dotenv.config();

const app = express();
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));
app.use(express.json());

// Health check — deliberately queries the DB so an uptime pinger hitting
// this route keeps the Supabase free-tier project from auto-pausing.
app.get("/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", db: "connected", time: new Date().toISOString() });
  } catch (err) {
    console.error("Health check DB error:", err.message);
    res.status(500).json({ status: "error", db: "unreachable" });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/complaints", complaintRoutes);
app.use("/api/notices", noticeRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/categories", categoryRoutes);

const PORT = process.env.PORT || 5000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
});
