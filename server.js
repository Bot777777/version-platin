const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 🔐 LOGIN / MODE
let mode = "demo"; // demo | binance

// USER
let user = {
  balance: 10000,
  profitBank: 0,
  portfolio: {},
  positions: {},
  stats: { trades:0, wins:0, losses:0, profit:0 },
  loggedIn: false
};

let botRunning = false;

let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s]={price:100+Math.random()*1000,history:[],candles:[]};
});

let tradeLog=[];


// 📈 MARKET
setInterval(()=>{
  for(let s in coins){
    let c=coins[s];

    let trend=Math.sin(Date.now()/5000);
    let noise=(Math.random()-0.5)*0.004;

    let open=c.price;
    let close=open*(1+trend*0.002+noise);

    let high=Math.max(open,close)*(1+Math.random()*0.002);
    let low=Math.min(open,close)*(1-Math.random()*0.002);

    c.price=close;

    c.candles.push({open,close,high,low});
    if(c.candles.length>60)c.candles.shift();

    c.history.push(close);
    if(c.history.length>60)c.history.shift();
  }
},1500);


// 🧠 EDGE BOT
function aiDecision(h){
  if(h.length<30)return"hold";

  let short=h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid=h.slice(-15).reduce((a,b)=>a+b)/15;
  let long=h.slice(-30).reduce((a,b)=>a+b)/30;

  let momentum=(short-mid)/mid;
  let trend=(mid-long)/long;

  // nur starke Trends
  if(momentum>0.004 && trend>0.002)return"buy";

  return"hold";
}


// 🤖 BOT
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin=coins[s];
    let decision=aiDecision(coin.history);
    let pos=user.positions[s];

    // BUY (weniger Trades!)
    if(!pos && decision==="buy"){
      let invest=user.balance*0.2;

      if(invest>coin.price){
        let amount=invest/coin.price;

        user.balance-=invest;
        user.portfolio[s]=(user.portfolio[s]||0)+amount;

        user.positions[s]={
          entry:coin.price,
          amount,
          target:coin.price*1.01,  // +1%
          stop:coin.price*0.995    // -0.5%
        };

        tradeLog.unshift("🚀 BUY "+s);
      }
    }

    // SELL
    if(pos){
      if(coin.price>=pos.target){
        let gain=coin.price*pos.amount-pos.entry*pos.amount;

        user.balance+=coin.price*pos.amount;
        user.stats.trades++;
        user.stats.wins++;
        user.stats.profit+=gain;

        delete user.positions[s];
        user.portfolio[s]=0;

        tradeLog.unshift("💰 "+gain.toFixed(2));
        continue;
      }

      if(coin.price<=pos.stop){
        let loss=coin.price*pos.amount-pos.entry*pos.amount;

        user.balance+=coin.price*pos.amount;
        user.stats.trades++;
        user.stats.losses++;
        user.stats.profit+=loss;

        delete user.positions[s];
        user.portfolio[s]=0;

        tradeLog.unshift("🛑 "+loss.toFixed(2));
        continue;
      }
    }
  }

  if(user.balance>10000){
    let p=user.balance-10000;
    user.balance=10000;
    user.profitBank+=p;
  }

},2000);


// API
app.get("/data",(req,res)=>{
  res.json({user,coins,botRunning,tradeLog,mode});
});

app.post("/login",(req,res)=>{
  user.loggedIn=true;
  res.json({ok:true});
});

app.post("/mode",(req,res)=>{
  mode=req.body.mode;
  res.json({ok:true});
});

app.post("/bot/start",(req,res)=>{
  botRunning=true;
  res.json({ok:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning=false;
  res.json({ok:true});
});


// UI
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<div style="max-width:1200px;margin:auto">

<h2>🚀 PRO TERMINAL FINAL</h2>

<div>
Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span>
</div>

<div>
<span id="statusDot"></span> <span id="statusText"></span>
</div>

<div>
Mode: <span id="mode"></span>
<button onclick="setMode('demo')">Demo</button>
<button onclick="setMode('binance')">Binance</button>
</div>

<div>
Trades:<span id="trades"></span> |
Wins:<span id="wins"></span> |
Losses:<span id="losses"></span>
</div>

<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>

<div id="coins"></div>
<div id="log"></div>

</div>

<script>
let selectedCoin=null;

function selectCoin(c){
  selectedCoin=selectedCoin===c?null:c;
}

async function load(){
  let res=await fetch("/data");
  let d=await res.json();

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profitBank.toFixed(2);

  mode.innerText=d.mode;

  statusDot.innerHTML=d.botRunning
  ?"<span style='width:12px;height:12px;background:lime;border-radius:50%;display:inline-block'></span>"
  :"<span style='width:12px;height:12px;background:red;border-radius:50%;display:inline-block'></span>";

  statusText.innerText=d.botRunning?"BOT ACTIVE":"BOT STOPPED";

  trades.innerText=d.user.stats.trades;
  wins.innerText=d.user.stats.wins;
  losses.innerText=d.user.stats.losses;

  let html="";

  for(let c in d.coins){
    let coin=d.coins[c];

    html+=\`
    <div style="background:#222;margin:10px;padding:10px;border-radius:10px">
      <div onclick="selectCoin('\${c}')">
        <h3>\${c}</h3>
        <p>$\${coin.price.toFixed(2)}</p>
      </div>
    </div>\`;
  }

  coins.innerHTML=html;

  let logHTML="<h3>Trades</h3>";
  d.trade
