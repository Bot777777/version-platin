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
  loggedIn: false
};

let botRunning = true;

// ================= COINS =================
let symbols = [
  "BTCUSDT","ETHUSDT","SOLUSDT","AVAXUSDT","LINKUSDT",
  "BNBUSDT","XRPUSDT","ADAUSDT","MATICUSDT","DOGEUSDT",
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

// ================= WEBSOCKET =================
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
    setTimeout(startWebSocket, 2000);
  });

  ws.on("error", () => {
    ws.close();
  });
}

// ================= CANDLES =================
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
  if(h.length < 50) return "hold";

  let ema20 = getEMA(h.slice(-20), 20);
  let ema50 = getEMA(h.slice(-50), 50);
  let price = h[h.length - 1];

  if(ema20 > ema50 && price > ema20) return "buy";
  if(ema20 < ema50 && price < ema20) return "short";

  return "hold";
}

function getEMA(prices, period){
  let k = 2/(period+1);
  let ema = prices[0];
  for(let i=1;i<prices.length;i++){
    ema = prices[i]*k + ema*(1-k);
  }
  return ema;
}

// ================= BOT =================
const TRADE_SIZE = 20;
const FEE = 0.002;

startWebSocket();

setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){

    let openTrades =
      Object.values(user.portfolio).filter(v => v).length +
      Object.values(user.shorts).filter(v => v).length;

    if(openTrades >= user.maxOpenTrades) continue;

    let now = Date.now();

    if(!user.lastTrade) user.lastTrade = {};
    if(user.lastTrade[s] && now - user.lastTrade[s] < 30000) continue;

    let coin = coins[s];
    if(coin.price === 0) continue;

    let decision = aiDecision(coin.history);

    // BUY
    if(decision==="buy" && !user.portfolio[s] && !user.shorts[s]){
      let amount = TRADE_SIZE / coin.price;
      user.balance -= TRADE_SIZE;

      user.portfolio[s] = {
        amount,
        entry: coin.price,
        entryTime: Date.now()
      };

      user.lastTrade[s] = now;
      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(decision==="short" && !user.shorts[s] && !user.portfolio[s]){
      let amount = TRADE_SIZE / coin.price;
      user.balance -= TRADE_SIZE;

      user.shorts[s] = {
        amount,
        entry: coin.price,
        entryTime: Date.now()
      };

      user.lastTrade[s] = now;
      tradeLog.unshift("SHORT "+s);
    }

    // LONG EXIT
    if(user.portfolio[s]){
      let trade = user.portfolio[s];

      let change = (coin.price - trade.entry) / trade.entry;
      let duration = Date.now() - trade.entryTime;

      if(change > 0.0012 || change < -0.002 || duration > 60000){

        let invested = trade.entry * trade.amount;
        let returned = coin.price * trade.amount;
        let fee = returned * FEE;

        user.fees += fee;
        let gain = (returned - invested) - fee;

        user.balance += returned;
        user.profit += gain;

        user.portfolio[s] = null;

        user.stats.trades++;
        if(gain > 0) user.stats.wins++;

        tradeLog.unshift("LONG " + gain.toFixed(2));
      }
    }

    // SHORT EXIT (FIXED)
    if(user.shorts[s]){

      let trade = user.shorts[s];

      let change = (trade.entry - coin.price) / trade.entry;
      let duration = Date.now() - trade.entryTime;

      if(
        change > 0.0012 ||
        change > 0.003 ||
        change < -0.002 ||
        duration > 60000
      ){

        let invested = trade.entry * trade.amount;
        let returned = coin.price * trade.amount;
        let fee = returned * FEE;

        user.fees += fee;
        let gain = (invested - returned) - fee;

        user.balance += invested;
        user.profit += gain;

        let logLine = \`\${new Date().toISOString()} | \${s} | SHORT | \${gain}\\n\`;
        fs.appendFileSync("trades.log", logLine);

        user.shorts[s] = null;

        user.stats.trades++;
        if(gain > 0) user.stats.wins++;

        tradeLog.unshift("SHORT " + gain.toFixed(2));
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

app.get("/candles/:symbol", async (req,res)=>{
  await fetchCandles(req.params.symbol);
  res.json(coins[req.params.symbol].candles);
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

<button onclick="start()">START</button>
<button onclick="stop()">STOP</button>

</div>

<div id="portfolio"></div>

<script>
async function load(){
  let d=await (await fetch('/data')).json();

  let pf="";
  for(let c in d.user.portfolio){
    if(d.user.portfolio[c]){
      pf+=c+": "+d.user.portfolio[c].amount.toFixed(4)+"<br>";
    }
  }
  portfolio.innerHTML=pf||"leer";
}
setInterval(load,1000);
</script>

</body>
</html>
`);
});

app.listen(3000,()=>console.log("🚀 FINAL FIXED BOT RUNNING"));
