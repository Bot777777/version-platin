const express = require("express");
const cors = require("cors");
const axios = require("axios");
const WebSocket = require("ws");
const crypto = require("crypto");

const API_KEY = process.env.API_KEY;
const API_SECRET = process.env.API_SECRET;
const fs = require("fs");
process.on("uncaughtException", (err) => {
  console.log("UNCAUGHT ERROR:", err);
});

process.on("unhandledRejection", (err) => {
  console.log("PROMISE ERROR:", err);
});
const app = express();
app.use(cors());
app.use(express.json());

// ================= USER =================
lastTrade: []
let user = {

  balance: 500,
  profit: 0,
  fees: 0,
  portfolio: {},
  shorts: {},
  stats: {
    trades: 0,
    wins: 0
  },
  maxOpenTrades: 3,
  loggedIn: false // ✅ FIX (Komma)
};

let botRunning = true;

// ================= COINS =================
let symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "AVAXUSDT",
  "LINKUSDT",
  "BNBUSDT",
"XRPUSDT",
"ADAUSDT",
"MATICUSDT",
"DOGEUSDT",
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


function startWebSocket(){

  const streams = symbols.map(s => s.toLowerCase() + "@trade").join("/");

  const ws = new WebSocket("wss://stream.binance.com:9443/stream?streams=" + streams);

  ws.on("message", (data) => {
    try{
      const parsed = JSON.parse(data);

      if(!parsed.data) return;

      const trade = parsed.data;

      if(!trade.s || !trade.p) return;

      const symbol = trade.s;
      const price = parseFloat(trade.p);

      if(!coins[symbol]) return;

      coins[symbol].price = price;
      coins[symbol].history.push(price);

  if(coins[symbol].history.length > 80){
  coins[symbol].history.shift();
}

    }catch(e){
      console.log("WS Error", e.message);
    }
  });

  ws.on("close", () => {
    console.log("WS closed → reconnecting...");
    setTimeout(startWebSocket, 2000);
  });

  ws.on("error", () => {
    ws.close();
  });

} // ✅ GANZ WICHTIG → schließt startWebSocket()

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

// fetchPrices();
// setInterval(fetchPrices,1500);

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
function getRSI(prices, period = 14){
  if(prices.length < period + 1) return 50;

  let gains = 0;
  let losses = 0;

  for(let i = prices.length - period; i < prices.length; i++){
    let diff = prices[i] - prices[i-1];
    if(diff >= 0) gains += diff;
    else losses -= diff;
  }

  let rs = gains / (losses || 1);
  return 100 - (100 / (1 + rs));
}

function aiDecision(h){

  if(h.length < 50) return "hold";

  let ema20 = getEMA(h.slice(-20), 20);
  let ema50 = getEMA(h.slice(-50), 50);
  let price = h[h.length - 1];
  let rsi = getRSI(h);

  // 🔥 LONG
  if(
    ema20 > ema50 &&        // Trend up
    price > ema20 &&        // über EMA
    rsi < 40                // Rücksetzer!
  ){
    return "buy";
  }

  // 🔥 SHORT
  if(
    ema20 < ema50 &&        // Trend down
    price < ema20 &&        // unter EMA
    rsi > 60                // Rücksetzer!
  ){
    return "short";
  }

  return "hold";

}// ================= SMART MODE =================
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
const TRADE_SIZE = 20;
const FEE = 0.002; 

startWebSocket();

