import nodemailer from "nodemailer";
import dotenv from "dotenv";
dotenv.config();

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: false,
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_APP_PASSWORD },
});

// Fails silently (logs only) so a broken email config never breaks the
// actual complaint/notice flow — email is a notification, not a dependency.
export async function sendEmail(to, subject, text) {
  if (!process.env.EMAIL_USER || !process.env.EMAIL_APP_PASSWORD) {
    console.warn("Email not configured, skipping send to:", to);
    return;
  }
  try {
    await transporter.sendMail({ from: process.env.EMAIL_FROM, to, subject, text });
  } catch (err) {
    console.warn("Email send failed:", err.message);
  }
}
