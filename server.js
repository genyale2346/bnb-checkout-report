const express = require("express");
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

const API_BASE = process.env.CIAOBOOKING_API_BASE || "https://api.ciaobooking.com";
const EMAIL = process.env.CIAOBOOKING_EMAIL;
const PASSWORD = process.env.CIAOBOOKING_PASSWORD;
const SOURCE = process.env.CIAOBOOKING_SOURCE || "wp";
const LOCALE = process.env.CIAOBOOKING_LOCALE || "it";

let cachedToken = null;
let cachedTokenExpires = 0;

const ACTIVE_ROOMS = [
  { struttura: "Yes I Know My Room - Magica Napoli", camera: "Abbasc" },
  { struttura: "Yes I Know My Room - Magica Napoli", camera: "Ngopp" },

  { struttura: "Yes I Know My Room - Storico", camera: "Alleria" },
  { struttura: "Yes I Know My Room - Storico", camera: "Mareluna" },

  { struttura: "Yes I Know My Room - Foria", camera: "A me me piace 'o blues" },
  { struttura: "Yes I Know My Room - Foria", camera: "Allora sì" },
  { struttura: "Yes I Know My Room - Foria", camera: "Je So' Pazz" },
  { struttura: "Yes I Know My Room - Foria", camera: "Keep On Movin'" },
  { struttura: "Yes I Know My Room - Foria", camera: "Napul'è" },
  { struttura: "Yes I Know My Room - Foria", camera: "Vento di passione" },

  { struttura: "GG-ROOM - San Giovanni", camera: "Cuntrora" },
  { struttura: "GG-ROOM - San Giovanni", camera: "Fenestrella" },
  { struttura: "GG-ROOM - San Giovanni", camera: "O' Sole Mio" },

  { struttura: "S. Brigida GG-Grow", camera: "Sophia" },
  { struttura: "S. Brigida GG-Grow", camera: "Totò" },

  { struttura: "Terrazza GG-Grow", camera: "Terrazza" },

  { struttura: "Tutta nata storia", camera: "Tutta nata storia" },

  { struttura: "Una notte a napoli", camera: "una notte a napoli" }
];

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[’`]/g, "'")
    .replace(/\s+/g, " ");
}

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
    r.unit?.name ||
    r.unit?.unit_category?.name ||
    r.room_type?.name ||
    "Camera senza nome"
  );
}

function getPropertyName(r) {
  return (
    r.property_name ||
    r.property?.name ||
    r.unit?.property?.name ||
    "Struttura senza nome"
  );
}

function canonicalize(struttura, camera) {
  let prop = String(struttura || "").trim();
  let cam = String(camera || "").trim();

  const p = normalizeText(prop);
  const c = normalizeText(cam);
  const text = `${p} ${c}`;

  if (text.includes("claudia") || text.includes("lory")) {
    return null;
  }

  if (c.includes("camera senza nome") || c === "—" || c === "-") {
    return null;
  }

  if (p.includes("san giovanni") && c.includes("o' sole mio nr x2")) {
    prop = "GG-ROOM - San Giovanni";
    cam = "O' Sole Mio";
  }

  if (p.includes("s. brigida") && p.includes("gg-grow") && (c.includes("totò srsc x2") || c.includes("toto srsc x2"))) {
    prop = "S. Brigida GG-Grow";
    cam = "Totò";
  }

  if (p.includes("terrazza") && p.includes("gg-grow") && c.includes("terrazza srsc x2")) {
    prop = "Terrazza GG-Grow";
    cam = "Terrazza";
  }

  if (p.includes("tutta nata storia") && (c.includes("tutta nata storia nr x5") || c.includes("tutta nata storia sr x5"))) {
    prop = "Tutta nata storia";
    cam = "Tutta nata storia";
  }

  const active = ACTIVE_ROOMS.find(r =>
    normalizeText(r.struttura) === normalizeText(prop) &&
    normalizeText(r.camera) === normalizeText(cam)
  );

  if (!active) {
    return null;
  }

  return {
    struttura: active.struttura,
    camera: active.camera
  };
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

    const roomReport = {};
    const structureReport = {};

    for (const active of ACTIVE_ROOMS) {
      const roomKey = `${active.struttura}|||${active.camera}`;

      roomReport[roomKey] = {
        struttura: active.struttura,
        camera: active.camera,
        months: {}
      };

      months.forEach(m => roomReport[roomKey].months[m] = 0);

      if (!structureReport[active.struttura]) {
        structureReport[active.struttura] = {
          struttura: active.struttura,
          months: {}
        };
        months.forEach(m => structureReport[active.struttura].months[m] = 0);
      }
    }

    for (const r of reservations) {
      const checkout = r.end_date;
      if (!checkout) continue;
      if (checkout < from || checkout > to) continue;

      const rawCamera = getRoomName(r);
      const rawStruttura = getPropertyName(r);

      const clean = canonicalize(rawStruttura, rawCamera);
      if (!clean) continue;

      const mk = monthKey(checkout);
      const roomKey = `${clean.struttura}|||${clean.camera}`;

      if (roomReport[roomKey] && roomReport[roomKey].months[mk] !== undefined) {
        roomReport[roomKey].months[mk]++;
      }

      if (structureReport[clean.struttura] && structureReport[clean.struttura].months[mk] !== undefined) {
        structureReport[clean.struttura].months[mk]++;
      }
    }

    const roomRows = Object.values(roomReport)
      .map(row => {
        const values = months.map(m => row.months[m] || 0);
        const total = values.reduce((a, b) => a + b, 0);
        return {
          struttura: row.struttura,
          camera: row.camera,
          values,
          total
        };
      })
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        if (a.struttura === b.struttura) return a.camera.localeCompare(b.camera);
        return a.struttura.localeCompare(b.struttura);
      });

    const structureRows = Object.values(structureReport)
      .map(row => {
        const values = months.map(m => row.months[m] || 0);
        const total = values.reduce((a, b) => a + b, 0);
        return {
          struttura: row.struttura,
          values,
          total
        };
      })
      .sort((a, b) => {
        if (b.total !== a.total) return b.total - a.total;
        return a.struttura.localeCompare(b.struttura);
      });

    const totalCheckout = roomRows.reduce((sum, r) => sum + r.total, 0);

    res.json({
      months: months.map(m => ({ key: m, label: monthLabel(m) })),
      rows: roomRows,
      structures: structureRows,
      totalCheckout
    });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => {
  console.log("Server avviato");
});
