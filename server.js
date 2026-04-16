const express = require("express");
const cors = require("cors");
const axios = require("axios");

const app = express();
app.use(cors());
app.use(express.json());

// ================= USER =================
let user = {
  balance: 500,
  profit: 0,
  portfolio: {},
  shorts: {},
  stats: {
    trades: 0,
    wins: 0
  },
  loggedIn: false
};

let botRunning = true;

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
        let price = parseFloat(item.price);
        coins[item.symbol].price = price;
        coins[item.symbol].history.push(price);

        if(coins[item.symbol].history.length > 80){
          coins[item.symbol].history.shift();
        }
      }
    });
  }catch(e){}
}

fetchPrices();
setInterval(fetchPrices,1500);

// ================= REAL CANDLES =================
async function fetchCandles(symbol){
  try{
    const res = await axios.get(
      "https://api.binance.com/api/v3/klines?symbol="+symbol+"&interval=1m&limit=60"
    );

    coins[symbol].candles = res.data.map(c=>({
      open:+c[1],high:+c[2],low:+c[3],close:+c[4]
    }));
  }catch(e){}
}

// ================= AI =================
function aiDecision(h){

  if(h.length < 20) return "hold";

  let a = h[h.length-1];
  let b = h[h.length-2];
  let c = h[h.length-5];
  let d = h[h.length-10];

  let shortMove = (a - b)/b;
  let midMove = (a - c)/c;
  let trendMove = (a - d)/d;

  // 📈 STRONG UP TREND
  if(trendMove > 0.0015 && midMove > 0.0008 && shortMove > 0){
    return "buy";
  }

  // 📉 STRONG DOWN TREND
  if(trendMove < -0.0015 && midMove < -0.0008 && shortMove < 0){
    return "short";
  }

  return "hold";
}
// ================= SMART MODE =================
function getEMA(prices, period){
  let k = 2/(period+1);
  let ema = prices[0];
  for(let i=1;i<prices.length;i++){
    ema = prices[i]*k + ema*(1-k);
  }
  return ema;
}

function getMarketState(h){
  if(h.length < 50) return "NONE";

  let ema20 = getEMA(h.slice(-20),20);
  let ema50 = getEMA(h.slice(-50),50);

  let diff = Math.abs((ema20 - ema50)/ema50);

  if(diff < 0.001) return "SIDE";

  if(ema20 > ema50) return "UP";
  if(ema20 < ema50) return "DOWN";

  return "SIDE";
}

// ================= BOT =================
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){

    let coin = coins[s];
    if(coin.price === 0) continue;

    let decision = aiDecision(coin.history);

    // BUY
    if(decision==="buy" && !user.portfolio[s]){
      let amount = (user.balance * 0.4) / coin.price;
      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;
      coin.entry = coin.price;
      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(decision==="short" && !user.shorts[s]){
      user.shorts[s] = (user.balance * 0.4) / coin.price;
      coin.shortEntry = coin.price;
      tradeLog.unshift("SHORT "+s);
    }

},800);

   // LONG EXIT
    
if(user.portfolio[s]){
  let change = (coin.price - coin.entry)/coin.entry;

  if(change > 0.0012 || change < -0.0025){

    let invested = coin.entry * user.portfolio[s];
    let returned = coin.price * user.portfolio[s];
    let gain = returned - invested;

    user.balance += invested;
    user.profit += gain;

    user.portfolio[s] = 0;
    coin.entry = null;

    user.stats.trades++;
    if(gain > 0) user.stats.wins++;

    tradeLog.unshift("LONG +" + gain.toFixed(2));
  }
}   
   // SHORT EXIT
if(user.shorts[s]){
  let change = (coin.shortEntry - coin.price)/coin.shortEntry;

  if(change > 0.0012 || change < -0.0025){

    let invested = coin.shortEntry * user.shorts[s];
    let returned = coin.price * user.shorts[s];
    let gain = invested - returned;

    user.balance += invested;
    user.profit += gain;
    user.shorts[s] = 0;
    coin.shortEntry = null;

    user.stats.trades++;
    if(gain > 0) user.stats.wins++;

    tradeLog.unshift("SHORT +" + gain.toFixed(2));
  }
}   
// ================= PROFIT =================

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

<div style="text-align:center;font-size:22px">
Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span><br>

<span id="status"></span><br><br>

<button onclick="start()" style="font-size:18px;padding:10px;margin:5px">▶ START</button>
<button onclick="stop()" style="font-size:18px;padding:10px;margin:5px">⏹ STOP</button>
</div>

<div style="text-align:center;margin:20px;font-size:18px">
<h2>📊 Stats</h2>
<div id="stats"></div>
</div>

<div style="text-align:center;margin:20px;font-size:18px">
<h2>📦 Portfolio</h2>
<div id="portfolio"></div>
</div>

<div style="text-align:center;margin:20px;font-size:18px">
<h2>📊 Aktive Trades</h2>
<div id="positions"></div>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap;justify-content:center"></div>

<div id="chartContainer" style="margin:auto;width:900px"></div>

<div id="log" style="text-align:center;margin-top:30px"></div>

<script>

function selectCoin(c){
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
    ctx.strokeStyle="white";
    ctx.stroke();

    ctx.fillStyle=c.close>c.open?"lime":"red";
    ctx.fillRect(x-4,Math.min(open,close),8,Math.abs(open-close)||1);
  });
}

async function load(){

  let d=await (await fetch('/data')).json();

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profit.toFixed(2);

  let statusEl = document.getElementById("status");

  if(statusEl){
    if(d.botRunning){
      statusEl.innerText="🟢 BOT AKTIV";
      statusEl.style.color="lime";
    }else{
      statusEl.innerText="🔴 BOT INAKTIV";
      statusEl.style.color="red";
    }
  }

  let trades=d.user.stats.trades;
  let wins=d.user.stats.wins;
  let winrate=trades?(wins/trades*100).toFixed(1):0;

  stats.innerHTML="Trades:"+trades+" | Wins:"+wins+" | Winrate:"+winrate+"%";

  let pf="";
  for(let c in d.user.portfolio){
    if(d.user.portfolio[c]>0){
      pf+=c+": "+d.user.portfolio[c]+"<br>";
    }
  }
  portfolio.innerHTML=pf||"leer";

  let pos="";
  for(let c in d.coins){
    if(d.coins[c].entry){
      pos+=c+" LONG<br>";
    }
    if(d.coins[c].shortEntry){
      pos+=c+" SHORT<br>";
    }
  }
  positions.innerHTML=pos||"keine";

  let html="";
  for(let c in d.coins){
    html+=\`
    <div onclick="selectCoin('\${c}')"
    style="background:#222;margin:15px;padding:20px;width:220px;font-size:18px;cursor:pointer">
    <b>\${c}</b><br>\${d.coins[c].price.toFixed(2)}
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

app.listen(3000,()=>console.log("🚀 FINAL FIXED BOT RUNNING"));
