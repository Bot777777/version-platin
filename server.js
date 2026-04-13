const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔗 OPTIONAL: später auf true setzen
const USE_BINANCE = false;

// USER
let user = {
  balance: 10000,
  profitBank: 0,
  portfolio: {},
  positions: {},
  stats: {
    trades: 0,
    wins: 0,
    losses: 0,
    profit: 0
  },
  loggedIn: false
};

let botRunning = false;

let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 100 + Math.random()*1000,
    history: [],
    candles: []
  };
});

let tradeLog = [];


// MARKET (Simulation)
setInterval(()=>{
  if(USE_BINANCE) return;

  for(let s in coins){
    let c = coins[s];

    let trend = Math.sin(Date.now()/3000);
    let noise = (Math.random()-0.5)*0.006;

    let open = c.price;
    let close = open * (1 + trend*0.003 + noise);

    let high = Math.max(open, close)*(1+Math.random()*0.003);
    let low = Math.min(open, close)*(1-Math.random()*0.003);

    c.price = close;

    c.candles.push({open,close,high,low});
    if(c.candles.length > 60) c.candles.shift();

    c.history.push(close);
    if(c.history.length > 60) c.history.shift();
  }
},1200);


// AI (Scalping)
function aiDecision(h){
  if(h.length < 15) return "hold";

  let short = h.slice(-3).reduce((a,b)=>a+b)/3;
  let long = h.slice(-10).reduce((a,b)=>a+b)/10;

  let diff = (short - long)/long;

  if(diff > 0.0015) return "buy";
  if(diff < -0.0015) return "sell";

  return "hold";
}


// BOT
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);
    let pos = user.positions[s];

    // BUY
    if(!pos && decision==="buy"){
      let invest = user.balance * 0.15;

      if(invest > coin.price){
        let amount = invest / coin.price;

        user.balance -= invest;
        user.portfolio[s] = (user.portfolio[s]||0)+amount;

        user.positions[s] = { entry: coin.price, amount };

        tradeLog.unshift("🟢 BUY "+s);
      }
    }

    // SELL
    if(pos){
      let change = (coin.price - pos.entry)/pos.entry;

      // 💰 schnelle kleine Gewinne
      if(change > 0.004){
        let gain = coin.price * pos.amount - pos.entry * pos.amount;

        user.balance += coin.price * pos.amount;
        user.stats.trades++;
        user.stats.wins++;
        user.stats.profit += gain;

        delete user.positions[s];
        user.portfolio[s] = 0;

        tradeLog.unshift("💰 +" + gain.toFixed(2));
        continue;
      }

      // 🛑 Stop Loss
      if(change < -0.008){
        let loss = coin.price * pos.amount - pos.entry * pos.amount;

        user.balance += coin.price * pos.amount;
        user.stats.trades++;
        user.stats.losses++;
        user.stats.profit += loss;

        delete user.positions[s];
        user.portfolio[s] = 0;

        tradeLog.unshift("🛑 " + loss.toFixed(2));
        continue;
      }
    }
  }

  // PROFIT LOCK
  if(user.balance > 10000){
    let p = user.balance - 10000;
    user.balance = 10000;
    user.profitBank += p;
  }

},1000);


// API
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
    user.balance += coins[symbol].price * user.portfolio[symbol];
    user.portfolio[symbol] = 0;
    delete user.positions[symbol];
  }

  res.json({ok:true});
});


// UI
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<div style="max-width:1200px;margin:auto">

<h2>🚀 PRO TERMINAL V6</h2>

<div>
Balance: $<span id="balance"></span> |
Portfolio: $<span id="portfolio"></span> |
Profit: $<span id="profit"></span>
</div>

<div>
<span id="statusDot"></span> <span id="statusText"></span>
</div>

<div>
Trades: <span id="trades"></span> |
Wins: <span id="wins"></span> |
Losses: <span id="losses"></span> |
PnL: <span id="pnl"></span>
</div>

<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>

<div>
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
  let n=new Date();
  eu.innerText=n.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText=n.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText=n.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

function drawChart(canvas, candles){
  let ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,800,300);

  candles.forEach((v,i)=>{
    let x = i*10;

    let open = 300 - v.open/10;
    let close = 300 - v.close/10;
    let high = 300 - v.high/10;
    let low = 300 - v.low/10;

    ctx.strokeStyle="white";
    ctx.beginPath();
    ctx.moveTo(x,high);
    ctx.lineTo(x,low);
    ctx.stroke();

    ctx.fillStyle = v.close > v.open ? "lime" : "red";
    ctx.fillRect(x-3,Math.min(open,close),6,Math.abs(open-close)+1);
  });
}

async function load(){
  let res=await fetch("/data");
  let d=await res.json();

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profitBank.toFixed(2);

  let val=0;
  for(let c in d.user.portfolio){
    val += (d.user.portfolio[c]||0)*d.coins[c].price;
  }
  portfolio.innerText=val.toFixed(2);

  // STATUS LED
  statusDot.innerHTML = d.botRunning
    ? "<span style='display:inline-block;width:12px;height:12px;background:lime;border-radius:50%'></span>"
    : "<span style='display:inline-block;width:12px;height:12px;background:red;border-radius:50%'></span>";

  statusText.innerText = d.botRunning ? "BOT ACTIVE" : "BOT STOPPED";

  trades.innerText=d.user.stats.trades;
  wins.innerText=d.user.stats.wins;
  losses.innerText=d.user.stats.losses;
  pnl.innerText=d.user.stats.profit.toFixed(2);

  let html="";

  for(let c in d.coins){
    let coin=d.coins[c];

    html+=\`
    <div style="background:#1a1f26;padding:15px;margin:10px;border-radius:10px">
      <div onclick="selectCoin('\${c}')" style="cursor:pointer">
        <h3>\${c}</h3>
        <p>$\${coin.price.toFixed(2)}</p>
        <p>Owned: \${d.user.portfolio[c]||0}</p>
      </div>

      <button onclick="sell('\${c}')">SELL</button>

      \${selectedCoin===c ? '<canvas id="chart_'+c+'" width="800" height="300"></canvas>' : ''}
    </div>\`;
  }

  coins.innerHTML=html;

  if(selectedCoin){
    let canvas=document.getElementById("chart_"+selectedCoin);
    if(canvas){
      drawChart(canvas,d.coins[selectedCoin].candles);
    }
  }

  let logHTML="<h3>Trades</h3>";
  d.tradeLog.slice(0,10).forEach(t=>{
    logHTML+="<p>"+t+"</p>";
  });

  log.innerHTML=logHTML;
}

async function sell(s){
  await fetch("/sell",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:s})});
  load();
}

async function login(){await fetch("/login",{method:"POST"});load();}
async function start(){await fetch("/bot/start",{method:"POST"});load();}
async function stop(){await fetch("/bot/stop",{method:"POST"});load();}

setInterval(load,1500);
setInterval(updateClock,1000);
load();
</script>

</body>
</html>
`);
});

app.listen(3000,()=>console.log("🚀 V6 RUNNING"));
