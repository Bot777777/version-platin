const express = require("express");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());


// USER
let user = {
  balance: 10000,
  portfolio: {},
  entry: {},
  loggedIn: false
};


// BOT
let botRunning = false;


// COINS
let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","BNBUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 100 + Math.random()*1000,
    history: []
  };
});


// LOG
let tradeLog = [];


// PRICE SIM
setInterval(()=>{
  for(let s in coins){
    let change = (Math.random()-0.5)*0.02;
    coins[s].price *= (1+change);

    coins[s].history.push(coins[s].price);
    if(coins[s].history.length>60) coins[s].history.shift();
  }
},2000);


// AI
function aiDecision(h){
  if(h.length<20) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let long = h.slice(-20).reduce((a,b)=>a+b)/20;

  if(short > long*1.002) return "buy";
  if(short < long*0.998) return "sell";

  return "hold";
}


// BOT ENGINE
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);

    if(decision==="buy" && user.balance > coin.price){
      user.balance -= coin.price;
      user.portfolio[s] = (user.portfolio[s]||0)+1;
      user.entry[s] = coin.price;

      tradeLog.unshift("BUY "+s);
    }

    if(decision==="sell" && user.portfolio[s]>0){
      user.balance += coin.price;
      user.portfolio[s]--;

      tradeLog.unshift("SELL "+s);
    }
  }

},2000);


// API
app.get("/data",(req,res)=>{
  res.json({user,coins,botRunning,tradeLog});
});

app.post("/login",(req,res)=>{
  user.loggedIn = true;
  res.json({ok:true});
});

app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({ok:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({ok:true});
});

app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol]>0){
    user.balance += coins[symbol].price;
    user.portfolio[symbol]--;

    tradeLog.unshift("MANUAL SELL "+symbol);
  }

  res.json({ok:true});
});


// UI
app.get("/",(req,res)=>{
  res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="max-width:1200px;margin:auto;padding:20px">

<h1>🚀 PRO TERMINAL V4</h1>

<div style="display:flex;justify-content:space-between;margin-bottom:20px">
  <div id="balance"></div>
  <div>
    <button onclick="login()">Login</button>
    <button onclick="start()">Start</button>
    <button onclick="stop()">Stop</button>
  </div>
</div>

<div style="margin-bottom:20px">
  <span id="status"></span> |
  🇪🇺 <span id="eu"></span> |
  🇺🇸 <span id="us"></span> |
  🇨🇳 <span id="cn"></span>
</div>

<div id="coins" style="
  display:grid;
  grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
  gap:15px;
"></div>

<div id="log" style="margin-top:30px"></div>

</div>

<script>

function updateClock(){
  let now = new Date();
  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

async function load(){
  const res = await fetch("/data");
  const data = await res.json();

  let portfolioValue = 0;
  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];
    let amount = data.user.portfolio[c]||0;
    let entry = data.user.entry[c]||coin.price;

    let pnl = (coin.price - entry)*amount;
    portfolioValue += amount*coin.price;

    html += \`
      <div style="
        background:#1a1f26;
        padding:15px;
        border-radius:10px;
        box-shadow:0 0 10px #000;
      ">
        <h2>\${c}</h2>
        <p>💲 \${coin.price.toFixed(2)}</p>
        <p>📦 \${amount}</p>
        <p style="color:\${pnl>=0?'lime':'red'}">
          PnL: \${pnl.toFixed(2)}
        </p>
        <button onclick="sell('\${c}')">SELL</button>
      </div>
    \`;
  }

  document.getElementById("coins").innerHTML = html;

  document.getElementById("balance").innerText =
    "Balance: $" + data.user.balance.toFixed(2) +
    " | Portfolio: $" + portfolioValue.toFixed(2);

  document.getElementById("status").innerText =
    data.botRunning ? "🟢 BOT ACTIVE" : "🔴 BOT STOPPED";

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  document.getElementById("log").innerHTML = logHTML;
}

async function sell(s){
  await fetch("/sell",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({symbol:s})
  });
}

async function login(){ await fetch("/login",{method:"POST"}); }
async function start(){ await fetch("/bot/start",{method:"POST"}); }
async function stop(){ await fetch("/bot/stop",{method:"POST"}); }

setInterval(load,2000);
setInterval(updateClock,1000);

load();

</script>

</body>
</html>
`);
});


// START
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 V4 läuft"));
