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

let coins = {
  BTC: { price: 50000, history: [] },
  ETH: { price: 3000, history: [] },
  SOL: { price: 100, history: [] }
};

// 📊 Marktbewegung realistischer
setInterval(() => {
  for (let c in coins) {
    let volatility = 0.01;
    let change = (Math.random() - 0.5) * volatility;

    coins[c].price *= (1 + change);

    coins[c].history.push(coins[c].price);
    if (coins[c].history.length > 50) coins[c].history.shift();
  }
}, 1500);

// 🧠 bessere KI
function aiDecision(h) {
  if (h.length < 20) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let long = h.slice(-20).reduce((a,b)=>a+b)/20;

  let momentum = short - long;

  if (momentum > long * 0.002) return "buy";
  if (momentum < -long * 0.002) return "sell";

  return "hold";
}

// 🤖 Bot
setInterval(() => {
  if (!botRunning) return;

  for (let c in coins) {
    let coin = coins[c];
    let decision = aiDecision(coin.history);

    if (decision === "buy" && user.balance > coin.price) {
      user.balance -= coin.price;
      user.portfolio[c] = (user.portfolio[c] || 0) + 1;
    }

    if (decision === "sell" && user.portfolio[c] > 0) {
      user.balance += coin.price;
      user.portfolio[c] -= 1;
    }
  }
}, 3000);

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

// 👉 MANUELL VERKAUFEN
app.post("/sell",(req,res)=>{
  const {coin} = req.body;

  if (!botRunning && user.portfolio[coin] > 0) {
    user.balance += coins[coin].price;
    user.portfolio[coin] -= 1;
  }

  res.json({ok:true});
});

// UI
app.get("/", (req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:10px;background:#111;display:flex;justify-content:space-between">
  <h2>🚀 PRO Trading Terminal</h2>
  <div>
    <button onclick="start()">Start</button>
    <button onclick="stop()">Stop</button>
  </div>
</div>

<div style="padding:10px;background:#222">
  <span id="status"></span> |
  <span id="balance"></span> |
  🌍 EU: <span id="eu"></span> |
  🇺🇸 US: <span id="us"></span> |
  🇨🇳 CN: <span id="cn"></span>
</div>

<canvas id="chart" width="400" height="150"></canvas>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<script>
let last = {};
let chartData = [];

function drawChart(){
  const c = document.getElementById("chart");
  const ctx = c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);

  ctx.beginPath();
  chartData.forEach((v,i)=>{
    let x = i * 5;
    let y = 150 - v;
    if(i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.strokeStyle = "lime";
  ctx.stroke();
}

function updateClock(){
  const now = new Date();

  document.getElementById("eu").innerText =
    now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});

  document.getElementById("us").innerText =
    now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});

  document.getElementById("cn").innerText =
    now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  document.getElementById('balance').innerText =
    '💰 $' + data.user.balance.toFixed(2);

  document.getElementById('status').innerText =
    data.botRunning ? '🟢 BOT RUNNING' : '🔴 STOPPED';

  let html = '';

  for (let c in data.coins){
    const coin = data.coins[c];
    const prev = last[c] || coin.price;

    const color = coin.price > prev ? 'lime' :
                  coin.price < prev ? 'red' : 'white';

    last[c] = coin.price;

    if(c==="BTC"){
      chartData.push(coin.price/500);
      if(chartData.length>50) chartData.shift();
      drawChart();
    }

    html += \`
    <div style="flex:1 1 250px;margin:10px;padding:15px;background:#161b22;border-radius:10px">
      <h3>\${c}</h3>
      <p style="color:\${color}">$ \${coin.price.toFixed(2)}</p>
      <p>Owned: \${data.user.portfolio[c]||0}</p>
      <button onclick="sell('\${c}')">Sell</button>
    </div>
    \`;
  }

  document.getElementById('coins').innerHTML = html;
}

async function sell(c){
  await fetch('/sell',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({coin:c})
  });
}

async function start(){ await fetch('/bot/start',{method:'POST'}); }
async function stop(){ await fetch('/bot/stop',{method:'POST'}); }

setInterval(load,2000);
setInterval(updateClock,1000);
load();
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 ULTRA PRO läuft"));
