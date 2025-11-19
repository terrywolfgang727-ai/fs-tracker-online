const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// Allow ALL ORIGINS → works everywhere
app.use(cors());

app.use(express.json());

let clients = [];

// ========= SSE Stream =========
app.get("/stream", (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");

    clients.push(res);

    req.on("close", () => {
        clients = clients.filter(c => c !== res);
    });
});

function broadcast(data) {
    clients.forEach(res => {
        res.write(`data: ${JSON.stringify(data)}\n\n`);
    });
}

// ========= CORS Preflight =========
app.options("/log", (req, res) => {
    res.sendStatus(200);
});

// ========= POST /log =========
app.post("/log", (req, res) => {
    console.log("📥 Received log:", req.body);
    broadcast(req.body);
    res.json({ status: "ok" });
});

// GET handler (optional)
app.get("/log", (req, res) => {
    res.json({ message: "Use POST /log" });
});

// Dashboard
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "dashboard.html"));
});

// Deploy-friendly port
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log("Server running on port", PORT);
});
