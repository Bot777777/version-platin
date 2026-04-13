const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));


// 👤 USER
let user = {
  balance: 10000,
  portfolio: {},
  loggedIn: false
};


// 🤖 BOT STATUS
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


// 📜 TRADE LOG
let tradeLog = [];


// 🌐 LIVE PREISE
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
setInterval(fetchPrices, 4000);


// fallback market (immer aktiv)
setInterval(()=>{
  for(let s in coins){
    let change = (Math.random()-0.5)*0.005;

    coins[s].last = coins[s].price;
    coins[s].price *= (1+change);

    coins[s].history.push(coins[s].price);
    if(coins[s].history.length > 60){
      coins[s].history.shift();
    }
  }
},2000);


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


// 📡 API
app.get("/data",(req,res)=>{
  res.json({
    user,
    coins,
    botRunning,
    tradeLog,
    time: Date.now()
  });
});


// 🔐 LOGIN
app.post("/login",(req,res)=>{
  user.loggedIn = true;
  res.json({loggedIn:true});
});


// ▶ START BOT
app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({running:true});
});


// ⛔ STOP BOT
app.post("/bot/stop",(req,res)=>{
  botRunning = false;
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
app.get("/",(req,res)=>{
  res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:10px;background:#111">
  <div style="display:flex;justify-content:space-between">
    <h2>🚀 PRO TERMINAL V2.1</h2>
    <div id="balance"></div>
  </div>

  <button onclick="login()">Login</button>
  <button onclick="start()">Start</button>
  <button onclick="stop()">Stop</button>
</div>

<div style="padding:10px;background:#222">
  <span id="status"></span> |
  EU: <span id="eu"></span> |
  US: <span id="us"></span> |
  CN: <span id="cn"></span> |
  <span id="market"></span>
</div>

<canvas id="chart" width="400" height="200"></canvas>

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

  document.getElementById("balance").innerText = "Balance: $"+data.user.balance.toFixed(2);

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];

    html += \`
      <div style="background:#222;padding:10px;margin:10px;border-radius:10px">
        <h3>\${c}</h3>
        <p>$ \${coin.price.toFixed(2)}</p>
      </div>
    \`;
  }

  document.getElementById("coins").innerHTML = html;

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  document.getElementById("log").innerHTML = logHTML;

  let trend = Math.random()-0.5;
  document.getElementById("market").innerText =
    trend > 0 ? "📈 Market bullish" : "📉 Market bearish";
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

setInterval(load,3000);
setInterval(updateClock,1000);
load();

</script>

</body>
</html>
  `);
});


// 🚀 SERVER
const PORT = process.env.PORT || 3000;

app.listen(PORT, ()=>{
  console.log("🚀 Server läuft auf Port", PORT);
});
