// La tua chiave API per Google Sheets
const googleSheetsAPIKey = 'AlzaSyB50UoXqgFbPv8k1VLwHVTnDMLY7BtSNw'; // Sostituisci con la tua chiave API

// URL dell'API di Google Sheets
const googleSheetsAPIUrl = 'https://sheets.googleapis.com/v4/spreadsheets';

// Funzione per ottenere i dati da Google Sheets
async function getGoogleSheetsData(spreadsheetId, range) {
  const response = await fetch(`${googleSheetsAPIUrl}/${spreadsheetId}/values/${range}?key=${googleSheetsAPIKey}`);
  const data = await response.json();
  console.log(data);
  return data;
}

// Esegui la funzione per ottenere i dati
async function loadData() {
  const spreadsheetId = 'YOUR_SPREADSHEET_ID'; // Sostituisci con il tuo ID del foglio Google
  const range = 'Sheet1!A2:B10'; // Definisci l'intervallo delle celle che vuoi leggere, ad esempio 'Sheet1!A2:B10'

  const data = await getGoogleSheetsData(spreadsheetId, range);
  console.log(data);
}

// Chiama la funzione per caricare i dati
loadData();

// Qui puoi aggiungere altre funzioni per interagire con Google Sheets o per elaborare i dati
