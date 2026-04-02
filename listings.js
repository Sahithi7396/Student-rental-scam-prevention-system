/**
 * routes/listings.js
 * GET  /api/listings          – list all (with optional filters)
 * GET  /api/listings/:id      – get single listing with trust score
 * POST /api/listings          – create listing
 * PUT  /api/listings/:id      – update listing
 * DELETE /api/listings/:id    – delete listing
 */

const express = require("express");
const router  = express.Router();
const { v4: uuidv4 } = require("crypto").randomUUID ? { v4: () => require("crypto").randomUUID() } : { v4: () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36) };
const db      = require("./db");
const { validate, sanitize } = require("./validate");

// ── Trust score calculation (mirrors frontend logic) ─────────────────────────
function calcTrustScore(listing) {
  const reviews = db.prepare(`
    SELECT rating, scam_flag FROM reviews
    WHERE LOWER(property) = LOWER(?) AND LOWER(city) = LOWER(?)
  `).all(listing.name, listing.city);

  const reports = db.prepare(`
    SELECT id FROM reports
    WHERE LOWER(city) = LOWER(?)
    AND (LOWER(property) LIKE ? OR LOWER(landlord) = LOWER(?))
  `).all(listing.city, `%${(listing.area || "").toLowerCase()}%`, listing.landlord || "");

  const avgRating = reviews.length
    ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
    : 3;

  const ratingScore   = (avgRating / 5) * 35;
  const reviewScore   = Math.min(reviews.length * 5, 25);
  const reportPenalty = Math.min(reports.length * 20, 50);
  const scamPenalty   = reviews.filter(r => r.scam_flag).length * 15;

  const fields = [listing.name, listing.area, listing.city, listing.rent, listing.landlord, listing.contact, listing.amenities];
  const completeness   = fields.filter(Boolean).length / fields.length;
  const completeScore  = completeness * 25;

  const score = Math.round(ratingScore + reviewScore + completeScore - reportPenalty - scamPenalty);
  return Math.max(0, Math.min(100, score));
}

function trustLabel(score) {
  if (score >= 70) return "High Trust";
  if (score >= 40) return "Moderate";
  return "Low Trust";
}

// ── GET /api/listings ─────────────────────────────────────────────────────────
router.get("/", (req, res) => {
  try {
    const { city, type, search, limit = 50, offset = 0 } = req.query;

    let query = "SELECT * FROM listings WHERE 1=1";
    const params = [];

    if (city) {
      query += " AND (LOWER(city) LIKE ? OR LOWER(area) LIKE ?)";
      params.push(`%${city.toLowerCase()}%`, `%${city.toLowerCase()}%`);
    }
    if (type && ["pg","flat","room"].includes(type)) {
      query += " AND type = ?";
      params.push(type);
    }
    if (search) {
      query += " AND (LOWER(name) LIKE ? OR LOWER(area) LIKE ? OR LOWER(landlord) LIKE ?)";
      const s = `%${search.toLowerCase()}%`;
      params.push(s, s, s);
    }

    query += " ORDER BY created_at DESC LIMIT ? OFFSET ?";
    params.push(Number(limit), Number(offset));

    const listings = db.prepare(query).all(...params);

    // Attach trust score and report flag to each listing
    const reportedNames = db.prepare("SELECT LOWER(landlord) as l FROM reports").all().map(r => r.l);

    const enriched = listings.map(l => ({
      ...l,
      trust_score: calcTrustScore(l),
      trust_label: trustLabel(calcTrustScore(l)),
      is_reported: reportedNames.includes((l.landlord || "").toLowerCase()),
    }));

    const total = db.prepare("SELECT COUNT(*) as cnt FROM listings").get().cnt;

    res.json({ success: true, total, data: enriched });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch listings." });
  }
});

// ── GET /api/listings/:id ─────────────────────────────────────────────────────
router.get("/:id", (req, res) => {
  try {
    const listing = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id);
    if (!listing) return res.status(404).json({ success: false, message: "Listing not found." });

    const reviews = db.prepare(
      "SELECT * FROM reviews WHERE LOWER(property) = LOWER(?) ORDER BY created_at DESC"
    ).all(listing.name);

    res.json({
      success: true,
      data: {
        ...listing,
        trust_score: calcTrustScore(listing),
        trust_label: trustLabel(calcTrustScore(listing)),
        reviews,
      },
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to fetch listing." });
  }
});

// ── POST /api/listings ────────────────────────────────────────────────────────
router.post(
  "/",
  validate({ name: "string", area: "string", city: "string", type: "listing_type", rent: "number" }),
  (req, res) => {
    try {
      const id = uuidv4();
      const stmt = db.prepare(`
        INSERT INTO listings (id, name, area, city, type, rent, advance, landlord, contact, amenities)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        sanitize(req.body.name, 200),
        sanitize(req.body.area, 200),
        sanitize(req.body.city, 100),
        req.body.type,
        Number(req.body.rent),
        req.body.advance ? Number(req.body.advance) : null,
        sanitize(req.body.landlord || "", 200),
        sanitize(req.body.contact || "", 20),
        sanitize(req.body.amenities || "", 500)
      );

      const created = db.prepare("SELECT * FROM listings WHERE id = ?").get(id);
      res.status(201).json({ success: true, data: created });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false, message: "Failed to create listing." });
    }
  }
);

// ── PUT /api/listings/:id ─────────────────────────────────────────────────────
router.put("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Listing not found." });

    const fields = ["name","area","city","type","rent","advance","landlord","contact","amenities"];
    const updates = [];
    const values  = [];

    fields.forEach(f => {
      if (req.body[f] !== undefined) {
        updates.push(`${f} = ?`);
        values.push(f === "rent" || f === "advance" ? Number(req.body[f]) : sanitize(req.body[f], 500));
      }
    });

    if (updates.length === 0)
      return res.status(400).json({ success: false, message: "No valid fields to update." });

    values.push(req.params.id);
    db.prepare(`UPDATE listings SET ${updates.join(", ")} WHERE id = ?`).run(...values);

    const updated = db.prepare("SELECT * FROM listings WHERE id = ?").get(req.params.id);
    res.json({ success: true, data: updated });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to update listing." });
  }
});

// ── DELETE /api/listings/:id ──────────────────────────────────────────────────
router.delete("/:id", (req, res) => {
  try {
    const existing = db.prepare("SELECT id FROM listings WHERE id = ?").get(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: "Listing not found." });

    db.prepare("DELETE FROM listings WHERE id = ?").run(req.params.id);
    res.json({ success: true, message: "Listing deleted." });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to delete listing." });
  }
});

// ── GET /api/listings/trust/leaderboard ───────────────────────────────────────
router.get("/trust/leaderboard", (req, res) => {
  try {
    const listings = db.prepare("SELECT * FROM listings ORDER BY created_at DESC").all();
    const scored   = listings
      .map(l => ({ ...l, trust_score: calcTrustScore(l), trust_label: trustLabel(calcTrustScore(l)) }))
      .sort((a, b) => b.trust_score - a.trust_score)
      .slice(0, 10);

    res.json({ success: true, data: scored });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Failed to get leaderboard." });
  }
});

module.exports = router;
