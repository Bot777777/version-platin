const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let balance = 10000;
let running = true;

let coins = {
  BTC: { price: 50000, owned: 0, history: [] },
  ETH: { price: 3000, owned: 0, history: [] },
  SOL: { price: 100, owned: 0, history: [] }
};

// 📊 Preis Simulation
setInterval(() => {
  for (let c in coins) {
    let change = (Math.random() - 0.5) * 0.01;
    coins[c].price *= (1 + change);

    coins[c].history.push(coins[c].price);
    if (coins[c].history.length > 30) coins[c].history.shift();
  }
}, 1500);

// 🧠 KI Entscheidung
function aiDecision(coin) {
  const h = coin.history;
  if (h.length < 10) return "hold";

  const short = h.slice(-5).reduce((a,b)=>a+b)/5;
  const long = h.slice(-10).reduce((a,b)=>a+b)/10;

  if (short > long * 1.002) return "buy";
  if (short < long * 0.998) return "sell";
  return "hold";
}

// 🤖 BOT LOOP
setInterval(() => {
  if (!running) return;

  for (let c in coins) {
    const coin = coins[c];
    const decision = aiDecision(coin);

    if (decision === "buy" && balance >= coin.price) {
      balance -= coin.price;
      coin.owned += 1;
    }

    if (decision === "sell" && coin.owned > 0) {
      balance += coin.price;
      coin.owned -= 1;
    }
  }
}, 3000);

// API
app.get("/data", (req, res) => {
  res.json({ balance, coins, running });
});

app.post("/toggle", (req, res) => {
  running = !running;
  res.json({ running });
});

// UI
app.get("/", (req, res) => {
  res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:20px;background:#111">
  <h2>🤖 AI Trading Bot PRO</h2>
  <h3 id="balance"></h3>
  <button onclick="toggle()">Bot Start/Stop</button>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<script>
let lastPrices = {};

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  document.getElementById('balance').innerText =
    'Balance: $' + data.balance.toFixed(2);

  let html = '';

  for (let c in data.coins){
    const coin = data.coins[c];
    const last = lastPrices[c] || coin.price;

    const color = coin.price > last ? 'lime' :
                  coin.price < last ? 'red' : 'white';

    lastPrices[c] = coin.price;

    html += \`
    <div style="flex:1 1 300px;margin:15px;padding:20px;background:#161b22;border-radius:10px">
      <h2>\${c}</h2>
      <p style="color:\${color}">$ \${coin.price.toFixed(2)}</p>
      <p>Owned: \${coin.owned}</p>
    </div>
    \`;
  }

  document.getElementById('coins').innerHTML = html;
}

async function toggle(){
  await fetch('/toggle',{method:'POST'});
}

setInterval(load,1500);
load();
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🤖 AI BOT läuft"));
