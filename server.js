const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const API_BASE = process.env.CIAOBOOKING_API_BASE || "https://api.ciaobooking.com";
const EMAIL = process.env.CIAOBOOKING_EMAIL;
const PASSWORD = process.env.CIAOBOOKING_PASSWORD;
const SOURCE = process.env.CIAOBOOKING_SOURCE || "public_api";
const LOCALE = process.env.CIAOBOOKING_LOCALE || "it";

let cachedToken = null;
let cachedTokenExpires = 0;

function monthKey(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key) {
  const [y, m] = key.split("-");
  const mesi = ["Gen", "Feb", "Mar", "Apr", "Mag", "Giu", "Lug", "Ago", "Set", "Ott", "Nov", "Dic"];
  return `${mesi[Number(m) - 1]} ${y}`;
}

function monthsBetween(from, to) {
  const start = new Date(from + "T00:00:00");
  const end = new Date(to + "T00:00:00");
  const months = [];
  const d = new Date(start.getFullYear(), start.getMonth(), 1);

  while (d <= end) {
    months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
    d.setMonth(d.getMonth() + 1);
  }

  return months;
}

function getRoomName(r) {
  return (
    r.room_name ||
    r.unit?.unit_category?.name ||
    r.unit?.name ||
    r.room_type?.name ||
    "Camera senza nome"
  );
}

async function getToken() {
  const now = Math.floor(Date.now() / 1000);

  if (cachedToken && cachedTokenExpires > now + 60) {
    return cachedToken;
  }

  const form = new FormData();
  form.append("email", EMAIL);
  form.append("password", PASSWORD);
  form.append("source", SOURCE);

  const res = await fetch(`${API_BASE}/api/public/login`, {
    method: "POST",
    headers: {
      "locale": LOCALE
    },
    body: form
  });

  const json = await res.json();

  if (!res.ok) {
    throw new Error("Login CiaoBooking fallito");
  }

  cachedToken = json.data.token;
  cachedTokenExpires = json.data.expiresAt || now + 3600;

  return cachedToken;
}

async function fetchReservations(from, to) {
  const token = await getToken();
  let all = [];
  let limit = 200;
  let offset = 0;

  while (true) {
    const url = new URL(`${API_BASE}/api/public/reservations`);
    url.searchParams.set("from", from);
    url.searchParams.set("to", to);
    url.searchParams.set("status", "2");
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));

    const res = await fetch(url, {
      headers: {
        "Accept": "application/json",
        "Authorization": `Bearer ${token}`
      }
    });

    const json = await res.json();

    if (!res.ok) {
      throw new Error("Errore CiaoBooking HTTP " + res.status + ": " + JSON.stringify(json));
    }

    const rows = json.data?.collection || [];
    all = all.concat(rows);

    if (rows.length < limit) break;
    offset += limit;
  }

  return all;
}

app.get("/api/report", async (req, res) => {
  try {
    if (!EMAIL || !PASSWORD) {
      return res.status(500).json({
        error: "Credenziali CiaoBooking non configurate su Render"
      });
    }

    const from = req.query.from;
    const to = req.query.to;

    if (!from || !to) {
      return res.status(400).json({ error: "Date mancanti" });
    }

    const reservations = await fetchReservations(from, to);
    const months = monthsBetween(from, to);

    const report = {};

    for (const r of reservations) {
      const checkout = r.end_date;
      if (!checkout) continue;
      if (checkout < from || checkout > to) continue;

      const camera = getRoomName(r);
      const mk = monthKey(checkout);

      if (!report[camera]) {
        report[camera] = {};
        months.forEach(m => report[camera][m] = 0);
      }

      if (report[camera][mk] !== undefined) {
        report[camera][mk]++;
      }
    }

    const rows = Object.keys(report).sort().map(camera => {
      const values = months.map(m => report[camera][m] || 0);
      const total = values.reduce((a, b) => a + b, 0);

      return {
        camera,
        values,
        total
      };
    });

    res.json({
      months: months.map(m => ({ key: m, label: monthLabel(m) })),
      rows
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server avviato");
});
