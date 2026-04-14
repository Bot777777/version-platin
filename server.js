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
    shortEntry: null,
    candles: []
  };
});

let tradeLog = [];

// ================= LIVE PRICES =================
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

  }catch(e){
    console.log("Preis Fehler");
  }
}

fetchPrices();
setInterval(fetchPrices,2000);

// ================= REAL CANDLES =================
async function fetchCandles(symbol){
  try{
    const res = await axios.get(
      "https://api.binance.com/api/v3/klines?symbol="+symbol+"&interval=1m&limit=50"
    );

    coins[symbol].candles = res.data.map(c=>({
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4])
    }));

  }catch(e){
    console.log("Candle Fehler");
  }
}

// ================= AI (GEFIXT) =================
function aiDecision(h){

  if(h.length < 15) return "hold";

  let short = avg(h.slice(-3));
  let mid   = avg(h.slice(-7));
  let long  = avg(h.slice(-15));

  let momentum = short - mid;
  let trend    = mid - long;

  if(momentum > 0 && trend > 0){
    return "buy";
  }

  if(momentum < 0 && trend < 0){
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

    // BUY
    if(decision==="buy" && !user.portfolio[s] && user.balance > coin.price){

      let amount = 0.05;

      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;

      coin.entry = coin.price;

      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(decision==="short" && !user.shorts[s]){
      user.shorts[s] = 0.05;
      coin.shortEntry = coin.price;

      tradeLog.unshift("SHORT "+s);
    }

    // LONG SELL
    if(user.portfolio[s]){
      let entry = coin.entry;
      let change = (coin.price - entry) / entry;

      if(change > 0.002){
        let gain = (coin.price - entry) * user.portfolio[s];

        user.balance += coin.price * user.portfolio[s];
        user.portfolio[s] = 0;
        coin.entry = null;

        applyProfit();
        tradeLog.unshift("LONG +"+gain.toFixed(2));
      }
    }

    // SHORT CLOSE
    if(user.shorts[s]){
      let entry = coin.shortEntry;
      let change = (entry - coin.price) / entry;

      if(change > 0.002){
        let gain = (entry - coin.price) * user.shorts[s];

        user.balance += gain;
        user.shorts[s] = 0;
        coin.shortEntry = null;

        applyProfit();
        tradeLog.unshift("SHORT +"+gain.toFixed(2));
      }
    }
  }

},1000);

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

// ================= UI =================
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<h1 style="text-align:center">🚀 PRO BOT</h1>

<div style="text-align:center">
Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span>
<br>
<span id="status"></span><br>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap;justify-content:center"></div>

<div id="chartContainer" style="margin:auto;width:800px"></div>

<script>

let selected=null;

function selectCoin(c){
  selected=c;
  loadChart(c);
}

async function loadChart(symbol){

  let res = await fetch('/candles/'+symbol);
  let candles = await res.json();

  let html="<canvas id='c' width='800' height='350'></canvas>";
  chartContainer.innerHTML=html;

  let ctx=document.getElementById("c").getContext("2d");

  let max=Math.max(...candles.map(c=>c.high));
  let min=Math.min(...candles.map(c=>c.low));

  candles.forEach((c,i)=>{
    let x=i*10;

    let open=350-(c.open-min)/(max-min)*300;
    let close=350-(c.close-min)/(max-min)*300;
    let high=350-(c.high-min)/(max-min)*300;
    let low=350-(c.low-min)/(max-min)*300;

    ctx.strokeStyle="white";
    ctx.beginPath();
    ctx.moveTo(x,high);
    ctx.lineTo(x,low);
    ctx.stroke();

    ctx.fillStyle=c.close>c.open?"lime":"red";
    ctx.fillRect(x-3,Math.min(open,close),6,Math.abs(open-close)||1);
  });
}

async function load(){

  let d=await (await fetch('/data')).json();

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profit.toFixed(2);

  document.getElementById("status").innerText =
    d.botRunning?"🟢 ACTIVE":"🔴 STOP";

  let html="";
  for(let c in d.coins){
    html+=\`
    <div onclick="selectCoin('\${c}')"
    style="background:#222;margin:10px;padding:10px;border-radius:10px;cursor:pointer">
    \${c}<br>\${d.coins[c].price.toFixed(2)}
    </div>\`;
  }

  coins.innerHTML=html;
}

async function start(){await fetch('/bot/start',{method:'POST'});}
async function stop(){await fetch('/bot/stop',{method:'POST'});}

setInterval(load,1500);
load();

</script>
</body>
</html>
`);
});

app.listen(3000,()=>console.log("🚀 FINAL BOT RUNNING"));
