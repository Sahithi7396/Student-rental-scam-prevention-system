/**
 * SafeNest – script.js (API-connected version)
 * All data reads/writes go through the Express backend at /api/*
 * localStorage is used ONLY for vote dedup (no auth system).
 */

"use strict";

const API = "/api";

// ═══════════════════════════════════════════════════════════
//  HTTP HELPERS
// ═══════════════════════════════════════════════════════════
async function http(method, url, body = null) {
  const opts = {
    method,
    headers: { "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res  = await fetch(url, opts);
  const data = await res.json();
  if (!res.ok) throw new Error((data.errors || [data.message]).join(", "));
  return data;
}
const get    = url       => http("GET",    url);
const post   = (url, b)  => http("POST",   url, b);
const put    = (url, b)  => http("PUT",    url, b);
const del    = url       => http("DELETE", url);

// ═══════════════════════════════════════════════════════════
//  TOAST
// ═══════════════════════════════════════════════════════════
const Toast = {
  el: null, timeout: null,
  show(msg, type = "", duration = 3000) {
    if (!this.el) this.el = document.getElementById("toast");
    if (this.timeout) clearTimeout(this.timeout);
    this.el.textContent = msg;
    this.el.className   = `toast ${type}`;
    this.el.classList.remove("hidden");
    this.timeout = setTimeout(() => {
      this.el.style.opacity = "0";
      setTimeout(() => { this.el.classList.add("hidden"); this.el.style.opacity = "1"; }, 300);
    }, duration);
  }
};

// ═══════════════════════════════════════════════════════════
//  UTILITIES
// ═══════════════════════════════════════════════════════════
function formatCurrency(n) {
  if (!n && n !== 0) return "N/A";
  return "₹" + Number(n).toLocaleString("en-IN");
}
function timeAgo(ts) {
  const diff = (Date.now() - ts) / 1000;
  if (diff < 60)    return "just now";
  if (diff < 3600)  return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return Math.floor(diff / 86400) + "d ago";
}
function escapeHtml(str) {
  return String(str || "")
    .replace(/&/g,"&amp;").replace(/</g,"&lt;")
    .replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function setLoading(btnId, loading, label = "") {
  const btn = document.getElementById(btnId);
  if (!btn) return;
  btn.disabled    = loading;
  btn.textContent = loading ? "Please wait…" : label || btn.dataset.label;
  if (label) btn.dataset.label = label;
}

// ═══════════════════════════════════════════════════════════
//  STATS
// ═══════════════════════════════════════════════════════════
async function updateStats() {
  try {
    const { data } = await get(`${API}/reports/stats`);
    document.getElementById("stat-reports").textContent = data.total_reports;
    document.getElementById("stat-reviews").textContent = data.total_reviews;
  } catch { /* silently ignore */ }
}

// ═══════════════════════════════════════════════════════════
//  LISTINGS MODULE
// ═══════════════════════════════════════════════════════════
const Listings = {
  init() {
    document.getElementById("btn-search").addEventListener("click",       () => this.search());
    document.getElementById("btn-locate").addEventListener("click",       () => this.locate());
    document.getElementById("btn-add-listing").addEventListener("click",  () => this.toggleForm());
    document.getElementById("btn-submit-listing").addEventListener("click",() => this.submit());
    setLoading("btn-submit-listing", false, "Submit Listing");
  },

  toggleForm() {
    document.getElementById("add-listing-form").classList.toggle("hidden");
  },

  async search() {
    const city = document.getElementById("search-city").value.trim();
    const type = document.getElementById("search-type").value;
    await this.render({ city, type });
  },

  locate() {
    const status = document.getElementById("location-status");
    status.classList.remove("hidden");
    status.textContent = "📡 Detecting your location…";
    if (!navigator.geolocation) {
      status.textContent = "⚠️ Geolocation not supported by your browser.";
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        status.textContent = `✅ Location detected (${latitude.toFixed(3)}, ${longitude.toFixed(3)}). Showing all listings.`;
        // Reverse geocode via Nominatim (free, no key required)
        try {
          const r = await fetch(
            `https://nominatim.openstreetmap.org/reverse?lat=${latitude}&lon=${longitude}&format=json`
          );
          const geo = await r.json();
          const city = geo.address?.city || geo.address?.town || geo.address?.village || "";
          if (city) {
            document.getElementById("search-city").value = city;
            await this.render({ city });
            return;
          }
        } catch { /* fallback below */ }
        await this.render({});
      },
      () => { status.textContent = "⚠️ Could not get location. Please enter your city manually."; }
    );
  },

  async render(filters = {}) {
    const grid  = document.getElementById("listings-grid");
    const empty = document.getElementById("listings-empty");
    grid.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Loading listings…</p>`;

    try {
      const params = new URLSearchParams();
      if (filters.city) params.set("city", filters.city);
      if (filters.type) params.set("type", filters.type);

      const { data } = await get(`${API}/listings?${params}`);

      grid.innerHTML = "";
      if (!data || data.length === 0) {
        empty.classList.remove("hidden");
        grid.classList.add("hidden");
        return;
      }
      empty.classList.add("hidden");
      grid.classList.remove("hidden");

      data.forEach(listing => {
        const card = document.createElement("div");
        card.className = "listing-card";
        card.innerHTML = `
          ${listing.is_reported ? '<span class="reported-tag">⚠️ REPORTED</span>' : ""}
          <div class="listing-card-header">
            <div class="listing-name">${escapeHtml(listing.name)}</div>
            <span class="trust-badge ${this.trustClass(listing.trust_score)}">${escapeHtml(listing.trust_label)}</span>
          </div>
          <div class="listing-meta">
            <span>📍 ${escapeHtml(listing.area)}, ${escapeHtml(listing.city)}</span>
            <span>🏠 ${listing.type.toUpperCase()}</span>
            ${listing.landlord ? `<span>👤 ${escapeHtml(listing.landlord)}</span>` : ""}
          </div>
          <div class="listing-rent">
            ${formatCurrency(listing.rent)}<small>/mo</small>
            ${listing.advance ? `<span style="font-size:0.78rem;color:var(--text-muted);margin-left:0.5rem;">Advance: ${formatCurrency(listing.advance)}</span>` : ""}
          </div>
          ${listing.amenities ? `<p style="font-size:0.78rem;color:var(--text-muted);margin-top:0.35rem;">${escapeHtml(listing.amenities)}</p>` : ""}
          <div class="listing-actions">
            <button class="btn-secondary" onclick="Reviews.scrollToReview('${escapeHtml(listing.name)}')">Reviews</button>
            <button class="btn-secondary" onclick="Reports.prefill('${escapeHtml(listing.name)}','${escapeHtml(listing.area)}','${escapeHtml(listing.city)}')">Report</button>
            <span style="font-size:0.75rem;color:var(--text-muted);margin-left:auto;align-self:center;">Trust: ${listing.trust_score}</span>
          </div>
        `;
        grid.appendChild(card);
      });
    } catch (err) {
      grid.innerHTML = `<p style="color:var(--red);">Failed to load listings: ${escapeHtml(err.message)}</p>`;
    }
  },

  trustClass(score) {
    if (score >= 70) return "trust-high";
    if (score >= 40) return "trust-medium";
    return "trust-low";
  },

  async submit() {
    const body = {
      name:      document.getElementById("l-name").value.trim(),
      area:      document.getElementById("l-area").value.trim(),
      city:      document.getElementById("l-city").value.trim(),
      type:      document.getElementById("l-type").value,
      rent:      document.getElementById("l-rent").value,
      advance:   document.getElementById("l-advance").value,
      landlord:  document.getElementById("l-landlord").value.trim(),
      contact:   document.getElementById("l-contact").value.trim(),
      amenities: document.getElementById("l-amenities").value.trim(),
    };

    if (!body.name || !body.area || !body.city || !body.rent) {
      Toast.show("Please fill required fields (Name, Area, City, Rent).", "error");
      return;
    }

    setLoading("btn-submit-listing", true);
    try {
      await post(`${API}/listings`, body);
      Toast.show("✅ Listing added!", "success");
      ["l-name","l-area","l-city","l-rent","l-advance","l-landlord","l-contact","l-amenities"]
        .forEach(id => { document.getElementById(id).value = ""; });
      document.getElementById("add-listing-form").classList.add("hidden");
      await this.render({});
      await TrustLeaderboard.render();
      await updateStats();
    } catch (err) {
      Toast.show("Error: " + err.message, "error");
    } finally {
      setLoading("btn-submit-listing", false, "Submit Listing");
    }
  }
};

// ═══════════════════════════════════════════════════════════
//  SCAM RISK DETECTOR  (pure frontend logic — no API needed)
// ═══════════════════════════════════════════════════════════
const ScamDetector = {
  cityBenchmarks: {
    "mumbai":    { avgRent: 15000 }, "delhi":     { avgRent: 12000 },
    "bangalore": { avgRent: 14000 }, "bengaluru": { avgRent: 14000 },
    "hyderabad": { avgRent: 10000 }, "pune":      { avgRent: 11000 },
    "chennai":   { avgRent: 10000 }, "kolkata":   { avgRent: 8000 },
    "default":   { avgRent: 7000 }
  },

  init() {
    document.getElementById("btn-detect").addEventListener("click", () => this.analyze());
  },

  analyze() {
    const rent    = parseFloat(document.getElementById("d-rent").value)    || 0;
    const advance = parseFloat(document.getElementById("d-advance").value) || 0;
    const city    = document.getElementById("d-city").value.trim().toLowerCase();
    const flags   = {
      nid:       document.getElementById("f-nid").checked,
      nagree:    document.getElementById("f-nagree").checked,
      pressure:  document.getElementById("f-pressure").checked,
      novisit:   document.getElementById("f-novisit").checked,
      online:    document.getElementById("f-online").checked,
      cheap:     document.getElementById("f-cheap").checked,
      cash:      document.getElementById("f-cash").checked,
      noreceipt: document.getElementById("f-noreceipt").checked,
    };

    const benchmark = this.cityBenchmarks[city] || this.cityBenchmarks["default"];
    const reasons = [];
    let score = 0;

    if (rent > 0) {
      const months = advance / rent;
      if (months > 6) {
        score += 30;
        reasons.push({ level:"danger", text:`Advance is ${months.toFixed(1)}× rent — extremely high. Norm is 1–3 months.` });
      } else if (months > 3) {
        score += 15;
        reasons.push({ level:"warn", text:`Advance is ${months.toFixed(1)}× rent — slightly above normal.` });
      } else if (advance > 0) {
        reasons.push({ level:"ok", text:`Advance (${months.toFixed(1)}× rent) is within normal range.` });
      }
      if (rent < benchmark.avgRent * 0.5) {
        score += 20;
        reasons.push({ level:"danger", text:`Rent is far below market average for ${city || "this city"} — common bait tactic.` });
      }
    }

    if (flags.nid)      { score+=15; reasons.push({level:"warn",   text:"Refused to show ID — you're entitled to verify ownership before payment."}); }
    if (flags.nagree)   { score+=20; reasons.push({level:"danger", text:"No written agreement — zero legal protection. Major red flag."}); }
    if (flags.pressure) { score+=15; reasons.push({level:"warn",   text:"Urgency pressure ('pay now or lose it') is a classic scam tactic."}); }
    if (flags.novisit)  { score+=20; reasons.push({level:"danger", text:"No site visit allowed before payment — property may not exist as shown."}); }
    if (flags.online)   { score+=10; reasons.push({level:"warn",   text:"Fully online deal. Combined with other flags, this raises risk significantly."}); }
    if (flags.cheap)    { score+=15; reasons.push({level:"warn",   text:"Unusually cheap rent. Scammers advertise below-market rates to attract students."}); }
    if (flags.cash)     { score+=15; reasons.push({level:"warn",   text:"Cash-only advance — no transaction record, nearly impossible to recover legally."}); }
    if (flags.noreceipt){ score+=10; reasons.push({level:"warn",   text:"No receipt means no proof of payment. Always insist on a signed receipt."}); }

    if (flags.nagree && advance > 0) { score+=10; reasons.push({level:"danger", text:"High advance + no agreement = classic scam pattern. Do NOT pay."}); }
    if (flags.novisit && flags.online){ score+=10; reasons.push({level:"danger", text:"Remote-only deal with no site visit = very high-risk combination."}); }

    if (reasons.length === 0)
      reasons.push({level:"ok", text:"No major risk factors found. Still always get a written agreement."});

    let riskLevel, riskClass;
    if (score >= 50)      { riskLevel = "🔴 High Risk";   riskClass = "high"; }
    else if (score >= 25) { riskLevel = "🟡 Medium Risk"; riskClass = "medium"; }
    else                  { riskLevel = "🟢 Low Risk";    riskClass = "low"; }

    this.render(riskLevel, riskClass, score, reasons, advance, rent);
  },

  render(level, cls, score, reasons, advance, rent) {
    const advice = {
      high:   "Do NOT pay any advance. Walk away if landlord won't show ID, property, and agreement.",
      medium: "Proceed carefully. Insist on a written agreement and receipt before any payment.",
      low:    "Relatively safe. Still verify the agreement covers all key terms before signing."
    };
    document.getElementById("detector-result").innerHTML = `
      <div class="risk-result">
        <div class="risk-score-box ${cls}">
          <div class="risk-label ${cls}">${level}</div>
          <div class="risk-score-num">Risk score: ${score}/100</div>
        </div>
        <ul class="risk-reasons">
          ${reasons.map(r=>`
            <li class="risk-reason-item ${r.level==='danger'?'danger':r.level==='warn'?'warn':''}">
              <span>${r.level==='danger'?'🚨':r.level==='warn'?'⚠️':'✅'}</span>
              <span>${escapeHtml(r.text)}</span>
            </li>`).join("")}
        </ul>
        <div class="risk-advance-note">
          <strong>📌 Advice:</strong> ${advice[cls]}
          ${(advance>0&&rent>0)?`<br><br>You entered: ${formatCurrency(advance)} advance on ${formatCurrency(rent)}/mo = <strong>${(advance/rent).toFixed(1)} months advance.</strong>`:""}
        </div>
      </div>`;
  }
};

// ═══════════════════════════════════════════════════════════
//  TRUST LEADERBOARD
// ═══════════════════════════════════════════════════════════
const TrustLeaderboard = {
  async render() {
    const container = document.getElementById("trust-list");
    container.innerHTML = `<p style="color:var(--text-muted);font-size:0.9rem;">Loading…</p>`;

    try {
      const { data } = await get(`${API}/listings/trust/leaderboard`);

      if (!data || data.length === 0) {
        container.innerHTML = `<div class="empty-state">No listings yet. Add some and they'll appear here ranked by trust.</div>`;
        return;
      }

      container.innerHTML = data.map((l, i) => `
        <div class="trust-row">
          <div class="trust-rank">#${i+1}</div>
          <div class="trust-row-info">
            <div class="trust-row-name">${escapeHtml(l.name)}</div>
            <div class="trust-row-meta">📍 ${escapeHtml(l.area)}, ${escapeHtml(l.city)} &nbsp;·&nbsp; ${formatCurrency(l.rent)}/mo</div>
          </div>
          <div class="trust-score-bar-wrap">
            <span class="trust-score-num">${l.trust_score}<span style="font-size:0.7rem;color:var(--text-muted);">/100</span></span>
            <div class="trust-score-bar">
              <div class="trust-score-fill" style="width:${l.trust_score}%;background:${l.trust_score>=70?'var(--green)':l.trust_score>=40?'var(--amber)':'var(--red)'};"></div>
            </div>
          </div>
          <span class="trust-badge ${l.trust_score>=70?'trust-high':l.trust_score>=40?'trust-medium':'trust-low'}">${escapeHtml(l.trust_label)}</span>
        </div>`).join("");
    } catch (err) {
      container.innerHTML = `<p style="color:var(--red);">Failed to load leaderboard.</p>`;
    }
  }
};

