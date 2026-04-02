/**
 * server.js – SafeNest Express Server
 *
 * Endpoints:
 *   GET/POST/PUT/DELETE  /api/listings
 *   GET                  /api/listings/trust/leaderboard
 *   GET                  /api/listings/:id
 *   GET/POST/DELETE      /api/reviews
 *   POST                 /api/reviews/:id/vote
 *   GET/POST/DELETE      /api/reports
 *   GET                  /api/reports/stats
 *   GET                  /api/health
 *
 * Static frontend is served from ../frontend/
 */

"use strict";

const express    = require("express");
const cors       = require("cors");
const helmet     = require("helmet");
const path       = require("path");
const rateLimit  = require("express-rate-limit");

// ── Import routes ─────────────────────────────────────────────────────────────
const listingsRouter = require("./listings");
const reviewsRouter  = require("./reviews");
const reportsRouter  = require("./reports");

// ── Initialise DB (runs migrations & seed on first start) ─────────────────────
require("./db");

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Security & parsing middleware ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false // disabled so frontend inline scripts work during dev
}));

app.use(cors({
  origin: ["http://localhost:3000", "http://127.0.0.1:3000"],
  methods: ["GET", "POST", "PUT", "DELETE"],
}));

app.use(express.json({ limit: "50kb" }));
app.use(express.urlencoded({ extended: true }));

// ── Rate limiting ─────────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many requests. Please try again later." },
});

const writeLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 20,
  message: { success: false, message: "Too many submissions. Please slow down." },
});

app.use("/api", apiLimiter);
app.use("/api/listings", (req, res, next) => {
  if (["POST","PUT","DELETE"].includes(req.method)) return writeLimiter(req, res, next);
  next();
});
app.use("/api/reviews", (req, res, next) => {
  if (["POST","DELETE"].includes(req.method)) return writeLimiter(req, res, next);
  next();
});
app.use("/api/reports", (req, res, next) => {
  if (["POST","DELETE"].includes(req.method)) return writeLimiter(req, res, next);
  next();
});

// ── API Routes ────────────────────────────────────────────────────────────────
// NOTE: /trust/leaderboard must come BEFORE /:id to avoid route conflict
app.use("/api/listings", listingsRouter);
app.use("/api/reviews",  reviewsRouter);
app.use("/api/reports",  reportsRouter);

// ── Health check ──────────────────────────────────────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: Math.floor(process.uptime()) + "s",
  });
});

// ── Serve static frontend ─────────────────────────────────────────────────────
const FRONTEND_DIR = __dirname;
app.use(express.static(FRONTEND_DIR));

// SPA fallback – serve index.html for any non-API route
app.get(/^(?!\/api).*/, (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, "index.html"));
});

// ── Global error handler ──────────────────────────────────────────────────────
app.use((err, req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ success: false, message: "Internal server error." });
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`\n🛡️  SafeNest server running at http://localhost:${PORT}`);
  console.log(`   API base : http://localhost:${PORT}/api`);
  console.log(`   Frontend : http://localhost:${PORT}\n`);
});

module.exports = app;

