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

// 🔥 MEHR COINS
let symbols = [
  "BTCUSDT","ETHUSDT","SOLUSDT","XRPUSDT",
  "ADAUSDT","DOGEUSDT","AVAXUSDT","LINKUSDT"
];

let coins = {};
symbols.forEach(s=>{
  coins[s] = { price:100+Math.random()*1000, history:[], candles:[] };
});

let tradeLog=[];


// MARKET
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


// 🧠 PRO AI (mit Volatility Filter)
function aiDecision(h){
  if(h.length<40) return "skip";

  let short=h.slice(-5).reduce((a,b)=>a+b)/5;
  let mid=h.slice(-20).reduce((a,b)=>a+b)/20;
  let long=h.slice(-40).reduce((a,b)=>a+b)/40;

  let momentum=(short-mid)/mid;
  let trend=(mid-long)/long;

  let volatility=Math.abs(h[h.length-1]-h[h.length-5])/h[h.length-5];

  // ❌ keine Bewegung → kein Trade
  if(volatility < 0.002) return "skip";

  // ✅ nur starke Setups
  if(momentum>0.004 && trend>0.002){
    return "buy";
  }

  return "skip";
}


// 🤖 BOT
setInterval(()=>{
  if(!botRunning) return;

  for(let s of symbols){
    let coin=coins[s];
    let decision=aiDecision(coin.history);
    let pos=user.positions[s];

    // BUY
    if(!pos && decision==="buy"){
      let invest=user.balance*0.12;

      if(invest>coin.price){
        let amount=invest/coin.price;

        user.balance-=invest;
        user.portfolio[s]=(user.portfolio[s]||0)+amount;

        user.positions[s]={
          entry:coin.price,
          amount,
          target:coin.price*1.015, // +1.5%
          stop:coin.price*0.993    // -0.7%
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

  // PROFIT LOCK
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


// UI bleibt wie deine aktuelle Version (kein Risiko kaputt zu machen)

app.get("/",(req,res)=>{
  res.send("USE YOUR CURRENT UI (STABLE)");
});

app.listen(3000,()=>console.log("🚀 PRO BOT RUNNING"));
