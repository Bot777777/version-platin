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
  stats: { trades: 0, wins: 0 },
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
    shortEntry: null,
    candles: []
  };
});

let tradeLog = [];

// ================= PRICES =================
async function fetchPrices(){
  try{
    const res = await axios.get("https://api.binance.com/api/v3/ticker/price");

    res.data.forEach(item=>{
      if(coins[item.symbol]){
        let p = parseFloat(item.price);
        coins[item.symbol].price = p;
        coins[item.symbol].history.push(p);

        if(coins[item.symbol].history.length > 80){
          coins[item.symbol].history.shift();
        }
      }
    });
  }catch(e){}
}
fetchPrices();
setInterval(fetchPrices,1500);

// ================= CANDLES =================
async function fetchCandles(symbol){
  try{
    const res = await axios.get(
      "https://api.binance.com/api/v3/klines?symbol="+symbol+"&interval=1m&limit=60"
    );

    coins[symbol].candles = res.data.map(c=>({
      open:+c[1], high:+c[2], low:+c[3], close:+c[4]
    }));
  }catch(e){}
}

// ================= SMART AI =================
function aiDecision(h){

  if(h.length < 12) return "hold";

  let last = h[h.length-1];
  let prev = h[h.length-2];
  let avg5 = avg(h.slice(-5));
  let avg10 = avg(h.slice(-10));

  let momentum = last - prev;
  let trend = avg5 - avg10;

  // 🔥 smarter
  if(momentum > 0 && trend > 0) return "buy";
  if(momentum < 0 && trend < 0) return "short";

  // leichte Reversal Chance
  if(last < avg10 * 0.995) return "buy";
  if(last > avg10 * 1.005) return "short";

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

    let d = aiDecision(coin.history);

    // LONG
    if(d==="buy" && !user.portfolio[s]){
      let amount = 0.05;
      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;
      coin.entry = coin.price;
      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(d==="short" && !user.shorts[s]){
      user.shorts[s] = 0.05;
      coin.shortEntry = coin.price;
      tradeLog.unshift("SHORT "+s);
    }

    // LONG EXIT
    if(user.portfolio[s]){
      let change = (coin.price - coin.entry)/coin.entry;

      if(change > 0.0015){
        let gain = (coin.price - coin.entry)*user.portfolio[s];

        user.balance += coin.price*user.portfolio[s];
        user.portfolio[s]=0;
        coin.entry=null;

        user.stats.trades++;
        user.stats.wins++;

        applyProfit();
        tradeLog.unshift("LONG +"+gain.toFixed(2));
      }
    }

    // SHORT EXIT
    if(user.shorts[s]){
      let change = (coin.shortEntry - coin.price)/coin.shortEntry;

      if(change > 0.0015){
        let gain = (coin.shortEntry - coin.price)*user.shorts[s];

        user.balance += gain;
        user.shorts[s]=0;
        coin.shortEntry=null;

        user.stats.trades++;
        user.stats.wins++;

        applyProfit();
        tradeLog.unshift("SHORT +"+gain.toFixed(2));
      }
    }
  }

},800);

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

app.get("/candles/:symbol", async (req,res)=>{
  await fetchCandles(req.params.symbol);
  res.json(coins[req.params.symbol].candles);
});

app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({ok:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({ok:true});
});

// ================= UI =================
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<h1 style="text-align:center;font-size:42px">🚀 PRO TERMINAL</h1>

<div style="text-align:center;font-size:24px">
<span id="status"></span><br><br>

<button onclick="start()" style="font-size:18px">START</button>
<button onclick="stop()" style="font-size:18px">STOP</button>

<br><br>

Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span>
</div>

<!-- COINS -->
<div id="coins" style="display:flex;flex-wrap:wrap;justify-content:center;margin-top:20px"></div>

<!-- INFO MITTIG -->
<div style="text-align:center;margin-top:30px">

<h2>📦 Portfolio</h2>
<div id="portfolio"></div>

<h2>📊 Trades</h2>
<div id="positions"></div>

<h2>📜 Log</h2>
<div id="log"></div>

</div>

<!-- CHART -->
<div id="chartContainer" style="margin:auto;width:900px;margin-top:20px"></div>

<script>

let current=null;
let chartVisible=false;

function selectCoin(c){
  if(current===c && chartVisible){
    chartContainer.innerHTML="";
    chartVisible=false;
    return;
  }

  current=c;
  chartVisible=true;
  loadChart(c);
}

async function loadChart(symbol){

  let res = await fetch('/candles/'+symbol);
  let candles = await res.json();

  chartContainer.innerHTML="<canvas id='c' width='900' height='400'></canvas>";

  let ctx=document.getElementById("c").getContext("2d");

  let max=Math.max(...candles.map(c=>c.high));
  let min=Math.min(...candles.map(c=>c.low));

  candles.forEach((c,i)=>{
    let x=i*12;

    let open=400-(c.open-min)/(max-min)*350;
    let close=400-(c.close-min)/(max-min)*350;
    let high=400-(c.high-min)/(max-min)*350;
    let low=400-(c.low-min)/(max-min)*350;

    ctx.beginPath();
    ctx.moveTo(x,high);
    ctx.lineTo(x,low);
    ctx.stroke();

    ctx.fillStyle=c.close>c.open?"lime":"red";
    ctx.fillRect(x-4,Math.min(open,close),8,Math.abs(open-close)||1);
  });
}

async function load(){

  let d=await (await fetch('/data')).json();

  document.getElementById("status").innerText =
    d.botRunning ? "🟢 BOT AKTIV" : "🔴 BOT INAKTIV";

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profit.toFixed(2);

  let pf="";
  for(let c in d.user.portfolio){
    if(d.user.portfolio[c]>0){
      pf+=c+" "+d.user.portfolio[c]+"<br>";
    }
  }
  portfolio.innerHTML=pf||"leer";

  let pos="";
  for(let c in d.coins){
    if(d.coins[c].entry) pos+=c+" LONG<br>";
    if(d.coins[c].shortEntry) pos+=c+" SHORT<br>";
  }
  positions.innerHTML=pos||"keine";

  let html="";
  for(let c in d.coins){
    html+=\`
    <div ondblclick="selectCoin('\${c}')"
    style="background:#222;margin:10px;padding:20px;width:200px;cursor:pointer">
    \${c}<br>\${d.coins[c].price.toFixed(2)}
    </div>\`;
  }
  coins.innerHTML=html;

  let logHTML="";
  d.tradeLog.slice(0,15).forEach(t=>{
    logHTML+="<div>"+t+"</div>";
  });
  log.innerHTML=logHTML;
}

async function start(){await fetch('/bot/start',{method:'POST'});}
async function stop(){await fetch('/bot/stop',{method:'POST'});}

setInterval(load,1000);
load();

</script>
</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("🚀 SERVER RUNNING ON PORT " + PORT);
});
