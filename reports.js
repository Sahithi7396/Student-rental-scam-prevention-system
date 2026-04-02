/**
 * routes/reports.js
 * GET  /api/reports         – list all reports (filter by city/landlord)
 * POST /api/reports         – file a new scam report
 * GET  /api/reports/stats   – summary stats
 * DELETE /api/reports/:id   – remove a report
 */

const express = require("express");
const router  = express.Router();
const db      = require("./db");
const { validate, sanitize } = require("./validate");

// ── GET /api/reports ──────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  try {
    const { city, landlord, scam_type, limit = 50, offset = 0 } = req.query;

    let query  = "SELECT * FROM reports WHERE 1=1";
    const params = [];

    if (city) {
      query += " AND LOWER(city) LIKE ?";
      params.push(`%${city.toLowerCase()}%`);
    }
    if (landlord) {
      query += " AND LOWER(landlord) LIKE ?";
      params.push(`%${landlord.toLowerCase()}%`);
    }
    if (scam_type) {
      query += " AND scam_type = ?";
      params.push(scam_type);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));

    const reports = db.prepare(query).all(...params);
    const total   = db.prepare("SELECT COUNT(*) as cnt FROM reports").get().cnt;

    res.json({ success: true, total, data: reports });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch reports." });
  }
});

// ── GET /api/reports/stats ────────────────────────────────────────────────────
router.get("/stats", (req, res) => {
  try {
    const total      = db.prepare("SELECT COUNT(*) as cnt FROM reports").get().cnt;
    const byType     = db.prepare("SELECT scam_type, COUNT(*) as cnt FROM reports GROUP BY scam_type").all();
    const byCity     = db.prepare("SELECT city, COUNT(*) as cnt FROM reports GROUP BY city ORDER BY cnt DESC LIMIT 5").all();
    const totalRevs  = db.prepare("SELECT COUNT(*) as cnt FROM reviews").get().cnt;
    const scamRevs   = db.prepare("SELECT COUNT(*) as cnt FROM reviews WHERE scam_flag = 1").get().cnt;
    const totalList  = db.prepare("SELECT COUNT(*) as cnt FROM listings").get().cnt;

    res.json({
      success: true,
      data: {
        total_reports: total,
        total_reviews: totalRevs,
        scam_reviews:  scamRevs,
        total_listings: totalList,
        by_scam_type:  byType,
        top_cities:    byCity,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to get stats." });
  }
});

// ── POST /api/reports ─────────────────────────────────────────────────────────
router.post(
  "/",
  validate({
    landlord:    "string",
    property:    "string",
    city:        "string",
    scam_type:   "scam_type",
    description: "string",
  }),
  (req, res) => {
    try {
      const id = require("crypto").randomUUID();

      db.prepare(`
        INSERT INTO reports (id, landlord, property, city, contact, scam_type, description, reporter)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sanitize(req.body.landlord, 200),
        sanitize(req.body.property, 200),
        sanitize(req.body.city, 100),
        sanitize(req.body.contact || "", 50),
        req.body.scam_type,
        sanitize(req.body.description, 2000),
        sanitize(req.body.reporter || "Anonymous", 100)
      );

      const created = db.prepare("SELECT * FROM reports WHERE id = ?").get(id);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Failed to file report." });
    }
  }
);

// ── DELETE /api/reports/:id ───────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT id FROM reports WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Report not found." });

    db.prepare("DELETE FROM reports WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Report removed." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete report." });
  }
});

module.exports = router;
