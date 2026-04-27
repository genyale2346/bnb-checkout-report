const express = require("express");
const fetch = require("node-fetch");  // Per interagire con l'API di Google Sheets
const path = require("path");

const app = express();
app.use(express.json());
app.use(express.static(__dirname));

// La tua chiave API per Google Sheets
const GOOGLE_SHEETS_API_KEY = 'AIzaSyB5OUoXqgFbPv8K1vLBwHVTDnMLY7BtSNw';

// ID del foglio Google, copia e incolla il tuo ID qui!
const SPREADSHEET_ID = '1DFKncf0jw3Eh6qw5tH36qYGZszwmiqpvCTDTKRV5yNU';

// L'intervallo che vuoi leggere dal foglio
const RANGE = 'Lavanderia!A2:B10';  // L'intervallo delle celle che vuoi leggere

// Funzione per ottenere i dati da Google Sheets
async function getGoogleSheetsData() {
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${SPREADSHEET_ID}/values/${RANGE}?key=${GOOGLE_SHEETS_API_KEY}`;
    const response = await fetch(url);
    const data = await response.json();
    console.log(data);  // Verifica i dati che ricevi dal foglio
    return data;
}

// Endpoint per ottenere i dati dal foglio
app.get("/api/report", async (req, res) => {
    try {
        const data = await getGoogleSheetsData();  // Ottieni i dati dal foglio
        res.json(data);  // Rispondi con i dati ottenuti
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Avvia il server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server avviato su porta ${PORT}`);
});
