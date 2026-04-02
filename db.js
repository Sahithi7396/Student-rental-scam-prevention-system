/**
 * db.js – SQLite database initialisation using better-sqlite3
 * Creates tables on first run. All queries are synchronous (better-sqlite3 style).
 */

const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname,  "safenest.db");
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ─── Schema ────────────────────────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS listings (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    area        TEXT NOT NULL,
    city        TEXT NOT NULL,
    type        TEXT NOT NULL CHECK(type IN ('pg','flat','room')),
    rent        REAL NOT NULL,
    advance     REAL,
    landlord    TEXT,
    contact     TEXT,
    amenities   TEXT,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS reviews (
    id          TEXT PRIMARY KEY,
    property    TEXT NOT NULL,
    area        TEXT NOT NULL,
    city        TEXT NOT NULL,
    author      TEXT NOT NULL DEFAULT 'Anonymous',
    rating      INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
    review_text TEXT NOT NULL,
    scam_flag   INTEGER NOT NULL DEFAULT 0,
    upvotes     INTEGER NOT NULL DEFAULT 0,
    downvotes   INTEGER NOT NULL DEFAULT 0,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS reports (
    id          TEXT PRIMARY KEY,
    landlord    TEXT NOT NULL,
    property    TEXT NOT NULL,
    city        TEXT NOT NULL,
    contact     TEXT,
    scam_type   TEXT NOT NULL,
    description TEXT NOT NULL,
    reporter    TEXT NOT NULL DEFAULT 'Anonymous',
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000)
  );

  CREATE TABLE IF NOT EXISTS votes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    review_id   TEXT NOT NULL,
    direction   TEXT NOT NULL CHECK(direction IN ('up','down')),
    voter_ip    TEXT NOT NULL,
    created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now') * 1000),
    UNIQUE(review_id, voter_ip, direction)
  );

  CREATE INDEX IF NOT EXISTS idx_listings_city  ON listings(city);
  CREATE INDEX IF NOT EXISTS idx_reviews_prop   ON reviews(property);
  CREATE INDEX IF NOT EXISTS idx_reports_city   ON reports(city);
`);

// ─── Seed demo data (only once) ────────────────────────────────────────────

const seedCheck = db.prepare("SELECT COUNT(*) as cnt FROM listings").get();
if (seedCheck.cnt === 0) {
  const insertListing = db.prepare(`
    INSERT INTO listings (id, name, area, city, type, rent, advance, landlord, contact, amenities)
    VALUES (@id, @name, @area, @city, @type, @rent, @advance, @landlord, @contact, @amenities)
  `);
  const insertReview = db.prepare(`
    INSERT INTO reviews (id, property, area, city, author, rating, review_text, scam_flag, upvotes, downvotes)
    VALUES (@id, @property, @area, @city, @author, @rating, @review_text, @scam_flag, @upvotes, @downvotes)
  `);
  const insertReport = db.prepare(`
    INSERT INTO reports (id, landlord, property, city, contact, scam_type, description, reporter)
    VALUES (@id, @landlord, @property, @city, @contact, @scam_type, @description, @reporter)
  `);

  const seedAll = db.transaction(() => {
    insertListing.run({ id: "demo1", name: "Sunrise PG for Girls",    area: "Ameerpet",  city: "Hyderabad", type: "pg",   rent: 6500,  advance: 13000, landlord: "Suresh Reddy",   contact: "9876543210", amenities: "WiFi, 2 meals, AC rooms, laundry" });
    insertListing.run({ id: "demo2", name: "Ravi's Boys Hostel",      area: "Madhapur",  city: "Hyderabad", type: "pg",   rent: 5500,  advance: 11000, landlord: "Ravi Kumar",      contact: "9123456789", amenities: "WiFi, non-AC, 3 meals" });
    insertListing.run({ id: "demo3", name: "Green View 2BHK",         area: "Kondapur",  city: "Hyderabad", type: "flat", rent: 18000, advance: 54000, landlord: "Lakshmi Devi",    contact: "9988776655", amenities: "Parking, power backup, semi-furnished" });
    insertListing.run({ id: "demo4", name: "Student Stay Rooms",      area: "Manipal",   city: "Manipal",   type: "room", rent: 4800,  advance: 9600,  landlord: "Peter D'Souza",   contact: "8765432109", amenities: "WiFi, study table, common kitchen" });
    insertListing.run({ id: "demo5", name: "Kalyani Ladies Hostel",   area: "Kothrud",   city: "Pune",      type: "pg",   rent: 7200,  advance: 14400, landlord: "Kalyani Patil",   contact: "9011223344", amenities: "Meals, WiFi, CCTV, geyser" });

    insertReview.run({ id: "rv1", property: "Sunrise PG for Girls", area: "Ameerpet", city: "Hyderabad", author: "Priya S.",       rating: 4, review_text: "Good facilities, food is decent. Owner is cooperative but a bit slow on repairs. Overall safe and well-managed.", scam_flag: 0, upvotes: 5,  downvotes: 0 });
    insertReview.run({ id: "rv2", property: "Ravi's Boys Hostel",   area: "Madhapur", city: "Hyderabad", author: "Kiran M.",       rating: 2, review_text: "Paid 3 months advance. The room condition was nothing like the photos shown. Owner became unreachable after payment. Not recommended.", scam_flag: 1, upvotes: 12, downvotes: 1 });
    insertReview.run({ id: "rv3", property: "Green View 2BHK",      area: "Kondapur", city: "Hyderabad", author: "Arjun & Sai",   rating: 5, review_text: "Excellent apartment, very clean. Landlord provided a proper registered agreement. Quick to address any issues. Highly recommend.", scam_flag: 0, upvotes: 8,  downvotes: 0 });

    insertReport.run({ id: "rp1", landlord: "Fake Properties Agency", property: "Non-existent flat, Jubilee Hills", city: "Hyderabad", contact: "9000000001", scam_type: "fake", description: "Posted a luxury 3BHK flat for ₹8000/month. Asked for ₹50,000 advance online. Property address does not exist. Multiple students targeted.", reporter: "Mohammed A." });
  });

  seedAll();
  console.log("✅ Demo data seeded into SQLite database.");
}

module.exports = db;


