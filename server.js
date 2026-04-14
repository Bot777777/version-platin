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
  loggedIn: false
};

let botRunning = false;

// ================= COINS =================
let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 0,
    history: [],
    buys: []
  };
});

let tradeLog = [];

// ================= AXIOS BINANCE =================
async function fetchPrices(){
  try{
    const res = await axios.get("https://api.binance.com/api/v3/ticker/price");
    const data = res.data;

    data.forEach(item=>{
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
    console.log("API Fehler");
  }
}

setInterval(fetchPrices,2000);

// ================= AI =================
function aiDecision(h){
  if(h.length < 30) return "hold";

  let short = h.slice(-5).reduce((a,b)=>a+b)/5;
  let long = h.slice(-20).reduce((a,b)=>a+b)/20;

  if(short > long) return "buy";
  if(short < long) return "sell";

  return "hold";
}

// ================= BOT =================
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);

    // BUY
    if(decision==="buy" && user.balance > coin.price){

      let amount = 0.05;

      user.balance -= coin.price * amount;
      user.portfolio[s] = (user.portfolio[s]||0)+amount;

      coin.buys.push(coin.price);

      tradeLog.unshift("BUY "+s);
    }

    // SELL
    if(decision==="sell" && user.portfolio[s] > 0){

      let amount = user.portfolio[s];
      let buy = coin.buys[0] || coin.price;

      let gain = (coin.price - buy) * amount;

      user.balance += coin.price * amount;
      user.portfolio[s] = 0;
      coin.buys.shift();

      // 🔥 PROFIT LIMIT SYSTEM
      if(user.balance > 10000){
        let extra = user.balance - 10000;
        user.profit += extra;
        user.balance = 10000;
      }

      tradeLog.unshift("SELL "+s+" "+gain.toFixed(2));
    }
  }

},1500);

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

<canvas id="chart" width="600" height="300" style="background:#111;margin:auto;display:block"></canvas>

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
    if(!coin) return;

    let ctx = document.getElementById("chart").getContext("2d");
    ctx.clearRect(0,0,600,300);

    let h = coin.history;
    let max = Math.max(...h);

    ctx.beginPath();

    for(let i=0;i<h.length;i++){
      let x = i*5;
      let y = 300 - (h[i]/max*250);

      if(i===0) ctx.moveTo(x,y);
      else ctx.lineTo(x,y);
    }

    ctx.strokeStyle="lime";
    ctx.stroke();
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
    style="background:#222;margin:10px;padding:10px;border-radius:10px;width:200px;cursor:pointer">

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

app.listen(3000,()=>console.log("🚀 FINAL RUNNING"));
