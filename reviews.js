/**
 * routes/reviews.js
 * GET  /api/reviews            – list reviews (filter by property/city)
 * POST /api/reviews            – add a review
 * POST /api/reviews/:id/vote   – upvote or downvote
 * DELETE /api/reviews/:id      – delete a review
 */

const express = require("express");
const router  = express.Router();
const db      = require("./db");
const { validate, sanitize } = require("./validate");

// ── GET /api/reviews ──────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  try {
    const { property, city, scam_only, limit = 50, offset = 0 } = req.query;

    let query  = "SELECT * FROM reviews WHERE 1=1";
    const params = [];

    if (property) {
      query += " AND LOWER(property) LIKE ?";
      params.push(`%${property.toLowerCase()}%`);
    }
    if (city) {
      query += " AND LOWER(city) LIKE ?";
      params.push(`%${city.toLowerCase()}%`);
    }
    if (scam_only === "true") {
      query += " AND scam_flag = 1";
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));

    const reviews = db.prepare(query).all(...params);
    const total   = db.prepare("SELECT COUNT(*) as cnt FROM reviews").get().cnt;

    res.json({ success: true, total, data: reviews });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch reviews." });
  }
});

// ── POST /api/reviews ─────────────────────────────────────────────────────────
router.post(
  "/",
  validate({
    property:    "string",
    area:        "string",
    review_text: "string",
    rating:      "rating",
  }),
  (req, res) => {
    try {
      const id = require("crypto").randomUUID();

      db.prepare(`
        INSERT INTO reviews (id, property, area, city, author, rating, review_text, scam_flag)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        sanitize(req.body.property, 200),
        sanitize(req.body.area, 200),
        sanitize(req.body.city || "", 100),
        sanitize(req.body.author || "Anonymous", 100),
        Number(req.body.rating),
        sanitize(req.body.review_text, 2000),
        req.body.scam_flag ? 1 : 0
      );

      const created = db.prepare("SELECT * FROM reviews WHERE id = ?").get(id);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Failed to add review." });
    }
  }
);

// ── POST /api/reviews/:id/vote ────────────────────────────────────────────────
router.post("/:id/vote", (req, res) => {
  try {
    const { direction } = req.body;
    if (!["up", "down"].includes(direction)) {
      return res.status(400).json({ success: false, message: "direction must be 'up' or 'down'." });
    }

    const review = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
    if (!review) return res.status(404).json({ success: false, message: "Review not found." });

    // Use IP to prevent repeat votes
    const voterIp = req.ip || req.connection.remoteAddress || "unknown";

    const existing = db.prepare(
      "SELECT id FROM votes WHERE review_id = ? AND voter_ip = ? AND direction = ?"
    ).get(req.params.id, voterIp, direction);

    if (existing) {
      return res.status(409).json({ success: false, message: "You have already voted on this review." });
    }

    // Record vote
    db.prepare(
      "INSERT INTO votes (review_id, direction, voter_ip) VALUES (?, ?, ?)"
    ).run(req.params.id, direction, voterIp);

    // Update count
    const col = direction === "up" ? "upvotes" : "downvotes";
    db.prepare(`UPDATE reviews SET ${col} = ${col} + 1 WHERE id = ?`).run(req.params.id);

    const updated = db.prepare("SELECT * FROM reviews WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to record vote." });
  }
});

// ── DELETE /api/reviews/:id ───────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT id FROM reviews WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Review not found." });

    db.prepare("DELETE FROM votes   WHERE review_id = ?").run(req.params.id);
    db.prepare("DELETE FROM reviews WHERE id = ?").run(req.params.id);

    res.json({ success: true, message: "Review deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete review." });
  }
});

module.exports = router;
