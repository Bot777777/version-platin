const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "frontend")));

// USER
let user = {
  balance: 10000,
  profitBank: 0,
  portfolio: {},
  loggedIn: false
};

// BOT STATUS
let botRunning = false;

// COINS
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

// TRADE LOG
let tradeLog = [];

// PRICE UPDATE
setInterval(()=>{
  for(let s in coins){
    let change = (Math.random()-0.5)*0.01;
    coins[s].last = coins[s].price;
    coins[s].price *= (1+change);

    coins[s].history.push(coins[s].price);
    if(coins[s].history.length > 60) coins[s].history.shift();
  }
},2000);

// AI
function aiDecision(h){
  if(h.length < 25) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid = h.slice(-10).reduce((a,b)=>a+b)/10;
  let long = h.slice(-25).reduce((a,b)=>a+b)/25;

  if(short > mid && mid > long) return "buy";
  if(short < mid && mid < long) return "sell";

  return "hold";
}

// BOT
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

  // 💰 PROFIT SYSTEM
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
    tradeLog,
    time: Date.now()
  });
});

// LOGIN
app.post("/login",(req,res)=>{
  user.loggedIn = true;
  res.json({ok:true});
});

// BOT START/STOP
app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({running:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({running:false});
});

// MANUAL SELL
app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol] > 0){
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
<body style="background:#0b0f14;color:white;font-family:Arial">

<h2>🚀 PRO TERMINAL V3</h2>

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
🌍 🇪🇺 <span id="eu"></span> |
🇺🇸 <span id="us"></span> |
🇨🇳 <span id="cn"></span>
</div>

<canvas id="chart" width="400" height="200"></canvas>

<div id="coins"></div>
<div id="log"></div>

<script>
let selectedCoin = null;

function selectCoin(c){
  selectedCoin = c;
}

function updateClock(){
  let now = new Date();
  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

function drawChart(history){
  let c = document.getElementById("chart");
  let ctx = c.getContext("2d");

  ctx.clearRect(0,0,400,200);

  history.forEach((p,i)=>{
    let x = i*5;
    let y = 200 - p/10;
    ctx.fillStyle="lime";
    ctx.fillRect(x,y,2,2);
  });
}

async function load(){
  const res = await fetch("/data");
  const data = await res.json();

  balance.innerText = data.user.balance.toFixed(2);
  profit.innerText = data.user.profitBank.toFixed(2);

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];

    html += \`
    <div onclick="selectCoin('\${c}')" style="background:#222;padding:10px;margin:10px;border-radius:10px;cursor:pointer">
      <h3>\${c}</h3>
      <p>Price: $\${coin.price.toFixed(2)}</p>
      <p>Owned: \${data.user.portfolio[c]||0}</p>
      <button onclick="event.stopPropagation();sell('\${c}')">SELL</button>
    </div>
    \`;
  }

  coins.innerHTML = html;

  if(selectedCoin){
    drawChart(data.coins[selectedCoin].history);
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

const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 SERVER RUNNING"));
