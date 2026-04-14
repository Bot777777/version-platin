const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// ================= USER =================
let user = {
  balance: 10000,
  profit: 0,
  portfolio: {},
  shorts: {},
  loggedIn: false
};

let botRunning = false;

// ================= COINS =================
let symbols = [
  "BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT",
  "BNBUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT","MATICUSDT"
];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 0,
    history: [],
    entry: null,
    shortEntry: null
  };
});

let tradeLog = [];

// ================= BINANCE =================
async function fetchPrices(){
  try{
    const res = await axios.get("https://api.binance.com/api/v3/ticker/price");

    res.data.forEach(item=>{
      if(coins[item.symbol]){
        let price = parseFloat(item.price);

        coins[item.symbol].price = price;
        coins[item.symbol].history.push(price);

        if(coins[item.symbol].history.length > 120){
          coins[item.symbol].history.shift();
        }
      }
    });

  }catch(e){
    console.log("API Fehler");
  }
}

fetchPrices();
setInterval(fetchPrices,2000);

// ================= AI =================
function aiDecision(h){

  if(h.length < 20) return "hold";

  let short = avg(h.slice(-5));
  let mid   = avg(h.slice(-10));
  let long  = avg(h.slice(-20));

  let momentum = (short - mid) / mid;
  let trend    = (mid - long) / long;

  if(momentum > 0.001 && trend > 0.0005){
    return "buy";
  }

  if(momentum < -0.001 && trend < -0.0005){
    return "short";
  }

  return "hold";
}

function avg(arr){
  return arr.reduce((a,b)=>a+b)/arr.length;
}

// ================= BOT =================
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){

    let coin = coins[s];
    if(coin.price === 0) continue;

    let decision = aiDecision(coin.history);

    // LONG
    if(decision==="buy" && !user.portfolio[s] && user.balance > coin.price){

      let amount = 0.05;

      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;

      coin.entry = coin.price;

      tradeLog.unshift("BUY "+s+" @ "+coin.price.toFixed(2));
    }

    // SHORT
    if(decision==="short" && !user.shorts[s]){
      user.shorts[s] = 0.05;
      coin.shortEntry = coin.price;

      tradeLog.unshift("SHORT "+s+" @ "+coin.price.toFixed(2));
    }

    // LONG SELL (nur Gewinn)
    if(user.portfolio[s]){

      let entry = coin.entry;
      let change = (coin.price - entry) / entry;

      if(change > 0.0025){

        let gain = (coin.price - entry) * user.portfolio[s];

        user.balance += coin.price * user.portfolio[s];
        user.portfolio[s] = 0;
        coin.entry = null;

        applyProfit();

        tradeLog.unshift("LONG PROFIT "+s+" +"+gain.toFixed(2));
      }
    }

    // SHORT CLOSE (nur Gewinn)
    if(user.shorts[s]){

      let entry = coin.shortEntry;
      let change = (entry - coin.price) / entry;

      if(change > 0.0025){

        let gain = (entry - coin.price) * user.shorts[s];

        user.balance += gain;
        user.shorts[s] = 0;
        coin.shortEntry = null;

        applyProfit();

        tradeLog.unshift("SHORT PROFIT "+s+" +"+gain.toFixed(2));
      }
    }
  }

},1200);

// ================= PROFIT =================
function applyProfit(){
  if(user.balance > 10000){
    let extra = user.balance - 10000;
    user.profit += extra;
    user.balance = 10000;
  }
}

// ================= API =================
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

  if(user.portfolio[symbol]){
    let coin = coins[symbol];

    user.balance += coin.price * user.portfolio[symbol];
    user.portfolio[symbol] = 0;
    coin.entry = null;

    tradeLog.unshift("MANUAL SELL "+symbol);
  }

  res.json({ok:true});
});

// ================= UI =================
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<div style="text-align:center">

<h1>🚀 PRO TERMINAL</h1>

<p>Balance: $<span id="balance"></span></p>
<p>Profit: $<span id="profit"></span></p>

<p id="status"></p>

<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>

<p>🌍 🇪🇺 <span id="eu"></span> | 🇺🇸 <span id="us"></span> | 🇨🇳 <span id="cn"></span></p>

</div>

<div id="coins" style="display:flex;flex-wrap:wrap;justify-content:center"></div>

<div id="chartContainer" style="margin:auto;width:800px"></div>

<div id="log" style="text-align:center"></div>

<script>

let selectedCoin = null;

function selectCoin(c){
  selectedCoin = c;
  drawChart();
}

function updateClock(){
  let n=new Date();
  eu.innerText=n.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText=n.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText=n.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

function drawChart(){

  if(!selectedCoin) return;

  fetch('/data').then(r=>r.json()).then(data=>{

    let coin = data.coins[selectedCoin];
    let h = coin.history;

    if(h.length < 5) return;

    let container = document.getElementById("chartContainer");
    container.innerHTML = "<canvas id='chart' width='800' height='350'></canvas>";

    let ctx = document.getElementById("chart").getContext("2d");

    let candles = [];

    for(let i=1;i<h.length;i+=3){
      let open = h[i-1];
      let close = h[i];
      let high = Math.max(open,close,h[i+1]||close);
      let low = Math.min(open,close,h[i+1]||close);

      candles.push({open,close,high,low});
    }

    let max = Math.max(...candles.map(c=>c.high));
    let min = Math.min(...candles.map(c=>c.low));

    candles.forEach((c,i)=>{
      let x = i*8+20;

      let openY = 350 - ((c.open-min)/(max-min)*300);
      let closeY = 350 - ((c.close-min)/(max-min)*300);
      let highY = 350 - ((c.high-min)/(max-min)*300);
      let lowY = 350 - ((c.low-min)/(max-min)*300);

      ctx.strokeStyle="white";
      ctx.beginPath();
      ctx.moveTo(x,highY);
      ctx.lineTo(x,lowY);
      ctx.stroke();

      ctx.fillStyle = c.close>c.open ? "lime":"red";
      ctx.fillRect(x-2,Math.min(openY,closeY),4,Math.abs(openY-closeY)||1);
    });
  });
}

async function load(){

  let res=await fetch('/data');
  let d=await res.json();

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profit.toFixed(2);

  document.getElementById("status").innerText =
    d.botRunning ? "🟢 BOT ACTIVE" : "🔴 BOT STOPPED";

  let html="";

  for(let c in d.coins){

    let coin=d.coins[c];

    html+=\`
    <div onclick="selectCoin('\${c}')"
    style="background:#222;margin:10px;padding:15px;border-radius:10px;width:200px;cursor:pointer">

    <h3>\${c}</h3>
    <p>\${coin.price.toFixed(2)}</p>
    <p>Owned: \${d.user.portfolio[c]||0}</p>

    <button onclick="event.stopPropagation(); sell('\${c}')">SELL</button>

    </div>\`;
  }

  coins.innerHTML=html;

  drawChart();

  let logHTML="";
  d.tradeLog.slice(0,10).forEach(t=>{
    logHTML+="<p>"+t+"</p>";
  });

  log.innerHTML=logHTML;
}

async function sell(s){
  await fetch('/sell',{
    method:'POST',
    headers:{'Content-Type':'application/json'},
    body:JSON.stringify({symbol:s})
  });
}

async function login(){await fetch('/login',{method:'POST'});}
async function start(){await fetch('/bot/start',{method:'POST'});}
async function stop(){await fetch('/bot/stop',{method:'POST'});}

setInterval(load,2000);
setInterval(updateClock,1000);
load();

</script>

</body>
</html>
`);
});

app.listen(3000,()=>console.log("🚀 BOT RUNNING FINAL"));
