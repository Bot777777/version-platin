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
  loggedIn: false
};

let botRunning = false;

let symbols = ["BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT","ADAUSDT"];

let coins = {};
symbols.forEach(s=>{
  coins[s] = {
    price: 100 + Math.random()*1000,
    history: [],
    candles: [],
    last: 100
  };
});

let tradeLog = [];


// MARKET
setInterval(()=>{
  for(let s in coins){
    let c = coins[s];

    let trend = Math.sin(Date.now()/4000);
    let noise = (Math.random()-0.5)*0.008;

    let open = c.price;
    let close = open * (1 + trend*0.003 + noise);

    let high = Math.max(open, close)*(1+Math.random()*0.005);
    let low = Math.min(open, close)*(1-Math.random()*0.005);

    c.price = close;

    c.candles.push({open,close,high,low});
    if(c.candles.length > 60) c.candles.shift();

    c.history.push(close);
    if(c.history.length > 60) c.history.shift();
  }
},1500);


// 🔥 SCALPING AI
function aiDecision(h){
  if(h.length < 20) return "hold";

  let short = h.slice(-3).reduce((a,b)=>a+b)/3;
  let long = h.slice(-15).reduce((a,b)=>a+b)/15;

  let diff = (short - long) / long;

  if(diff > 0.002) return "buy";
  if(diff < -0.002) return "sell";

  return "hold";
}


// 🤖 BOT (SCALPING)
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin = coins[s];
    let decision = aiDecision(coin.history);
    let pos = user.positions[s];

    // BUY
    if(!pos && decision==="buy"){
      let invest = user.balance * 0.1;

      if(invest > coin.price){
        let amount = invest / coin.price;

        user.balance -= invest;
        user.portfolio[s] = (user.portfolio[s]||0)+amount;

        user.positions[s] = {
          entry: coin.price,
          amount
        };

        tradeLog.unshift("🟢 BUY "+s);
      }
    }

    // SELL
    if(pos){
      let change = (coin.price - pos.entry) / pos.entry;

      // 💰 Gewinn schnell sichern
      if(change > 0.005){
        user.balance += coin.price * pos.amount;

        delete user.positions[s];
        user.portfolio[s] = 0;

        tradeLog.unshift("💰 +"+(change*100).toFixed(2)+"% "+s);
        continue;
      }

      // 🛑 Stop Loss
      if(change < -0.01){
        user.balance += coin.price * pos.amount;

        delete user.positions[s];
        user.portfolio[s] = 0;

        tradeLog.unshift("🛑 LOSS "+s);
        continue;
      }
    }
  }

  // 💎 PROFIT LOCK
  if(user.balance > 10000){
    let profit = user.balance - 10000;
    user.balance = 10000;
    user.profitBank += profit;

    tradeLog.unshift("💎 PROFIT "+profit.toFixed(2));
  }

},1200);


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
  res.json({running:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({running:false});
});

app.post("/sell",(req,res)=>{
  const {symbol} = req.body;

  if(user.portfolio[symbol] > 0){
    user.balance += coins[symbol].price * user.portfolio[symbol];
    user.portfolio[symbol] = 0;
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

<div style="max-width:1200px;margin:auto">

<h2>🚀 PRO TERMINAL V5 (SCALPER)</h2>

<div>
Balance: $<span id="balance"></span> |
Portfolio: $<span id="portfolio"></span> |
Profit: $<span id="profit"></span>
</div>

<div id="status"></div>

<div style="margin-top:10px">
<button onclick="login()">Login</button>
<button onclick="start()">Start</button>
<button onclick="stop()">Stop</button>
</div>

<div style="margin-top:10px">
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
  let now = new Date();
  eu.innerText = now.toLocaleTimeString("de-DE",{timeZone:"Europe/Berlin"});
  us.innerText = now.toLocaleTimeString("en-US",{timeZone:"America/New_York"});
  cn.innerText = now.toLocaleTimeString("zh-CN",{timeZone:"Asia/Shanghai"});
}

async function load(){
  const res = await fetch("/data");
  const data = await res.json();

  balance.innerText = data.user.balance.toFixed(2);
  profit.innerText = data.user.profitBank.toFixed(2);

  let portfolioValue = 0;
  for(let c in data.user.portfolio){
    portfolioValue += (data.user.portfolio[c]||0) * data.coins[c].price;
  }
  portfolio.innerText = portfolioValue.toFixed(2);

  status.innerHTML = data.botRunning
    ? "🟢 <span style='color:lime'>BOT ACTIVE</span>"
    : "🔴 <span style='color:red'>BOT STOPPED</span>";

  let html = "";

  for(let c in data.coins){
    let coin = data.coins[c];

    html += \`
    <div style="background:#1a1f26;padding:15px;margin:15px;border-radius:12px">
      <h2>\${c}</h2>
      <p>Price: $\${coin.price.toFixed(2)}</p>
      <p>Owned: \${data.user.portfolio[c]||0}</p>
      <button onclick="sell('\${c}')">SELL</button>
    </div>
    \`;
  }

  coins.innerHTML = html;

  let logHTML = "<h3>Trades</h3>";
  data.tradeLog.slice(0,10).forEach(t=>{
    logHTML += "<p>"+t+"</p>";
  });

  log.innerHTML = logHTML;
}

async function sell(s){
  await fetch("/sell",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({symbol:s})});
  load();
}

async function login(){ await fetch("/login",{method:"POST"}); load(); }
async function start(){ await fetch("/bot/start",{method:"POST"}); load(); }
async function stop(){ await fetch("/bot/stop",{method:"POST"}); load(); }

setInterval(load,2000);
setInterval(updateClock,1000);
load();
</script>

</body>
</html>
`);
});

app.listen(3000,()=>console.log("🚀 SCALPING BOT RUNNING"));
