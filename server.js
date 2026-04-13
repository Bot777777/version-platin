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
  positions: {},
  stats: { trades:0, wins:0, losses:0, profit:0 },
  loggedIn: false
};

let botRunning = false;

// MULTI COINS
let symbols = [
  "BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT",
  "ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT"
];

let coins = {};
symbols.forEach(s=>{
  coins[s] = { price:100+Math.random()*1000, history:[], candles:[] };
});

let tradeLog=[];


// MARKET SIMULATION
setInterval(()=>{
  for(let s in coins){
    let c=coins[s];

    let trend=Math.sin(Date.now()/4000);
    let noise=(Math.random()-0.5)*0.003;

    let open=c.price;
    let close=open*(1+trend*0.004+noise);

    let high=Math.max(open,close)*(1+Math.random()*0.003);
    let low=Math.min(open,close)*(1-Math.random()*0.003);

    c.price=close;

    c.candles.push({open,close,high,low});
    if(c.candles.length>60)c.candles.shift();

    c.history.push(close);
    if(c.history.length>60)c.history.shift();
  }
},1200);


// SMART AI
function aiDecision(h){
  if(h.length<40) return "skip";

  let short=h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid=h.slice(-20).reduce((a,b)=>a+b)/20;
  let long=h.slice(-40).reduce((a,b)=>a+b)/40;

  let momentum=(short-mid)/mid;
  let trend=(mid-long)/long;

  let volatility=Math.abs(h[h.length-1]-h[h.length-5])/h[h.length-5];

  if(volatility < 0.002) return "skip";

  if(momentum>0.004 && trend>0.002){
    return "buy";
  }

  return "skip";
}


// BOT
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin=coins[s];
    let decision=aiDecision(coin.history);
    let pos=user.positions[s];

    if(!pos && decision==="buy"){
      let invest=user.balance*0.12;

      if(invest>coin.price){
        let amount=invest/coin.price;

        user.balance-=invest;
        user.portfolio[s]=(user.portfolio[s]||0)+amount;

        user.positions[s]={
          entry:coin.price,
          amount,
          target:coin.price*1.015,
          stop:coin.price*0.993
        };

        tradeLog.unshift("🚀 BUY "+s);
      }
    }

    if(pos){
      if(coin.price>=pos.target){
        let gain=coin.price*pos.amount-pos.entry*pos.amount;

        user.balance+=coin.price*pos.amount;
        user.stats.trades++;
        user.stats.wins++;
        user.stats.profit+=gain;

        delete user.positions[s];
        user.portfolio[s]=0;

        tradeLog.unshift("💰 "+s+" "+gain.toFixed(2));
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

        tradeLog.unshift("🛑 "+s+" "+loss.toFixed(2));
        continue;
      }
    }
  }

  if(user.balance>10000){
    let p=user.balance-10000;
    user.balance=10000;
    user.profitBank+=p;
  }

},1500);


// API
app.get("/data",(req,res)=>{
  res.json({user,coins,botRunning,tradeLog});
});

app.post("/login",(req,res)=>{
  user.loggedIn=true;
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

app.post("/sell",(req,res)=>{
  const {symbol}=req.body;

  if(user.portfolio[symbol]>0){
    user.balance+=coins[symbol].price*user.portfolio[symbol];
    user.portfolio[symbol]=0;
    delete user.positions[symbol];

    tradeLog.unshift("MANUAL SELL "+symbol);
  }

  res.json({ok:true});
});


// UI
app.get("/",(req,res)=>{
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">

<div style="max-width:1100px;margin:auto;text-align:center">

<h1>🚀 PRO TERMINAL</h1>

<div style="display:flex;justify-content:center;gap:20px;margin:20px">

<div style="background:#1a1f26;padding:20px;border-radius:10px">
<h2>Balance</h2>
<p>$<span id="balance"></span></p>
</div>

<div style="background:#1a1f26;padding:20px;border-radius:10px">
<h2>Profit</h2>
<p>$<span id="profit"></span></p>
</div>

</div>

<div>
<span id="statusDot"></span>
<span id="statusText"></span>
</div>

<div style="margin:10px">
<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>
</div>

<div style="margin:15px">
🌍 🇪🇺 <span id="eu"></span> |
🇺🇸 <span id="us"></span> |
🇨🇳 <span id="cn"></span>
</div>

<div style="display:grid;grid-template-columns:repeat(2,1fr);gap:15px" id="coins"></div>

<div style="margin-top:30px" id="log"></div>

</div>

<script>
let selectedCoin=null;

function selectCoin(c){
  selectedCoin = selectedCoin===c ? null : c;
}

function updateClock(){
  let n=new Date();
  eu.innerText=n.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText=n.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText=n.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

function drawChart(canvas,candles){
  let ctx=canvas.getContext("2d");
  ctx.clearRect(0,0,400,200);

  candles.forEach((v,i)=>{
    let x=i*6;
    let open=200-v.open/10;
    let close=200-v.close/10;
    let high=200-v.high/10;
    let low=200-v.low/10;

    ctx.strokeStyle="white";
    ctx.beginPath();
    ctx.moveTo(x,high);
    ctx.lineTo(x,low);
    ctx.stroke();

    ctx.fillStyle=v.close>v.open?"lime":"red";
    ctx.fillRect(x-2,Math.min(open,close),4,Math.abs(open-close)+1);
  });
}

async function load(){
  let res=await fetch("/data");
  let d=await res.json();

  balance.innerText=d.user.balance.toFixed(2);
  profit.innerText=d.user.profitBank.toFixed(2);

  statusDot.innerHTML=d.botRunning
    ?"<span style='width:12px;height:12px;background:lime;border-radius:50%;display:inline-block'></span>"
    :"<span style='width:12px;height:12px;background:red;border-radius:50%;display:inline-block'></span>";

  statusText.innerText=d.botRunning?"BOT ACTIVE":"BOT STOPPED";

  let html="";

  for(let c in d.coins){
    let coin=d.coins[c];

    html+=\`
    <div style="background:#1a1f26;padding:15px;border-radius:10px">
      <div onclick="selectCoin('\${c}')">
        <h3>\${c}</h3>
        <p>$\${coin.price.toFixed(2)}</p>
        <p>Owned: \${d.user.portfolio[c]||0}</p>
      </div>

      \${!d.botRunning ? '<button onclick="sell(\\''+c+'\\')">SELL</button>' : ''}

      \${selectedCoin===c?'<canvas id="chart_'+c+'" width="400" height="200"></canvas>':''}
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

app.listen(3000,()=>console.log("🚀 FULL SYSTEM RUNNING"));
