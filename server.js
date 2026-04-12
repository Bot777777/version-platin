const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// USER
let user = {
  balance: 10000,
  portfolio: {}
};

let botRunning = false;

// COINS (IMMER DA)
let coins = {
  BTCUSDT: { price: 50000, last: 50000, history: [], buys: [] },
  ETHUSDT: { price: 3000, last: 3000, history: [], buys: [] },
  SOLUSDT: { price: 100, last: 100, history: [], buys: [] },
  XRPUSDT: { price: 0.5, last: 0.5, history: [], buys: [] },
  ADAUSDT: { price: 0.4, last: 0.4, history: [], buys: [] }
};

// FALLBACK MARKT (läuft IMMER)
setInterval(() => {
  for (let c in coins) {
    let change = (Math.random() - 0.5) * 0.005;
    coins[c].last = coins[c].price;
    coins[c].price *= (1 + change);

    coins[c].history.push(coins[c].price);
    if (coins[c].history.length > 50) coins[c].history.shift();
  }
}, 2000);

// AI BOT
setInterval(() => {
  if (!botRunning) return;

  for (let c in coins) {
    let coin = coins[c];
    let h = coin.history;

    if (h.length < 10) continue;

    let short = h.slice(-3).reduce((a,b)=>a+b)/3;
    let long = h.slice(-8).reduce((a,b)=>a+b)/8;

    if (short > long * 1.002 && user.balance > coin.price) {
      user.balance -= coin.price;
      user.portfolio[c] = (user.portfolio[c] || 0) + 1;
      coin.buys.push(coin.price);
    }

    if (short < long * 0.998 && user.portfolio[c] > 0) {
      user.balance += coin.price;
      user.portfolio[c] -= 1;
      coin.buys.shift();
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

// SELL
app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol] > 0){
    user.balance += coins[symbol].price;
    user.portfolio[symbol]--;
    coins[symbol].buys.shift();
  }

  res.json({ok:true});
});

// UI
app.get("/", (req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:10px;background:#111;display:flex;justify-content:space-between">
  <h2>🚀 STABLE TRADING</h2>
  <div id="balance"></div>
</div>

<div style="padding:10px;background:#222">
  <span id="status"></span>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<script>
let last = {};

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  balance.innerText = "$" + data.user.balance.toFixed(2);

  status.innerText = data.botRunning ? "🟢 BOT" : "🔴 STOP";

  let html='';

  for(let c in data.coins){
    let coin = data.coins[c];
    let prev = last[c] || coin.price;

    let color = coin.price > prev ? "lime" : "red";

    last[c] = coin.price;

    html += \`
    <div style="flex:1 1 200px;margin:10px;padding:10px;background:#161b22">
      <h3>\${c}</h3>
      <p style="color:\${color}">$ \${coin.price.toFixed(4)}</p>
      <p>Owned: \${data.user.portfolio[c]||0}</p>
      <button onclick="sell('\${c}')">Sell</button>
    </div>
    \`;
  }

  coins.innerHTML = html;
}

async function sell(s){
  await fetch('/sell',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({symbol:s})
  });
}

async function start(){ await fetch('/bot/start',{method:'POST'}); }
async function stop(){ await fetch('/bot/stop',{method:'POST'}); }

setInterval(load,2000);
load();
</script>

<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 STABLE läuft"));
