const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

// Allow all origins (you locked usage via your own script anyway)
app.use(cors());
app.use(express.json());

let clients = [];
let allLogs = []; // 🔹 store all logs here in memory

// ========= SSE STREAM FOR DASHBOARD =========
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

// ========= HISTORY ENDPOINT (for dashboard initial load) =========
app.get("/history", (req, res) => {
  // You can limit if you want: e.g. last 1000
  res.json(allLogs);
});

// ========= PRE-FLIGHT =========
app.options("/log", (req, res) => {
  res.sendStatus(200);
});

// ========= POST /log – called by your Tampermonkey script =========
app.post("/log", (req, res) => {
  const logEntry = {
    ...req.body,
    serverReceivedAt: new Date().toISOString()
  };

  // Save in memory
  allLogs.push(logEntry);

  // Optional: keep memory small (e.g. last 2000 logs)
  if (allLogs.length > 2000) {
    allLogs = allLogs.slice(allLogs.length - 2000);
  }

  console.log("📥 Received log:", logEntry);

  // Push to all connected dashboards
  broadcast(logEntry);

  res.json({ status: "ok" });
});

// Optional: GET /log info
app.get("/log", (req, res) => {
  res.json({ message: "Use POST /log to send data." });
});

// ========= DASHBOARD PAGE =========
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "dashboard.html"));
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server running on port", PORT);
});