setInterval(()=>{


  if(!botRunning) return;

for(let s of symbols){

  let coin = coins[s];
  if(coin.price === 0) continue;

  // ================= EXIT IMMER ZUERST =================
  if(user.portfolio[s]){
    let change = (coin.price - coin.entry)/coin.entry;
    let duration = coin.entryTime ? Date.now() - coin.entryTime : 0;

    if(
      change > 0.0012 ||
      change > 0.003 ||
      change < -0.002 ||
      duration > 60000
    ){
      let invested = coin.entry * user.portfolio[s];
      let returned = coin.price * user.portfolio[s];
      let fee = returned * FEE;

      user.fees += fee;
      let gain = (returned - invested) - fee;

      user.balance += returned;
      user.profit += gain;

      let logLine = `${new Date().toISOString()} | ${s} | LONG | ${gain}\n`;
      fs.appendFileSync("trades.log", logLine);

      user.portfolio[s] = 0;
      coin.entry = null;
      coin.entryTime = null;

      user.stats.trades++;
      if(gain > 0) user.stats.wins++;

      tradeLog.unshift("LONG " + gain.toFixed(2));
    }
  }

  if(user.shorts[s]){
    let change = (coin.shortEntry - coin.price)/coin.shortEntry;
    let duration = coin.entryTime ? Date.now() - coin.entryTime : 0;

    if(
      change > 0.0012 ||
      change > 0.003 ||
      change < -0.002 ||
      duration > 60000
    ){
      let invested = coin.shortEntry * user.shorts[s];
      let returned = coin.price * user.shorts[s];
      let fee = returned * FEE;

      user.fees += fee;
      let gain = (invested - returned) - fee;

      user.balance += invested;
      user.profit += gain;

      let logLine = `${new Date().toISOString()} | ${s} | SHORT | ${gain}\n`;
      fs.appendFileSync("trades.log", logLine);

      user.shorts[s] = 0;
      coin.shortEntry = null;
      coin.entryTime = null;

      user.stats.trades++;
      if(gain > 0) user.stats.wins++;

      tradeLog.unshift("SHORT " + gain.toFixed(2));
    }
  }

  // ================= LIMIT NACH EXIT =================
  let openTrades =
    Object.values(user.portfolio).filter(v => v > 0).length +
    Object.values(user.shorts).filter(v => v > 0).length;

  if(openTrades >= user.maxOpenTrades) continue;

  // ================= COOLDOWN =================
  let now = Date.now();

  if(!user.lastTrade) user.lastTrade = {};
  if(user.lastTrade[s] && now - user.lastTrade[s] < 30000){
    continue;
  }

  // ================= AI =================
  let decision = aiDecision(coin.history);
  let h = coin.history;
  if(h.length < 10) continue;

  let trendMove = (h[h.length-1] - h[h.length-10]) / h[h.length-10];
  let market = getMarketState(coin.history);
// ================= FILTER =================

let last = h[h.length-1];
let prev = h[h.length-2];

// ❌ kein Trading im Seitwärtsmarkt
if(market === "SIDE") continue;

// ❌ Bewegung zu klein → Fees fressen Profit
if(Math.abs(trendMove) < 0.0015) continue;

// ❌ LONG nur wenn Trend UP + kleiner Rücksetzer
if(decision === "buy"){
  if(market !== "UP") continue;
  if(last > prev) continue; // kein Einstieg wenn Preis steigt
}

// ❌ SHORT nur wenn Trend DOWN + kleiner Rücksetzer
if(decision === "short"){
  if(market !== "DOWN") continue;
  if(last < prev) continue; // kein Einstieg wenn Preis fällt
}
  console.log(s, decision);
 
  // BUY
if(decision==="buy" && !user.portfolio[s] && !user.shorts[s]){
  let amount = TRADE_SIZE / coin.price;
  user.balance -= TRADE_SIZE;

  user.portfolio[s] = amount; // ✅ WICHTIG
  coin.entry = coin.price;
coin.entryTime = Date.now();
  user.lastTrade[s] = now;
  tradeLog.unshift("BUY "+s);
  user.globalLastTrade = now;
}
    // SHORT
if(decision==="short" && !user.shorts[s] && !user.portfolio[s]){
  let amount = TRADE_SIZE / coin.price;
  user.balance -= TRADE_SIZE;

  user.shorts[s] = amount;
  coin.shortEntry = coin.price;
coin.entryTime = Date.now();
  user.lastTrade[s] = now;
  tradeLog.unshift("SHORT "+s);
   user.globalLastTrade = now;
}
   // LONG EXIT
   // ================= LONG EXIT =================
if(user.portfolio[s]){

  let change = (coin.price - coin.entry)/coin.entry;
  let duration = Date.now() - coin.entryTime;

  if(
    change > 0.0012 ||   // kleiner Gewinn
    change > 0.003 ||    // großer Gewinn
    change < -0.005 ||   // Stop Loss
    duration > 60000     // Zeitlimit
  ){

    let invested = coin.entry * user.portfolio[s];
    let returned = coin.price * user.portfolio[s];

    let fee = returned * FEE;
    user.fees += fee;

    let gain = (returned - invested) - fee;

    user.balance += returned;
    user.profit += gain;

    let logLine = `${new Date().toISOString()} | ${s} | LONG | ${gain}\n`;
    fs.appendFileSync("trades.log", logLine);

    user.portfolio[s] = 0;
    coin.entry = null;
    coin.entryTime = null;

    user.stats.trades++;
    if(gain > 0) user.stats.wins++;

    tradeLog.unshift("LONG " + gain.toFixed(2));
  }
}
   // SHORT EXIT
   if(user.shorts[s]){
     let change = (coin.shortEntry - coin.price)/coin.shortEntry;

     let duration = coin.entryTime ? Date.now() - coin.entryTime : 0;

if(
  change > 0.0012 ||
  change > 0.003 ||
  change < -0.005 ||
  duration > 60000
){
  let invested = coin.shortEntry * user.shorts[s];
       let returned = coin.price * user.shorts[s];
      let fee = returned * FEE;
       user.fees += fee; // ✅ NEU
       let gain = (invested - returned) - fee;       
       user.balance += invested; // ✅ FIX (korrekt statt returned)
       user.profit += gain;
let logLine = `${new Date().toISOString()} | ${s} | SHORT | ${gain}\n`;
fs.appendFileSync("trades.log", logLine);
       user.shorts[s] = 0;
       coin.shortEntry = null;
coin.entryTime = null;
       user.stats.trades++;
       if(gain > 0) user.stats.wins++;

       tradeLog.unshift("SHORT +" + gain.toFixed(2));
     }
   }

  }

},400);

// ================= API =================
app.get("/data",(req,res)=>{
  let netProfit = user.profit - user.fees;

  let profitPerTrade = user.stats.trades
    ? netProfit / user.stats.trades
    : 0;

  res.json({
    user,
    coins,
    botRunning,
    tradeLog,
    netProfit,
    profitPerTrade
  });
});
app.get("/ip", (req,res)=>{
  res.send(req.ip);
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
app.get("/", (req, res) => {
res.send(`
<html>
<body style="background:#0b0f14;color:white;font-family:Arial">
<h1 style="text-align:center;font-size:42px">🚀 PRO TERMINAL</h1>
<div style="text-align:center;font-size:22px">
Balance: $<span id="balance"></span> |
Profit: $<span id="profit"></span> |
Fees: $<span id="fees"></span> |
Net: $<span id="net"></span><br>
Profit/Trade: $<span id="ppt"></span><br><br>
<span id="status"></span><br><br>
<button onclick="start()" style="font-size:18px;padding:10px;margin:5px">START</button>
<button onclick="stop()" style="font-size:18px;padding:10px;margin:5px">STOP</button>
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
fees.innerText = (d.user.fees || 0).toFixed(2);
net.innerText = (d.netProfit || 0).toFixed(2);
ppt.innerText = (d.profitPerTrade || 0).toFixed(4);
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
