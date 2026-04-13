const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());


// USER
let user = {
  balance: 10000,
  profitBank: 0,
  portfolio: {},
  entry: {}
};


// BOT
let botRunning = false;


// COINS
let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT"];

let coins = {};

symbols.forEach(s=>{
  coins[s] = {
    price: 100 + Math.random()*1000,
    history: [],
    candles: []
  };
});


// LOG
let tradeLog = [];


// PRICE + CANDLES
setInterval(()=>{
  for(let s in coins){
    let coin = coins[s];

    let open = coin.price;
    let change = (Math.random()-0.5)*0.02;
    let close = open * (1+change);

    let high = Math.max(open, close) * (1 + Math.random()*0.01);
    let low = Math.min(open, close) * (1 - Math.random()*0.01);

    coin.price = close;

    coin.history.push(close);
    if(coin.history.length>50) coin.history.shift();

    coin.candles.push({open,high,low,close});
    if(coin.candles.length>30) coin.candles.shift();
  }
},2000);


// AI
function aiDecision(h){
  if(h.length<20) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let long = h.slice(-20).reduce((a,b)=>a+b)/20;

  if(short > long*1.002) return "buy";
  if(short < long*0.998) return "sell";

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
      user.entry[s] = coin.price;

      tradeLog.unshift("BUY "+s);
    }

    if(decision==="sell" && user.portfolio[s]>0){
      user.balance += coin.price;
      user.portfolio[s]--;

      tradeLog.unshift("SELL "+s);
    }
  }

  // 💰 PROFIT AUTO TRANSFER
  if(user.balance > 10000){
    let profit = user.balance - 10000;
    user.balance = 10000;
    user.profitBank += profit;

    tradeLog.unshift("💰 PROFIT LOCKED: "+profit.toFixed(2));
  }

},2000);


// API
app.get("/data",(req,res)=>{
  res.json({user,coins,botRunning,tradeLog});
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

  if(user.portfolio[symbol]>0){
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
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="max-width:1200px;margin:auto;padding:20px">

<h1>🚀 PRO TERMINAL V5</h1>

<div style="display:flex;justify-content:space-between">
  <div id="balance"></div>
  <div id="profit"></div>
</div>

<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>

<div id="coins" style="
display:grid;
grid-template-columns:repeat(auto-fit,minmax(250px,1fr));
gap:15px;
margin-top:20px;
"></div>

<div id="chart"></div>

<script>

let selected = null;

async function load(){
  const res = await fetch("/data");
  const data = await res.json();

  document.getElementById("balance").innerText =
    "Trading: $" + data.user.balance.toFixed(2);

  document.getElementById("profit").innerText =
    "Profit: $" + data.user.profitBank.toFixed(2);

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];
    let amount = data.user.portfolio[c]||0;

    html += \`
    <div onclick="selectCoin('\${c}')" style="
      background:#1a1f26;
      padding:15px;
      border-radius:10px;
      cursor:pointer;
    ">
      <h2>\${c}</h2>
      <p>$ \${coin.price.toFixed(2)}</p>
      <p>Owned: \${amount}</p>
      <button onclick="sell('\${c}');event.stopPropagation()">SELL</button>
    </div>
    \`;
  }

  document.getElementById("coins").innerHTML = html;

  if(selected){
    drawChart(data.coins[selected].candles);
  }
}


function selectCoin(c){
  selected = c;
}


function drawChart(candles){
  let canvas = document.getElementById("chartCanvas");
  if(!canvas){
    document.getElementById("chart").innerHTML =
      '<canvas id="chartCanvas" width="600" height="300"></canvas>';
    canvas = document.getElementById("chartCanvas");
  }

  let ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,600,300);

  candles.forEach((c,i)=>{
    let x = i*20;

    let color = c.close > c.open ? "lime" : "red";

    ctx.strokeStyle = color;
    ctx.beginPath();
    ctx.moveTo(x,300-c.high/5);
    ctx.lineTo(x,300-c.low/5);
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.fillRect(x-5,300-Math.max(c.open,c.close)/5,10,10);
  });
}


async function sell(s){
  await fetch("/sell",{
    method:"POST",
    headers:{"Content-Type":"application/json"},
    body: JSON.stringify({symbol:s})
  });
}

async function start(){ await fetch("/bot/start",{method:"POST"}); }
async function stop(){ await fetch("/bot/stop",{method:"POST"}); }

setInterval(load,2000);
load();

</script>

</body>
</html>
`);
});


// START
const PORT = process.env.PORT || 3000;
app.listen(PORT,()=>console.log("🚀 V5 läuft"));
