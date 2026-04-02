# 🛡️ SafeNest – Student Rental Scam Prevention System

A full-stack web application that helps students detect rental scams, verify landlords, share community reviews, and report fraud.

---

## 📁 Project Structure

```
SafeNest/
├── frontend/
│   ├── index.html          ← Main UI
│   ├── style.css           ← Minimal green theme
│   └── script.js           ← API-connected frontend logic
├── backend/
│   ├── server.js           ← Express entry point
│   ├── db.js               ← SQLite schema + seed data
│   ├── routes/
│   │   ├── listings.js     ← Rental listings CRUD + trust score
│   │   ├── reviews.js      ← Reviews CRUD + voting
│   │   └── reports.js      ← Scam reports CRUD + stats
│   └── middleware/
│       └── validate.js     ← Input validation + sanitisation
├── package.json
├── safenest.db             ← Auto-created SQLite database
└── README.md
```

---

## 🚀 Quick Start

### 1. Install dependencies
```bash
npm install
```

### 2. Start the server
```bash
npm start
```
Or for live-reload during development:
```bash
npm run dev
```

### 3. Open in browser
```
http://localhost:3000
```

The frontend is served automatically. The SQLite database and demo data are created on first run.

---

## 🔌 API Reference

### Health
| Method | Endpoint       | Description        |
|--------|----------------|--------------------|
| GET    | /api/health    | Server health check|

### Listings
| Method | Endpoint                          | Description                     |
|--------|-----------------------------------|---------------------------------|
| GET    | /api/listings                     | List all (filter: city, type)   |
| GET    | /api/listings/:id                 | Get single listing + reviews    |
| GET    | /api/listings/trust/leaderboard   | Top listings by trust score     |
| POST   | /api/listings                     | Create new listing              |
| PUT    | /api/listings/:id                 | Update listing                  |
| DELETE | /api/listings/:id                 | Delete listing                  |

### Reviews
| Method | Endpoint                  | Description                  |
|--------|---------------------------|------------------------------|
| GET    | /api/reviews              | List all (filter: property)  |
| POST   | /api/reviews              | Add a review                 |
| POST   | /api/reviews/:id/vote     | Upvote / downvote            |
| DELETE | /api/reviews/:id          | Delete a review              |

### Reports
| Method | Endpoint         | Description                   |
|--------|------------------|-------------------------------|
| GET    | /api/reports     | List all scam reports         |
| GET    | /api/reports/stats | Summary statistics          |
| POST   | /api/reports     | File a new report             |
| DELETE | /api/reports/:id | Remove a report               |

---

## 🗃️ Database

- Uses **SQLite** via `better-sqlite3` — no external DB setup needed
- Database file: `safenest.db` (auto-created)
- Tables: `listings`, `reviews`, `reports`, `votes`
- Demo data seeded automatically on first run

---

## ⚙️ Environment Variables

| Variable | Default | Description        |
|----------|---------|--------------------|
| PORT     | 3000    | Server port        |

---

## 🛡️ Features

| Feature               | Status |
|-----------------------|--------|
| Rental listings CRUD  | ✅     |
| Scam Risk Detector    | ✅     |
| Community Reviews     | ✅     |
| Upvote / Downvote     | ✅     |
| Agreement Checker     | ✅     |
| Scam Reporting        | ✅     |
| Trust Score Engine    | ✅     |
| Trust Leaderboard     | ✅     |
| Geolocation search    | ✅     |
| Rate limiting         | ✅     |
| Input validation      | ✅     |
| SQLite persistence    | ✅     |
