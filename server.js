const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// USER
let tradeLog = [];
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

    if (short > long * 1.001 && user.balance > coin.price) {
      user.balance -= coin.price;
      tradeLog.unshift("BUY " + c + " @ " + coin.price.toFixed(2));
      user.portfolio[c] = (user.portfolio[c] || 0) + 1;
      coin.buys.push(coin.price);
    }

    if (short < long * 0.999 && user.portfolio[c] > 0) {
      user.balance += coin.price;
      user.portfolio[c] -= 1;
      coin.buys.shift();
    }
  }
}, 3000);

// API
app.get(<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<!-- HEADER -->
<div style="padding:15px;background:#111;display:flex;justify-content:space-between;align-items:center">
  <h2>🚀 PRO TERMINAL</h2>
  <div id="balance" style="font-size:18px"></div>
</div>

<!-- CONTROLS -->
<div style="padding:10px;background:#222;display:flex;gap:10px;flex-wrap:wrap">
  <button onclick="login()">Login</button>
  <button onclick="start()">Start</button>
  <button onclick="stop()">Stop</button>

  <span id="status" style="margin-left:20px;font-weight:bold"></span>

  🌍 EU: <span id="eu"></span>
  🇺🇸 US: <span id="us"></span>
  🇨🇳 CN: <span id="cn"></span>
</div>

<!-- COINS GRID -->
<div id="coins" style="
  display:grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap:15px;
  padding:15px;
"></div>

<!-- TRADE LOG -->
<div id="log" style="padding:15px;background:#111"></div>

<script>
let last = {};

function updateClock(){
  const now = new Date();

  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  balance.innerText = "💰 $" + data.user.balance.toFixed(2);

  if(data.botRunning){
    status.innerText = "🟢 BOT AKTIV";
    status.style.color = "lime";
  }else{
    status.innerText = "🔴 BOT INAKTIV";
    status.style.color = "red";
  }

  let html = '';

  for(let c in data.coins){
    let coin = data.coins[c];
    let prev = last[c] || coin.price;

    let color = coin.price > prev ? "lime" :
                coin.price < prev ? "red" : "white";

    last[c] = coin.price;

    let owned = data.user.portfolio[c] || 0;
    let buys = coin.buys || [];

    let avg = buys.length
      ? (buys.reduce((a,b)=>a+b)/buys.length).toFixed(2)
      : "-";

    html += \`
    <div style="
      background:#161b22;
      padding:15px;
      border-radius:10px;
      box-shadow:0 0 10px rgba(0,0,0,0.5)
    ">
      <h3>\${c}</h3>
      <p style="color:\${color}">$ \${coin.price.toFixed(4)}</p>
      <p>Owned: \${owned}</p>
      <p>Buy: \${avg}</p>

      <button onclick="sell('\${c}')">Sell</button>
    </div>
    \`;
  }

  coins.innerHTML = html;

  // TRADE LOG
  let logHTML = "<h3>Trades</h3>";
  (data.tradeLog || []).slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  log.innerHTML = logHTML;
}

async function sell(c){
  await fetch('/sell',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({symbol:c})
  });
}

async function login(){
  await fetch('/login',{method:'POST'});
  alert("Eingeloggt");
}

async function start(){
  await fetch('/bot/start',{method:'POST'});
  load();
}

async function stop(){
  await fetch('/bot/stop',{method:'POST'});
  load();
}

setInterval(load,2000);
setInterval(updateClock,1000);
load();
</script>

</body>
</html>
`);/data",(req,res)=>{
res.json({user, coins, botRunning, tradeLog});});

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
    tradeLog.unshift("SELL "+s+" @ "+coin.price.toFixed(2));
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
  <div id="log" style="padding:10px;background:#111"></div>
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
let logHTML = "<h3>Trades</h3>";

(data.tradeLog || []).slice(0,10).forEach(t=>{
  logHTML += "<p>"+t+"</p>";
});

document.getElementById("log").innerHTML = logHTML;
</script>

<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 STABLE läuft"));