// ═══════════════════════════════════════════════════════════
//  REVIEWS MODULE
// ═══════════════════════════════════════════════════════════
const Reviews = {
  selectedRating: 0,

  init() {
    document.querySelectorAll(".star").forEach(star => {
      star.addEventListener("click",     () => { this.selectedRating = parseInt(star.dataset.val); this.highlightStars(this.selectedRating); });
      star.addEventListener("mouseover", () => this.highlightStars(parseInt(star.dataset.val)));
      star.addEventListener("mouseout",  () => this.highlightStars(this.selectedRating));
    });
    document.getElementById("btn-add-review").addEventListener("click", () => this.submit());
    setLoading("btn-add-review", false, "Submit Review");
    this.render();
  },

  highlightStars(val) {
    document.querySelectorAll(".star").forEach(s => s.classList.toggle("active", parseInt(s.dataset.val) <= val));
  },

  async submit() {
    const property = document.getElementById("rv-property").value.trim();
    const area     = document.getElementById("rv-area").value.trim();
    const author   = document.getElementById("rv-author").value.trim() || "Anonymous";
    const text     = document.getElementById("rv-text").value.trim();
    const scam     = document.getElementById("rv-scam").checked;
    const msg      = document.getElementById("review-msg");

    if (!property || !text) {
      msg.textContent = "Please enter property name and review text."; msg.className = "msg error"; msg.classList.remove("hidden"); return;
    }
    if (this.selectedRating === 0) {
      msg.textContent = "Please select a star rating."; msg.className = "msg error"; msg.classList.remove("hidden"); return;
    }

    setLoading("btn-add-review", true);
    try {
      await post(`${API}/reviews`, {
        property, area, city: area, author,
        rating: this.selectedRating,
        review_text: text,
        scam_flag: scam,
      });
      msg.textContent = "✅ Review submitted! Thank you."; msg.className = "msg success"; msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 3000);
      ["rv-property","rv-area","rv-text"].forEach(id => { document.getElementById(id).value = ""; });
      document.getElementById("rv-author").value = "";
      document.getElementById("rv-scam").checked = false;
      this.selectedRating = 0; this.highlightStars(0);
      await this.render();
      await TrustLeaderboard.render();
      await updateStats();
    } catch (err) {
      msg.textContent = "Error: " + err.message; msg.className = "msg error"; msg.classList.remove("hidden");
    } finally {
      setLoading("btn-add-review", false, "Submit Review");
    }
  },

  async vote(id, dir) {
    try {
      await post(`${API}/reviews/${id}/vote`, { direction: dir });
      await this.render();
    } catch (err) {
      Toast.show(err.message, "error");
    }
  },

  async render() {
    const container = document.getElementById("reviews-list");
    const empty     = document.getElementById("reviews-empty");

    try {
      const { data } = await get(`${API}/reviews`);

      if (!data || data.length === 0) {
        empty.classList.remove("hidden"); container.innerHTML = ""; return;
      }
      empty.classList.add("hidden");
      container.innerHTML = data.map(r => `
        <div class="review-card">
          <div class="review-card-header">
            <div>
              <div class="review-property">${escapeHtml(r.property)}</div>
              <div class="review-meta">${escapeHtml(r.area)} &nbsp;·&nbsp; ${escapeHtml(r.author)} &nbsp;·&nbsp; ${timeAgo(r.created_at)}</div>
            </div>
            <div class="review-stars">${"★".repeat(r.rating)}${"☆".repeat(5-r.rating)}</div>
          </div>
          <div class="review-text">${escapeHtml(r.review_text)}</div>
          ${r.scam_flag ? '<span class="review-scam-flag">⚠️ Scam behavior reported</span>' : ""}
          <div class="review-vote-row">
            <button class="vote-btn" onclick="Reviews.vote('${r.id}','up')">👍 ${r.upvotes||0}</button>
            <button class="vote-btn" onclick="Reviews.vote('${r.id}','down')">👎 ${r.downvotes||0}</button>
            <span class="vote-count">${(r.upvotes||0)-(r.downvotes||0)>=0?"+":""}${(r.upvotes||0)-(r.downvotes||0)} helpful</span>
          </div>
        </div>`).join("");
    } catch {
      container.innerHTML = `<p style="color:var(--red);">Failed to load reviews.</p>`;
    }
  },

  scrollToReview(name) {
    document.getElementById("rv-property").value = name;
    document.getElementById("reviews").scrollIntoView({ behavior:"smooth" });
    document.getElementById("rv-property").focus();
  }
};

