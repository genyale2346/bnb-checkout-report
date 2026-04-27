const express = require("express");
const path = require("path");
const { google } = require('googleapis');
const fs = require('fs');
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

const SPREADSHEET_ID = 'AIzaSyB5OUoXqgFbPv8K1vLBwHVTDnMLY7BtSNw';
const SHEET_NAME = 'Sheet1'; // Sostituisci con il nome del tuo foglio

// Google Sheets API setup
const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];
const CREDENTIALS_PATH = 'credentials.json';

// Leggi il file delle credenziali e ottieni l'accesso all'API di Google Sheets
const credentials = JSON.parse(fs.readFileSync(CREDENTIALS_PATH, 'utf8'));

const { client_email, private_key } = credentials;
const auth = new google.auth.JWT(client_email, null, private_key, SCOPES);

// Funzione per ottenere i dati dal foglio Google Sheets
async function getLaundryCosts() {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: SHEET_NAME,
  });

  const rows = response.data.values;
  const data = {};

  if (rows.length) {
    rows.forEach((row) => {
      const [month, cost] = row;
      data[month] = parseFloat(cost) || 0;
    });
  }

  return data;
}

// Funzione per scrivere i dati nel foglio Google Sheets
async function updateLaundryCost(month, cost) {
  const sheets = google.sheets({ version: 'v4', auth });
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${SHEET_NAME}!B2`, // Cambia con la cella corretta per aggiornare
    valueInputOption: "RAW",
    resource: {
      values: [[cost]],
    },
  });
}

app.get("/api/report", async (req, res) => {
  try {
    const { from, to } = req.query;

    // Ottieni i dati dalla Google Sheets
    const laundryCosts = await getLaundryCosts();

    const months = monthsBetween(from, to);

    // Logica di report
    const roomReport = {};
    const structureReport = {};

    for (const active of ACTIVE_ROOMS) {
      const roomKey = `${active.struttura}|||${active.camera}`;

      roomReport[roomKey] = {
        struttura: active.struttura,
        camera: active.camera,
        months: {},
      };

      months.forEach(m => roomReport[roomKey].months[m] = 0);

      if (!structureReport[active.struttura]) {
        structureReport[active.struttura] = {
          struttura: active.struttura,
          months: {},
        };
        months.forEach(m => structureReport[active.struttura].months[m] = 0);
      }
    }

    const reservations = await fetchReservations(from, to);

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
