const express = require("express");
const cors = require("cors");
const path = require("path");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// ================= USER =================
let user = {
  balance: 10000,
  portfolio: {},
  loggedIn: false,
  profit: 0
};

// ================= BOT =================
let botRunning = false;

// ================= COINS =================
let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT","DOGEUSDT","BNBUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 0,
    history: [],
    buys: [],
    last: 0
  };
});

// ================= TRADE LOG =================
let tradeLog = [];

// ================= AXIOS PRICE FETCH =================
async function fetchPrices(){
  try{
    const res = await axios.get("https://api.binance.com/api/v3/ticker/price");
    const data = res.data;

    data.forEach(item=>{
      if(coins[item.symbol]){
        let price = parseFloat(item.price);

        coins[item.symbol].last = coins[item.symbol].price;
        coins[item.symbol].price = price;

        coins[item.symbol].history.push(price);
        if(coins[item.symbol].history.length > 100){
          coins[item.symbol].history.shift();
        }
      }
    });

  }catch(e){
    console.log("API Fehler → Fallback aktiv");
  }
}

setInterval(fetchPrices, 3000);

// ================= FALLBACK MARKET =================
setInterval(()=>{
  for(let s in coins){
    let change = (Math.random() - 0.5) * 0.01;
    coins[s].last = coins[s].price;
    coins[s].price *= (1 + change);
  }
},2000);

// ================= AGGRESSIVER PROFIT BOT =================
function aiDecision(h){

  if(h.length < 30) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid = h.slice(-15).reduce((a,b)=>a+b)/15;
  let long = h.slice(-30).reduce((a,b)=>a+b)/30;

  let momentum = short - mid;
  let trend = mid - long;

  // 🔥 Scalping Edge
  if(momentum > 0 && trend > 0){
    return "buy";
  }

  if(momentum < 0 && trend < 0){
    return "sell";
  }

  return "hold";
}

// ================= BOT LOOP =================
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);

    // BUY
    if(decision === "buy" && user.balance > coin.price){

      let amount = 0.1; // 🔥 kleine Trades → Scalping

      user.balance -= coin.price * amount;
      user.portfolio[s] = (user.portfolio[s] || 0) + amount;

      coin.buys.push(coin.price);

      tradeLog.unshift("BUY "+s+" @ "+coin.price.toFixed(2));
    }

    // SELL
    if(decision === "sell" && user.portfolio[s] > 0){

      let amount = user.portfolio[s];

      let buyPrice = coin.buys[0] || coin.price;
      let profit = (coin.price - buyPrice) * amount;

      user.balance += coin.price * amount;
      user.portfolio[s] = 0;

      coin.buys.shift();

      user.profit += profit;

      tradeLog.unshift("SELL "+s+" @ "+coin.price.toFixed(2)+" | +"+profit.toFixed(2));
    }
  }

},1500);

// ================= API =================
app.get("/data",(req,res)=>{
  res.json({
    user,
    coins,
    botRunning,
    tradeLog,
    time: Date.now()
  });
});

// ================= LOGIN =================
app.post("/login",(req,res)=>{
  user.loggedIn = true;
  res.json({ok:true});
});

// ================= BOT CONTROL =================
app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({running:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({running:false});
});

// ================= MANUAL SELL =================
app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol] > 0){
    let coin = coins[symbol];

    user.balance += coin.price * user.portfolio[symbol];
    user.portfolio[symbol] = 0;

    tradeLog.unshift("MANUAL SELL "+symbol);
  }

  res.json({ok:true});
});

// ================= UI =================
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:20px;background:#111;text-align:center">
<h1>🚀 PRO TERMINAL V6</h1>

<div>
Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span>
</div>

<div style="margin-top:10px">
<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>
</div>

<div style="margin-top:10px">
Status: <span id="status"></span>
</div>

<div>
🌍 <span id="eu"></span> |
🇺🇸 <span id="us"></span> |
🇨🇳 <span id="cn"></span>
</div>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap;justify-content:center"></div>

<div id="log" style="padding:10px;background:#111;margin-top:20px"></div>

<script>

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  balance.innerText = data.user.balance.toFixed(2);
  profit.innerText = data.user.profit.toFixed(2);

  status.innerHTML = data.botRunning ? "🟢 BOT ACTIVE" : "🔴 BOT STOPPED";

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];

    html += \`
    <div style="background:#222;padding:10px;margin:10px;border-radius:10px;width:200px">
      <h3>\${c}</h3>
      <p>Price: \${coin.price.toFixed(2)}</p>
      <p>Owned: \${data.user.portfolio[c]||0}</p>
      <button onclick="sell('\${c}')">SELL</button>
    </div>
    \`;
  }

  coins.innerHTML = html;

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  log.innerHTML = logHTML;
}

// CLOCK
function updateClock(){
  let now = new Date();
  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

// ACTIONS
async function login(){ await fetch('/login',{method:'POST'}); }
async function start(){ await fetch('/bot/start',{method:'POST'}); }
async function stop(){ await fetch('/bot/stop',{method:'POST'}); }
async function sell(s){ await fetch('/sell',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({symbol:s})}); }

setInterval(load,2000);
setInterval(updateClock,1000);
load();

</script>
</body>
</html>
`);
});

// ================= START =================
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 BOT RUNNING"));
