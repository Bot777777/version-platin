const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 👤 USER
let user = {
  balance: 10000,
  portfolio: {},
  loggedIn: false
};

// 🤖 BOT STATUS
let botRunning = false;

// 🪙 COINS
let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","BNBUSDT"];

let coins = {};
setInterval(() => {
  for (let c in coins) {
    if (!coins[c].price || coins[c].price === 0) {
      coins[c].price = 100 + Math.random()*1000;
    }
  }
}, 1000);
symbols.forEach(s=>{
coins[s] = {
  price: 100 + Math.random()*1000,
  history: [],
  buys: [],
  last: 100,
 
});

// 📜 TRADE LOG
let tradeLog = [];

// 🌍 LIVE PREISE (Binance)
async function fetchPrices(){
  try{
    const res = await fetch("https://api.binance.com/api/v3/ticker/price");
    const data = await res.json();

    data.forEach(item=>{
      if(coins[item.symbol]){
        let price = parseFloat(item.price);

        coins[item.symbol].last = coins[item.symbol].price;
        coins[item.symbol].price = price;

        coins[item.symbol].history.push(price);
        if(coins[item.symbol].history.length > 60)
          coins[item.symbol].history.shift();
        setInterval(fetchPrices, 4000);
fetchPrices();      }
    });
  }catch(e){
    console.log("API Fehler");
  }
}
// Fallback Markt (läuft IMMER)
setInterval(() => {
  for (let s in coins) {
    let change = (Math.random() - 0.5) * 0.005;

    coins[s].last = coins[s].price;
    coins[s].price *= (1 + change);

    coins[s].history.push(coins[s].price);
    if (coins[s].history.length > 60)
      coins[s].history.shift();
  }
}, 2000);
// 🧠 AI
function aiDecision(h){
  if(h.length < 25) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid = h.slice(-10).reduce((a,b)=>a+b)/10;
  let long = h.slice(-25).reduce((a,b)=>a+b)/25;

  let volatility = Math.abs(short - long);

  if(short > mid && mid > long && volatility > long*0.0015){
    return "buy";
  }

  if(short < mid && mid < long && volatility > long*0.0015){
    return "sell";
  }

  return "hold";
}

// 🤖 BOT
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);

    if(decision==="buy" && user.balance > coin.price){
      user.balance -= coin.price;
      user.portfolio[s] = (user.portfolio[s]||0)+1;
      coin.buys.push(coin.price);

      tradeLog.unshift("BUY "+s+" @ "+coin.price.toFixed(2));
    }

    if(decision==="sell" && user.portfolio[s]>0){
      user.balance += coin.price;
      user.portfolio[s]--;
      coin.buys.shift();

      tradeLog.unshift("SELL "+s+" @ "+coin.price.toFixed(2));
    }
  }

},3000);

// 🔌 API
app.get("/data",(req,res)=>{
  res.json({
    user,
    coins,
    botRunning,
    tradeLog,
    time: Date.now()
  });app.get("/", (req,res)=>{
res.send(`

<body style="background:#0b0f14;color:white;font-family:Arial">

<h2>🚀 Trading App</h2>

<div id="coins"></div>

<script>
async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  let html = '';

  for(let c in data.coins){
    let coin = data.coins[c];

    html += `
      <div style="background:#222;padding:10px;margin:10px;border-radius:10px">
        <h3>${c}</h3>
        <p>$ ${coin.price}</p>
      </div>
    `;
  }

  document.getElementById("coins").innerHTML = html;
}

setInterval(load,2000);
load();
</script>

</body>
</html>
`);
});});

app.post("/login",(req,res)=>{
  user.loggedIn = true;
  console.log("USER LOGGED IN");
  res.json({loggedIn:true});
});

app.post("/bot/start",(req,res)=>{
  botRunning = true;
  console.log("BOT STARTED");
  res.json({running:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  console.log("BOT STOPPED");
  res.json({running:false});
});

// 💰 MANUELL SELL
app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol] > 0){
    user.balance += coins[symbol].price;
    user.portfolio[symbol]--;
    coins[symbol].buys.shift();

    tradeLog.unshift("MANUAL SELL "+symbol);
  }

  res.json({ok:true});
});

// 🌐 UI
app.get("/", (req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:10px;background:#111">
  <div style="display:flex;justify-content:space-between;align-items:center">
    <h2>🚀 PRO TERMINAL V2.1</h2>
    <div id="balance" style="font-size:18px"></div>
  </div>

  <div style="margin-top:10px">
    <button onclick="login()">Login</button>
    <button onclick="start()">Start</button>
    <button onclick="stop()">Stop</button>
  </div>
</div>

<div style="padding:10px;background:#222">
  <span id="status" style="font-weight:bold"></span> |
  🌍 EU: <span id="eu"></span> |
  🇺🇸 US: <span id="us"></span> |
  🇨🇳 CN: <span id="cn"></span> |
  <span id="market"></span>
</div>

<canvas id="chart" width="400" height="200"></canvas>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<div id="log" style="padding:10px;background:#111"></div>

<script>
let last = {};
let chartData = [];

function drawChart(){
  const c = document.getElementById("chart");
  const ctx = c.getContext("2d");

  ctx.clearRect(0,0,c.width,c.height);

  chartData.forEach((v,i)=>{
    const x = i * 6;
    const color = v.close > v.open ? "lime" : "red";

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x,200 - v.high/1000);
    ctx.lineTo(x,200 - v.low/1000);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x-2,200 - Math.max(v.open,v.close)/1000,4,
      Math.abs(v.open-v.close)/1000 + 1);
  });
}

function updateClock(){
  const now = new Date();

  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  let html = '';

  // 👉 DEBUG (falls coins fehlt)
  if(!data.coins){
    document.getElementById("coins").innerHTML = "KEINE COINS!";
    return;
  }

  for(let c in data.coins){
    let coin = data.coins[c];

    html += `
      <div style="
        background:#222;
        padding:15px;
        margin:10px;
        border-radius:10px
      ">
        <h3>${c}</h3>
        <p>$ ${coin.price}</p>
      </div>
    `;
  }

  document.getElementById("coins").innerHTML = html;
}  coins.innerHTML = html;

  market.innerText = trend > 0 ? "📈 Markt bullish" : "📉 Markt bearish";

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  document.getElementById("log").innerHTML = logHTML;
}

async function sell(s){
  await fetch('/sell',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body: JSON.stringify({symbol:s})
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

setInterval(load,3000);
setInterval(updateClock,1000);
load();
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 V2.1 PRO läuft"));
