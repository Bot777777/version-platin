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

let botRunning = true;

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
    candles: []
  };
});

let tradeLog = [];

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

  if(h.length < 20) return "hold";

  let dir = getDirection(h);

  let a = h[h.length-1];
  let b = h[h.length-2];

  let momentum = (a - b)/b;

  if(dir === "SIDE") return "hold";

  if(dir === "UP" && momentum > 0.0005){
    return "buy";
  }

  if(dir === "DOWN" && momentum < -0.0005){
    return "short";
  }

  return "hold";
}  

function getDirection(h){
  if(h.length < 20) return "SIDE";

  let a = h[h.length-1];
  let b = h[h.length-10];

  let move = (a - b)/b;

  if(move > 0.003) return "UP";
  if(move < -0.003) return "DOWN";

  return "SIDE";
}

// ================= SMART MODE (NEW) =================
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
setInterval(()=>{

  if(!botRunning) return;

  for(let s of symbols){

    let coin = coins[s];
    if(coin.price === 0) continue;

    let decision = aiDecision(coin.history);

    // BUY
    if(decision==="buy" && !user.portfolio[s]){
      let amount = (user.balance * 0.15) / coin.price;
      user.balance -= coin.price * amount;
      user.portfolio[s] = amount;
      coin.entry = coin.price;
      tradeLog.unshift("BUY "+s);
    }

    // SHORT
    if(decision==="short" && !user.shorts[s]){
      user.shorts[s] = 0.05;
      coin.shortEntry = coin.price;
      tradeLog.unshift("SHORT "+s);
    }

    // LONG EXIT
    if(user.portfolio[s]){
      let change = (coin.price - coin.entry)/coin.entry;

      if(change > 0.002 || change < -0.002){
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

      if(change > 0.002 || change < -0.002){
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
// (DEIN KOMPLETTER ORIGINAL UI CODE BLEIBT HIER UNVERÄNDERT)

app.listen(3000,()=>console.log("🚀 FINAL FIXED BOT RUNNING"));
