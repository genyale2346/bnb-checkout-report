const express = require('express');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Inizializzazione Supabase con le chiavi che abbiamo messo su Render
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

// Rotta per salvare i costi (usata dal PC o dal Cellulare)
app.post("/api/save-laundry", async (req, res) => {
  try {
    const { month_key, cost } = req.body;
    const { error } = await supabase
      .from('laundry_costs')
      .upsert({ month_key, cost }, { onConflict: 'month_key' });
    
    if (error) throw error;
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Rotta per leggere i costi (usata per vedere i dati salvati)
app.get("/api/get-laundry", async (req, res) => {
  try {
    const { month_key } = req.query;
    const { data, error } = await supabase
      .from('laundry_costs')
      .select('cost')
      .eq('month_key', month_key)
      .single();
    
    if (error && error.code !== 'PGRST116') throw error; 
    res.json({ cost: data ? data.cost : null });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Serve il file index.html
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(port, () => {
  console.log(`Server attivo sulla porta ${port}`);
});
