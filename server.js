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
let user = {
  balance: 500,
  profit: 0,
  fees: 0,
  portfolio: {},
  shorts: {},
  lastTrade: {},  
  stats: {
    trades: 0,
    wins: 0
  },
  maxOpenTrades: 3,
  loggedIn: false
};
let botRunning = true;

// ================= COINS =================
let symbols = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "XRPUSDT",



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
    if(h.length < 30) return "hold";

    let ema20 = getEMA(h.slice(-20), 20);
    let ema50 = getEMA(h.slice(-50), 50);
    let price = h[h.length - 1];
    let rsi = getRSI(h);

    // 🔥 LONG (Trend + Pullback)
    if(
        ema20 > ema50 &&
        price < ema20 * 1.0002 &&
        rsi < 48
    ){
        return "buy";
    }

    // 🔥 SHORT (Trend + Pullback)
    if(
        ema20 < ema50 &&
        price > ema20 * 0.9998 &&
        rsi > 52
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
const TRADE_SIZE = 50;
const FEE = 0.00075; 

startWebSocket();

setInterval(()=>{


  if(!botRunning) return;

for(let s of symbols){

  let coin = coins[s];
  if(coin.price === 0) continue;

  // ================= EXIT IMMER ZUERST =================
  // LONG EXIT
if(user.portfolio[s]){

  let change = (coin.price - coin.entry)/coin.entry;
  
  if(!coin.highest) coin.highest = coin.entry;
if(coin.price > coin.highest) coin.highest = coin.price;

// 🚀 NEUES TRAILING (WICHTIG)
let dropFromTop = (coin.highest - coin.price) / coin.highest;

if(dropFromTop > 0.005){ // 1% vom Hoch gefallen
    change = -1;
}
  let duration = coin.entryTime ? Date.now() - coin.entryTime : 0;



  if(
    change > 0.004 ||      // Take Profit (+0.3%)
    change < -0.007 ||     // Stop Loss (-0.2%)
    duration >300000       // Max 60 Sekunden
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


tradeLog.unshift("SELL " + s + " | " + gain.toFixed(2) + "$");
    
    user.portfolio[s] = 0;
    coin.entry = null;
    coin.entryTime = null;
    coin.highest = null;
    
    user.stats.trades++;
    if(gain > 0) user.stats.wins++;
    user.lastTrade[s] = Date.now();
    continue;
  }
}  // SHORT EXIT
  if(user.shorts[s]){

 let change = (coin.shortEntry - coin.price) / coin.shortEntry;

// 🔥 Trailing Low (NEU)
if(!coin.lowest) coin.lowest = coin.shortEntry;
if(coin.price < coin.lowest) coin.lowest = coin.price;

// 🚀 NEUES SHORT TRAILING
let riseFromBottom = (coin.price - coin.lowest) / coin.lowest;

if(riseFromBottom > 0.005){ // 1% vom Tief gestiegen
    change = -1;
}
    
let duration = coin.entryTime ? Date.now() - coin.entryTime : 0;

if(
    change > 0.004 ||     // +0.4% Gewinn
    change < -0.007 ||    // -0.6% Verlust
    duration > 300000     // 3 Minuten
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


tradeLog.unshift("CLOSE SHORT " + s + " | " + gain.toFixed(2) + "$");
    
    user.shorts[s] = 0;
    coin.shortEntry = null;
    coin.entryTime = null;
    coin.lowest = null;
  
    user.stats.trades++;
    if(gain > 0) user.stats.wins++;
    user.lastTrade[s] = Date.now();
  coin.lowest = null;
    continue;
  }
} // ================= LIMIT NACH EXIT =================
  let openTrades =
    Object.values(user.portfolio).filter(v => v > 0).length +
    Object.values(user.shorts).filter(v => v > 0).length;

  if(openTrades >= user.maxOpenTrades) continue;

  // ================= COOLDOWN =================
  let now = Date.now();

  if(!user.lastTrade) user.lastTrade = {};
  if(user.lastTrade[s] && now - user.lastTrade[s] <20000){
    continue;
  }

  // ================= AI =================
  let decision = aiDecision(coin.history);
  console.log(s, decision);
  let h = coin.history;
  if(h.length < 10) continue;

  let trendMove = (h[h.length-1] - h[h.length-10]) / h[h.length-10];
  let market = getMarketState(coin.history);


// ================= FILTER (LOCKER) =================

let last = h[h.length-1];
let prev = h[h.length-2];

// ❌ nur extreme Seitwärtsphasen skippen
//if(market === "SIDE" && Math.abs(trendMove) < 0.000) continue;

 //❌ Bewegung minimal erhöhen
if(Math.abs(trendMove) < 0.00005) continue;

// ❌ LONG nur leichter Rücksetzer
if(decision === "buy"){
 // if(last > prev * 1.001) continue;
}

// ❌ SHORT nur leichter Rücksetzer
if(decision === "short"){
// if(last < prev * 0.999) continue;
}
//  let move = Math.abs((h[h.length-1] - h[h.length-5]) / h[h.length-5]);

// if(move < 0.0001) continue;
  
  // BUY
  
if(decision==="buy" && !user.portfolio[s] && !user.shorts[s]){
  let amount = TRADE_SIZE / coin.price;
  user.balance -= TRADE_SIZE;

  user.portfolio[s] = amount; // ✅ WICHTIG
  coin.entry = coin.price;
coin.entryTime = Date.now();
  coin.highest = coin.price;
  user.lastTrade[s] = now;
tradeLog.unshift("BUY " + s + " @ " + coin.price.toFixed(2));
  user.globalLastTrade = now;
}
    // SHORT
  
if(decision==="short" && !user.shorts[s] && !user.portfolio[s]){
  let amount = TRADE_SIZE / coin.price;
  user.balance -= TRADE_SIZE;

  user.shorts[s] = amount;
  coin.shortEntry = coin.price;
coin.entryTime = Date.now();
  coin.lowest = coin.price;
  user.lastTrade[s] = now;
tradeLog.unshift("SHORT " + s + " @ " + coin.price.toFixed(2));
  user.globalLastTrade = now;
   }
 }
},2000);

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
res.json(
coins[req.params.symbol].candles.map((c, i) => ({
  time: Math.floor(
    (Date.now() - (coins[req.params.symbol].candles.length - i) * 3600000),
    ),
  open: c.open,
  high: c.high,
  low: c.low,
  close: c.close
}))
);
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
<script src="https://unpkg.com/lightweight-charts@4.1.1/dist/lightweight-charts.standalone.production.js"></script>

<script>
let selectedCoin = null;
const chartContainer = document.getElementById("chartContainer");
function selectCoin(c){
  if(selectedCoin === c){
    chartContainer.innerHTML = "";
    selectedCoin = null;
    return;
  }

  selectedCoin = c;
  loadChart(c);
}

async function loadChart(symbol){

  // 1. DATEN LADEN
  let res = await fetch('/candles/' + symbol);
  let candles = await res.json();

  // 2. CHART CONTAINER
  chartContainer.innerHTML = "<div id='chart' style='width:900px;height:400px'></div>";

  // 3. CHART ERSTELLEN
  const chart = LightweightCharts.createChart(
    document.getElementById("chart"),
    {
      layout: {
        background: { color: "#0b0f14" },
        textColor: "#DDD",
      },
      grid: {
        vertLines: { color: "#222" },
        horzLines: { color: "#222" },
      }
    }
  );

  // 4. SERIES
  const series = chart.addCandlestickSeries();

  // 5. DATEN MAPPEN
const data = candles.map((c) => ({
  time: Math.floor(c.time / 1000),
  open: c.open,
    high: c.high,
    low: c.low,
    close: c.close
  }));

  // 6. DATEN SETZEN
  series.setData(data);
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
for(let c in d.user.portfolio){
  if(d.user.portfolio[c] > 0){
    pos += c + " LONG<br>";
  }
}
for(let c in d.user.shorts){
  if(d.user.shorts[c] > 0){
    pos += c + " SHORT<br>";
  }
}
positions.innerHTML = pos || "keine";
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