// ═══════════════════════════════════════════════════════════
//  AGREEMENT CHECKER (pure frontend — NLP-lite)
// ═══════════════════════════════════════════════════════════
const AgreementChecker = {
  clauses: [
    { key:"deposit",     label:"Security deposit clause",          variants:["deposit","security deposit","refundable"], importance:"critical" },
    { key:"duration",    label:"Tenancy duration / lock-in period", variants:["duration","period","months","years","term","lock-in"], importance:"critical" },
    { key:"rent",        label:"Monthly rent amount",              variants:["rent","monthly rent","per month","₹","rs."], importance:"critical" },
    { key:"notice",      label:"Notice period for vacating",       variants:["notice period","one month notice","vacate","vacating"], importance:"critical" },
    { key:"maintenance", label:"Maintenance responsibilities",     variants:["maintenance","repair","damages"], importance:"important" },
    { key:"utilities",   label:"Utilities / electricity / water",  variants:["electricity","water","utility","utilities"], importance:"important" },
    { key:"termination", label:"Termination clause",               variants:["termination","terminate","breach","eviction"], importance:"important" },
    { key:"idproof",     label:"ID proof / verification",          variants:["aadhaar","aadhar","pan card","passport","id proof"], importance:"moderate" },
    { key:"witnesses",   label:"Witness signatures",               variants:["witness","witnesses"], importance:"moderate" },
    { key:"renewal",     label:"Renewal clause",                   variants:["renew","renewal","extension"], importance:"moderate" },
    { key:"subletting",  label:"Sub-letting restrictions",         variants:["sub-let","sublet","third party"], importance:"moderate" },
  ],
  redFlags: [
    { pattern:/forfeit/i,                        msg:"Contains 'forfeit' — may mean you lose deposit for minor violations." },
    { pattern:/no refund/i,                      msg:"Contains 'no refund' — deposit may be entirely non-refundable." },
    { pattern:/oral agreement/i,                 msg:"References oral agreement — contradicts the written document." },
    { pattern:/landlord.*enter.*anytime/i,       msg:"Landlord may enter at any time without notice." },
    { pattern:/not responsible/i,                msg:"Broad 'not responsible' clause — may waive landlord liability." },
  ],

  init() {
    document.getElementById("btn-check-agree").addEventListener("click", () => this.analyze());
  },

  analyze() {
    const text  = document.getElementById("agree-text").value;
    const lower = text.toLowerCase();
    if (text.trim().length < 50) {
      document.getElementById("agreement-result").innerHTML = `<div class="result-placeholder"><span class="result-icon-big">⚠️</span><p>Please paste a longer agreement text.</p></div>`;
      return;
    }
    const found=[], missing=[], caution=[];
    this.clauses.forEach(c => {
      const present = c.variants.some(v => lower.includes(v));
      if (present) { found.push(c); }
      else if (c.importance==="critical"||c.importance==="important") { missing.push(c); }
      else { caution.push(c); }
    });
    const flagsFound = this.redFlags.filter(f => f.pattern.test(text));
    let score = 50;
    found.forEach(c   => { score += c.importance==="critical"?12:c.importance==="important"?8:4; });
    missing.forEach(c => { score -= c.importance==="critical"?15:8; });
    flagsFound.forEach(()=> { score -= 10; });
    score = Math.max(0, Math.min(100, score));
    const color = score>=70?"var(--green)":score>=45?"var(--amber)":"var(--red)";
    const label = score>=70?"Well Drafted ✅":score>=45?"Needs Attention ⚠️":"Risky / Incomplete 🚨";

    document.getElementById("agreement-result").innerHTML = `
      <div>
        <div class="agree-score-box">
          <div class="agree-score-val" style="color:${color}">${score}<span style="font-size:1rem;color:var(--text-muted)">/100</span></div>
          <div style="font-size:0.9rem;font-weight:600;margin-top:0.2rem;">${label}</div>
        </div>
        ${flagsFound.length?`<p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;color:var(--red);margin-bottom:0.4rem;">🚩 Red Flags</p><div class="agreement-checks">${flagsFound.map(f=>`<div class="agree-item missing"><span class="agree-item-icon">🚩</span><span>${escapeHtml(f.msg)}</span></div>`).join("")}</div>`:""}
        ${missing.length?`<p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;color:var(--red);margin:0.7rem 0 0.4rem;">Missing Critical Clauses</p><div class="agreement-checks">${missing.map(c=>`<div class="agree-item missing"><span class="agree-item-icon">❌</span><span>${escapeHtml(c.label)}</span></div>`).join("")}</div>`:""}
        ${caution.length?`<p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;color:var(--amber);margin:0.7rem 0 0.4rem;">Optional Clauses Missing</p><div class="agreement-checks">${caution.map(c=>`<div class="agree-item caution"><span class="agree-item-icon">⚠️</span><span>${escapeHtml(c.label)}</span></div>`).join("")}</div>`:""}
        ${found.length?`<p style="font-size:0.78rem;font-weight:700;text-transform:uppercase;color:var(--green);margin:0.7rem 0 0.4rem;">Clauses Present</p><div class="agreement-checks">${found.map(c=>`<div class="agree-item found"><span class="agree-item-icon">✅</span><span>${escapeHtml(c.label)}</span></div>`).join("")}</div>`:""}
      </div>`;
  }
};

// ═══════════════════════════════════════════════════════════
//  REPORTS MODULE
// ═══════════════════════════════════════════════════════════
const Reports = {
  scamTypeLabels: {
    advance:"Advance fraud", fake:"Fake property", overprice:"Overpricing",
    noagree:"Refused agreement", harassment:"Harassment", other:"Other"
  },

  init() {
    document.getElementById("btn-report").addEventListener("click", () => this.submit());
    setLoading("btn-report", false, "🚨 Submit Report");
    this.render();
  },

  async submit() {
    const body = {
      landlord:    document.getElementById("rp-name").value.trim(),
      property:    document.getElementById("rp-property").value.trim(),
      city:        document.getElementById("rp-city").value.trim(),
      contact:     document.getElementById("rp-contact").value.trim(),
      scam_type:   document.getElementById("rp-type").value,
      description: document.getElementById("rp-desc").value.trim(),
      reporter:    document.getElementById("rp-reporter").value.trim() || "Anonymous",
    };
    const msg = document.getElementById("report-msg");

    if (!body.landlord || !body.property || !body.city || !body.scam_type || !body.description) {
      msg.textContent = "Please fill in all required fields."; msg.className = "msg error"; msg.classList.remove("hidden"); return;
    }

    setLoading("btn-report", true);
    try {
      await post(`${API}/reports`, body);
      msg.textContent = "🚨 Report filed. Thank you for protecting other students."; msg.className = "msg success"; msg.classList.remove("hidden");
      setTimeout(() => msg.classList.add("hidden"), 4000);
      ["rp-name","rp-property","rp-city","rp-contact","rp-desc","rp-reporter"].forEach(id => { document.getElementById(id).value = ""; });
      document.getElementById("rp-type").value = "";
      await this.render();
      await Listings.render({});
      await TrustLeaderboard.render();
      await updateStats();
    } catch (err) {
      msg.textContent = "Error: " + err.message; msg.className = "msg error"; msg.classList.remove("hidden");
    } finally {
      setLoading("btn-report", false, "🚨 Submit Report");
    }
  },

  async render() {
    const container = document.getElementById("reports-list");
    const empty     = document.getElementById("reports-empty");
    try {
      const { data } = await get(`${API}/reports`);
      if (!data || data.length === 0) { empty.classList.remove("hidden"); container.innerHTML = ""; return; }
      empty.classList.add("hidden");
      container.innerHTML = data.map(r => `
        <div class="report-card">
          <div class="report-card-name">⚠️ ${escapeHtml(r.landlord)}</div>
          <div class="report-card-meta">📍 ${escapeHtml(r.property)}, ${escapeHtml(r.city)} &nbsp;·&nbsp; by ${escapeHtml(r.reporter)} &nbsp;·&nbsp; ${timeAgo(r.created_at)}</div>
          <span class="report-type-tag">${this.scamTypeLabels[r.scam_type] || r.scam_type}</span>
          <div class="report-card-desc">${escapeHtml(r.description)}</div>
        </div>`).join("");
    } catch {
      container.innerHTML = `<p style="color:var(--red);">Failed to load reports.</p>`;
    }
  },

  prefill(name, area, city) {
    document.getElementById("rp-property").value = `${name}, ${area}`;
    document.getElementById("rp-city").value      = city;
    document.getElementById("report").scrollIntoView({ behavior:"smooth" });
  }
};

// ═══════════════════════════════════════════════════════════
//  BOOTSTRAP
// ═══════════════════════════════════════════════════════════
document.addEventListener("DOMContentLoaded", async () => {
  Listings.init();
  ScamDetector.init();
  Reviews.init();
  AgreementChecker.init();
  Reports.init();

  await Promise.all([
    Listings.render({}),
    TrustLeaderboard.render(),
    updateStats(),
  ]);
});
