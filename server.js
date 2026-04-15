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
  stats: {
    trades: 0,
    wins: 0
  },
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
    candles: [],
    trailing: null,       // NEW
    partialSold: false    // NEW
  };
});

let tradeLog = [];

// ================= EMA / TREND =================
// NEW
function getEMA(prices, period){
  let k = 2 / (period + 1);
  let ema = prices[0];
  for(let i=1;i<prices.length;i++){
    ema = prices[i] * k + ema * (1 - k);
  }
  return ema;
}

// NEW
function getTrend(history){
  if(history.length < 50) return "SIDE";

  let ema50 = getEMA(history.slice(-50),50);
  let ema20 = getEMA(history.slice(-20),20);

  if(ema20 > ema50) return "UP";
  if(ema20 < ema50) return "DOWN";
  return "SIDE";
}

// ================= PRICES =================
async function fetchPrices(){
  try{
    const res = await axios.get("https://api.binance.com/api/v3/ticker/price");

    res.data.forEach(item=>{
      if(coins[item.symbol]){
        let price = parseFloat(item.price);
        coins[item.symbol].price = price;
        coins[item.symbol].history.push(price);

        if(coins[item.symbol].history.length > 100){ // NEW (mehr Daten für Trend)
          coins[item.symbol].history.shift();
        }
      }
    });
  }catch(e){}
}

fetchPrices();
setInterval(fetchPrices,1500);

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
function aiDecision(h){

  if(h.length < 30) return "hold"; // NEW (mehr Daten nötig)

  let trend = getTrend(h); // NEW

  let a = h[h.length-1];
  let b = h[h.length-3];

  let momentum = (a - b) / b; // NEW

  // NEW bessere Logik
  if(trend === "UP" && momentum > 0.0007) return "buy";
  if(trend === "DOWN" && momentum < -0.0007) return "short";

  return "hold";
}

// ================= BOT =================
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){

    let coin = coins[s];
    if(coin.price === 0) continue;

    let decision = aiDecision(coin.history);

    // NEW dynamisches Risiko
    let risk = user.balance * 0.02;
    let amount = risk / coin.price;

    // BUY
    if(decision==="buy" && !user.portfolio[s]){
      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;
      coin.entry = coin.price;
      coin.partialSold = false; // NEW
      coin.trailing = null;     // NEW
      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(decision==="short" && !user.shorts[s]){
      user.shorts[s] = amount;
      coin.shortEntry = coin.price;
      tradeLog.unshift("SHORT "+s);
    }

    // LONG EXIT / MANAGEMENT
    if(user.portfolio[s]){
      let change = (coin.price - coin.entry)/coin.entry;

      // NEW STOP LOSS
      if(change < -0.02){
        user.balance += coin.price * user.portfolio[s];
        user.portfolio[s] = 0;
        coin.entry = null;

        user.stats.trades++;
        tradeLog.unshift("STOP LOSS");
      }

      // NEW PARTIAL PROFIT
      if(change > 0.004 && !coin.partialSold){
        let half = user.portfolio[s] / 2;
        user.balance += coin.price * half;
        user.portfolio[s] -= half;
        coin.partialSold = true;
      }

      // NEW TRAILING PROFIT
      if(change > 0.01){

        if(!coin.trailing) coin.trailing = coin.price * 0.995;

        if(coin.price < coin.trailing){
          let gain = (coin.price - coin.entry) * user.portfolio[s];

          user.balance += coin.price * user.portfolio[s];
          user.portfolio[s] = 0;
          coin.entry = null;

          coin.trailing = null;
          coin.partialSold = false;

          user.stats.trades++;
          user.stats.wins++;

          applyProfit();
          tradeLog.unshift("BIG WIN "+gain.toFixed(2));
        }

        if(coin.price > coin.trailing){
          coin.trailing = coin.price * 0.995;
        }
      }

      // ORIGINAL fallback (bleibt erhalten)
      if(change > 0.0015){
        let gain = (coin.price - coin.entry) * user.portfolio[s];

        user.balance += coin.price * user.portfolio[s];
        user.portfolio[s] = 0;
        coin.entry = null;

        user.stats.trades++;
        user.stats.wins++;

        applyProfit();
        tradeLog.unshift("LONG +"+gain.toFixed(2));
      }
    }

    // SHORT EXIT
    if(user.shorts[s]){
      let change = (coin.shortEntry - coin.price)/coin.shortEntry;

      if(change > 0.0015){
        let gain = (coin.shortEntry - coin.price) * user.shorts[s];

        user.balance += gain;
        user.shorts[s] = 0;
        coin.shortEntry = null;

        user.stats.trades++;
        user.stats.wins++;

        applyProfit();
        tradeLog.unshift("SHORT +"+gain.toFixed(2));
      }
    }
  }

},800);

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

app.post("/bot/start",(req,res)=>{
  botRunning = true;
  res.json({ok:true});
});

app.post("/bot/stop",(req,res)=>{
  botRunning = false;
  res.json({ok:true});
});

// ================= UI =================
// (UNVERÄNDERT)
app.get("/",(req,res)=>{
res.send(`...DEIN ORIGINAL UI BLEIBT HIER UNVERÄNDERT...`);
});

app.listen(3000,()=>console.log("🚀 FINAL FIXED BOT RUNNING"));
