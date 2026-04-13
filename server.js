const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());

// USER
let user = {
  balance: 10000,
  profitBank: 0,
  portfolio: {},
  loggedIn: false
};

let botRunning = false;

let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 100 + Math.random()*1000,
    history: [],
    candles: [],
    last: 100
  };
});

let tradeLog = [];

// MARKET
setInterval(()=>{
  for(let s in coins){
    let c = coins[s];

    let open = c.price;
    let change = (Math.random()-0.5)*0.02;
    let close = open * (1+change);
    let high = Math.max(open, close)*(1+Math.random()*0.01);
    let low = Math.min(open, close)*(1-Math.random()*0.01);

    c.price = close;

    c.candles.push({open,close,high,low});
    if(c.candles.length > 40) c.candles.shift();

    c.history.push(close);
    if(c.history.length > 40) c.history.shift();
  }
},2000);

// AI
function aiDecision(h){
  if(h.length < 20) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let long = h.slice(-20).reduce((a,b)=>a+b)/20;

  let momentum = (short - long)/long;

  if(momentum > 0.01) return "buy";
  if(momentum < -0.01) return "sell";

  return "hold";
}

// BOT
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);

    if(decision==="buy" && user.balance > coin.price){
      let amount = Math.floor(user.balance / coin.price * 0.3);
      if(amount < 1) amount = 1;

      user.balance -= coin.price * amount;
      user.portfolio[s] = (user.portfolio[s]||0) + amount;

      tradeLog.unshift("🔥 BUY "+amount+" "+s);
    }

    if(decision==="sell" && user.portfolio[s]>0){
      user.balance += coin.price * user.portfolio[s];
      tradeLog.unshift("💥 SELL "+user.portfolio[s]+" "+s);
      user.portfolio[s] = 0;
    }
  }

  // PROFIT LOCK
  if(user.balance > 10000){
    let profit = user.balance - 10000;
    user.balance = 10000;
    user.profitBank += profit;
    tradeLog.unshift("💰 PROFIT "+profit.toFixed(2));
  }

},3000);

// API
app.get("/data",(req,res)=>{
  res.json({
    user,
    coins,
    botRunning,
    tradeLog
  });
});

// ROUTES
app.post("/login",(req,res)=>{
  user.loggedIn = true;
  res.json({ok:true});
});

app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({running:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({running:false});
});

app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol] > 0){
    user.balance += coins[symbol].price * user.portfolio[symbol];
    user.portfolio[symbol] = 0;
    tradeLog.unshift("MANUAL SELL "+symbol);
  }

  res.json({ok:true});
});

// UI
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<div style="max-width:1200px;margin:auto">

<h2>🚀 PRO TERMINAL V5</h2>

<div>
Balance: $<span id="balance"></span> |
Portfolio: $<span id="portfolio"></span> |
Profit: $<span id="profit"></span>
</div>

<div id="status"></div>

<div style="margin-top:10px">
<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>
</div>

<div style="margin-top:10px">
🌍 🇪🇺 <span id="eu"></span> |
🇺🇸 <span id="us"></span> |
🇨🇳 <span id="cn"></span>
</div>

<div id="coins"></div>
<div id="log"></div>

</div>

<script>
let selectedCoin = null;

function selectCoin(c){
  selectedCoin = selectedCoin === c ? null : c;
}

function updateClock(){
  let now = new Date();
  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

function drawChart(candles){
  let html = '<canvas width="600" height="250"></canvas>';
  return html;
}

async function load(){
  const res = await fetch("/data");
  const data = await res.json();

  balance.innerText = data.user.balance.toFixed(2);
  profit.innerText = data.user.profitBank.toFixed(2);

  let portfolioValue = 0;
  for(let c in data.user.portfolio){
    portfolioValue += (data.user.portfolio[c]||0) * data.coins[c].price;
  }
  portfolio.innerText = portfolioValue.toFixed(2);

  status.innerHTML = data.botRunning
    ? "🟢 BOT ACTIVE"
    : "🔴 BOT STOPPED";

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];

    html += \`
    <div style="background:#1a1f26;padding:15px;margin:15px;border-radius:12px">
      <div onclick="selectCoin('\${c}')" style="cursor:pointer">
        <h2>\${c}</h2>
        <p>Price: $\${coin.price.toFixed(2)}</p>
        <p>Owned: \${data.user.portfolio[c]||0}</p>
      </div>

      <button onclick="sell('\${c}')">SELL</button>

      \${selectedCoin===c ? '<canvas id="chart_'+c+'" width="800" height="300"></canvas>' : ''}
    </div>
    \`;
  }

  coins.innerHTML = html;

  if(selectedCoin){
    let ctx = document.getElementById("chart_"+selectedCoin).getContext("2d");
    let candles = data.coins[selectedCoin].candles;

    candles.forEach((v,i)=>{
      let x = i * 12;
      let open = 300 - v.open/10;
      let close = 300 - v.close/10;
      let high = 300 - v.high/10;
      let low = 300 - v.low/10;

      ctx.strokeStyle = "white";
      ctx.beginPath();
      ctx.moveTo(x,high);
      ctx.lineTo(x,low);
      ctx.stroke();

      ctx.fillStyle = v.close > v.open ? "lime" : "red";
      ctx.fillRect(x-3, Math.min(open,close),6,Math.abs(open-close)+1);
    });
  }

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  log.innerHTML = logHTML;
}

async function sell(s){
  await fetch("/sell",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:s})});
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

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 V5 RUNNING"));
