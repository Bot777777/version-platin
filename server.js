const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

let user = {
  balance: 10000,
  portfolio: {}
};

let botRunning = false;

// 🪙 Mehr Coins
let coins = {
  BTC: { price: 50000, history: [], buys: [] },
  ETH: { price: 3000, history: [], buys: [] },
  SOL: { price: 100, history: [], buys: [] },
  XRP: { price: 0.5, history: [], buys: [] },
  ADA: { price: 0.4, history: [], buys: [] },
  DOGE: { price: 0.1, history: [], buys: [] },
  BNB: { price: 400, history: [], buys: [] }
};

// 📊 „Realistischere“ Marktbewegung
setInterval(() => {
  for (let c in coins) {
    let change = (Math.random() - 0.5) * 0.008;
    coins[c].price *= (1 + change);

    coins[c].history.push(coins[c].price);
    if (coins[c].history.length > 60) coins[c].history.shift();
  }
}, 1500);

// 🧠 AI
function aiDecision(h){
  if (h.length < 20) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let long = h.slice(-20).reduce((a,b)=>a+b)/20;

  if (short > long * 1.002) return "buy";
  if (short < long * 0.998) return "sell";

  return "hold";
}

// 🤖 Bot
setInterval(()=>{
  if (!botRunning) return;

  for (let c in coins){
    let coin = coins[c];
    let decision = aiDecision(coin.history);

    if (decision === "buy" && user.balance > coin.price){
      user.balance -= coin.price;
      user.portfolio[c] = (user.portfolio[c] || 0) + 1;
      coin.buys.push(coin.price);
    }

    if (decision === "sell" && user.portfolio[c] > 0){
      user.balance += coin.price;
      user.portfolio[c] -= 1;
      coin.buys.shift();
    }
  }
},3000);

// API
app.get("/data",(req,res)=>{
  res.json({user, coins, botRunning});
});

app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({ok:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({ok:true});
});

// UI
app.get("/", (req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:10px;background:#111">
  <h2>🚀 PRO Trading Terminal</h2>
  <button onclick="start()">Start</button>
  <button onclick="stop()">Stop</button>
  <h3 id="balance"></h3>
</div>

<canvas id="chart" width="400" height="200"></canvas>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<script>
let chartData = [];

function drawChart(){
  const c = document.getElementById("chart");
  const ctx = c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);

  chartData.forEach((v,i)=>{
    const x = i * 6;
    const open = v.open;
    const close = v.close;
    const high = v.high;
    const low = v.low;

    const color = close > open ? "lime" : "red";

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, 200 - high/50);
    ctx.lineTo(x, 200 - low/50);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x-2, 200 - Math.max(open,close)/50, 4,
      Math.abs(open-close)/50 + 1);
  });
}

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  document.getElementById('balance').innerText =
    '💰 $' + data.user.balance.toFixed(2);

  let html = '';

  for (let c in data.coins){
    const coin = data.coins[c];

    // Kerzen erzeugen
    if (c === "BTC"){
      let h = coin.history;
      if (h.length > 5){
        chartData.push({
          open: h[h.length-5],
          close: h[h.length-1],
          high: Math.max(...h.slice(-5)),
          low: Math.min(...h.slice(-5))
        });
        if (chartData.length > 50) chartData.shift();
        drawChart();
      }
    }

    let owned = data.user.portfolio[c] || 0;
    let buys = coin.buys || [];

    let avgBuy = buys.length
      ? (buys.reduce((a,b)=>a+b)/buys.length).toFixed(2)
      : "-";

    let pnl = buys.length
      ? ((coin.price - avgBuy) * owned).toFixed(2)
      : 0;

    html += \`
    <div style="flex:1 1 250px;margin:10px;padding:15px;background:#161b22;border-radius:10px">
      <h3>\${c}</h3>
      <p>$ \${coin.price.toFixed(4)}</p>
      <p>Owned: \${owned}</p>
      <p>Buy Price: \${avgBuy}</p>
      <p>PnL: \${pnl}</p>
    </div>
    \`;
  }

  document.getElementById('coins').innerHTML = html;
}

async function start(){ await fetch('/bot/start',{method:'POST'}); }
async function stop(){ await fetch('/bot/stop',{method:'POST'}); }

setInterval(load,2000);
load();
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 PRO+ läuft"));
