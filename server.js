const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());


// 👤 USER
let user = {
  balance: 10000,
  portfolio: {},
  loggedIn: false
};


// 🤖 BOT
let botRunning = false;


// 💰 COINS
let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","BNBUSDT"];

let coins = {};

symbols.forEach(s=>{
  coins[s] = {
    price: 100 + Math.random()*1000,
    history: [],
    buys: [],
    last: 100
  };
});


// 📜 LOG
let tradeLog = [];


// 🌐 API PRICES
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
        if(coins[item.symbol].history.length > 60){
          coins[item.symbol].history.shift();
        }
      }
    });

  }catch(e){
    console.log("API Fehler");
  }
}
setInterval(fetchPrices,4000);


// fallback
setInterval(()=>{
  for(let s in coins){
    let change = (Math.random()-0.5)*0.01;

    coins[s].last = coins[s].price;
    coins[s].price *= (1+change);

    coins[s].history.push(coins[s].price);
    if(coins[s].history.length > 60){
      coins[s].history.shift();
    }
  }
},2000);


// 🧠 AGGRESSIVE AI
function aiDecision(h){
  if(h.length < 25) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid = h.slice(-10).reduce((a,b)=>a+b)/10;
  let long = h.slice(-25).reduce((a,b)=>a+b)/25;

  let momentum = short - mid;
  let trend = mid - long;

  if(momentum > 0 && trend > 0){
    return "buy";
  }

  if(momentum < 0 && trend < 0){
    return "sell";
  }

  return "hold";
}


// 🤖 BOT ENGINE
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

},2000);


// 📡 API
app.get("/data",(req,res)=>{
  res.json({
    user,
    coins,
    botRunning,
    tradeLog
  });
});


// 🔐 LOGIN
app.post("/login",(req,res)=>{
  user.loggedIn = true;
  res.json({ok:true});
});


// ▶ START
app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({ok:true});
});


// ⛔ STOP
app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({ok:true});
});


// 💰 MANUAL SELL
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
app.get("/",(req,res)=>{
  res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:10px;background:#111">
  <h2>🚀 PRO TERMINAL V3</h2>
  <div id="balance"></div>

  <button onclick="login()">Login</button>
  <button onclick="start()">Start</button>
  <button onclick="stop()">Stop</button>
</div>

<div style="padding:10px;background:#222">
  <b>Status:</b> <span id="status"></span> |
  🇪🇺 <span id="eu"></span> |
  🇺🇸 <span id="us"></span> |
  🇨🇳 <span id="cn"></span> |
  <span id="market"></span>
</div>

<div id="coins"></div>
<div id="log"></div>

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

  document.getElementById("status").innerText =
    data.botRunning ? "🟢 BOT ACTIVE" : "🔴 BOT STOPPED";

  let portfolioValue = 0;

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];
    let amount = data.user.portfolio[c] || 0;

    portfolioValue += amount * coin.price;

    html += \`
      <div style="background:#222;padding:10px;margin:10px;border-radius:10px">
        <h3>\${c}</h3>
        <p>💲 Price: \${coin.price.toFixed(2)}</p>
        <p>📦 Owned: \${amount}</p>
        <button onclick="sell('\${c}')">SELL</button>
      </div>
    \`;
  }

  document.getElementById("coins").innerHTML = html;

  document.getElementById("balance").innerText =
    "Balance: $" + data.user.balance.toFixed(2) +
    " | Portfolio: $" + portfolioValue.toFixed(2);

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  document.getElementById("log").innerHTML = logHTML;

  let trend = Math.random()-0.5;
  document.getElementById("market").innerText =
    trend > 0 ? "📈 Bullish" : "📉 Bearish";
}


async function sell(s){
  await fetch("/sell",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({symbol:s})
  });
}


async function login(){
  await fetch("/login",{method:"POST"});
}

async function start(){
  await fetch("/bot/start",{method:"POST"});
}

async function stop(){
  await fetch("/bot/stop",{method:"POST"});
}

setInterval(load,2000);
setInterval(updateClock,1000);

load();

</script>

</body>
</html>
  `);
});


// 🚀 START
const PORT = process.env.PORT || 3000;

app.listen(PORT,()=>{
  console.log("🚀 PRO BOT läuft auf Port",PORT);
});
