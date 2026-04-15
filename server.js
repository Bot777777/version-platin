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
  stats: {
    trades: 0,
    wins: 0
  },
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
    candles: [],
    trailing: null,        // NEW
    partialSold: false     // NEW
  };
});

let tradeLog = [];

// ================= EMA / TREND =================
function getEMA(prices, period){
  let k = 2 / (period + 1);
  let ema = prices[0];
  for(let i=1;i<prices.length;i++){
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

function getTrend(history){
  if(history.length < 50) return "SIDE";

  let ema50 = getEMA(history.slice(-50),50);
  let ema20 = getEMA(history.slice(-20),20);

  if(ema20 > ema50) return "UP";
  if(ema20 < ema50) return "DOWN";
  return "SIDE";
}

// ================= PRICES =================
async function fetchPrices(){
  try{
    const res = await axios.get("https://api.binance.com/api/v3/ticker/price");

    res.data.forEach(item=>{
      if(coins[item.symbol]){
        let price = parseFloat(item.price);
        coins[item.symbol].price = price;
        coins[item.symbol].history.push(price);

        if(coins[item.symbol].history.length > 100){
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

  let trend = getTrend(h);

  let a = h[h.length-1];
  let b = h[h.length-3];

  let momentum = (a - b) / b;

  if(trend === "UP" && momentum > 0.0005) return "buy";
  if(trend === "DOWN" && momentum < -0.0005) return "short";

  return "hold";
}

// ================= BOT =================
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){

    let coin = coins[s];
    if(coin.price === 0) continue;

    let decision = aiDecision(coin.history);

    let risk = user.balance * 0.02;
    let amount = risk / coin.price;

    // BUY
    if(decision==="buy" && !user.portfolio[s]){
      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;
      coin.entry = coin.price;

      coin.trailing = null;
      coin.partialSold = false;

      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(decision==="short" && !user.shorts[s]){
      user.shorts[s] = amount;
      coin.shortEntry = coin.price;
      tradeLog.unshift("SHORT "+s);
    }

    // LONG MANAGEMENT
    if(user.portfolio[s]){
      let change = (coin.price - coin.entry)/coin.entry;

      // STOP LOSS
      if(change < -0.02){
        user.balance += coin.price * user.portfolio[s];
        user.portfolio[s] = 0;
        coin.entry = null;

        user.stats.trades++;
        tradeLog.unshift("STOP LOSS");
      }

      // PARTIAL
      if(change > 0.004 && !coin.partialSold){
        let half = user.portfolio[s]/2;
        user.balance += coin.price * half;
        user.portfolio[s] -= half;
        coin.partialSold = true;
      }

      // TRAILING
      if(change > 0.01){

        if(!coin.trailing) coin.trailing = coin.price * 0.995;

        if(coin.price < coin.trailing){
          let gain = (coin.price - coin.entry) * user.portfolio[s];

          user.balance += coin.price * user.portfolio[s];
          user.portfolio[s] = 0;
          coin.entry = null;

          coin.trailing = null;
          coin.partialSold = false;

          user.stats.trades++;
          user.stats.wins++;

          applyProfit();
          tradeLog.unshift("BIG WIN "+gain.toFixed(2));
        }

        if(coin.price > coin.trailing){
          coin.trailing = coin.price * 0.995;
        }
      }

      // ORIGINAL EXIT BLEIBT
      if(change > 0.002){
        let gain = (coin.price - coin.entry) * user.portfolio[s];

        user.balance += coin.price * user.portfolio[s];
        user.portfolio[s] = 0;
        coin.entry = null;

        user.stats.trades++;
        user.stats.wins++;

        applyProfit();
        tradeLog.unshift("LONG +"+gain.toFixed(2));
      }
    }

    // SHORT EXIT (ORIGINAL)
    if(user.shorts[s]){
      let change = (coin.shortEntry - coin.price)/coin.shortEntry;

      if(change > 0.0015){
        let gain = (coin.shortEntry - coin.price) * user.shorts[s];

        user.balance += gain;
        user.shorts[s] = 0;
        coin.shortEntry = null;

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

// ================= UI (UNVERÄNDERT) =================
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<h1 style="text-align:center;font-size:42px">🚀 PRO TERMINAL</h1>

<div style="text-align:center;font-size:22px">
Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span><br>

<div id="status" style="font-size:28px;font-weight:bold;margin:15px;"></div><br>
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

  if(d.botRunning){
  status.innerHTML = "🟢 BOT AKTIV";
  status.style.color = "lime";
}else{
  status.innerHTML = "🔴 BOT INAKTIV";
  status.style.color = "red";
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
