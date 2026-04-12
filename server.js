const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());

let running = false;
let balance = 1000;

// Bot Simulation
async function botLoop() {
  while (running) {
    const random = Math.random();

    if (random > 0.55) balance *= 1.002;
    if (random < 0.45) balance *= 0.998;

    await new Promise(r => setTimeout(r, 2000));
  }
}

// API
app.get("/status", (req, res) => {
  res.json({ running, balance });
});

app.post("/start", (req, res) => {
  if (!running) {
    running = true;
    botLoop();
  }
  res.json({ status: "started" });
});

app.post("/stop", (req, res) => {
  running = false;
  res.json({ status: "stopped" });
});

// 👉 DAS IST DEINE APP UI
app.get("/", (req, res) => {
  res.send(`
    <html>
    <body style="font-family:Arial;text-align:center;margin-top:40px">

    <h1>🚀 AI Trading Bot</h1>

    <button onclick="start()">▶️ Start</button>
    <button onclick="stop()">⏹ Stop</button>

    <h2 id="status"></h2>
    <h2 id="balance"></h2>

    <script>
    async function update(){
      const res = await fetch('/status');
      const data = await res.json();

      document.getElementById('status').innerText =
        data.running ? '🟢 Running' : '🔴 Stopped';

      document.getElementById('balance').innerText =
        'Balance: $' + data.balance.toFixed(2);
    }

    async function start(){
      await fetch('/start',{method:'POST'});
    }

    async function stop(){
      await fetch('/stop',{method:'POST'});
    }

    setInterval(update,2000);
    update();
    </script>

    </body>
    </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("Server läuft"));
