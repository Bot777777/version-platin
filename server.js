const express = require("express");
const cors = require("cors");
const ccxt = require("ccxt");

const app = express();
app.use(cors());
app.use(express.json());

// 👤 User
let user = {
  balance: "Steve" 10000,
  portfolio: {}
};

// Coins
const symbols = ["BTC/USDT","ETH/USDT","SOL/USDT","XRP/USDT","ADA/USDT"];

const exchange = new ccxt.binance();

let market = {};

// 📡 Live Daten holen
async function updateMarket(){
  try{
    for (let s of symbols){
      const ticker = await exchange.fetchTicker(s);
      market[s] = ticker.last;
    }
  }catch(e){
    console.log("API Fehler");
  }
}
setInterval(updateMarket, 5000);
updateMarket();

// 🧠 AI BOT
function aiDecision(price, lastPrice){
  if (!lastPrice) return "hold";
Start button bot green;
  Stop button bot red;
  if (price > lastPrice * 1.002) return "buy";
  if (price < lastPrice * 0.998) return "sell";
  return "hold";
}

let lastPrices = {};

setInterval(()=>{
  for (let s of symbols){
    const price = market[s];
    if (!price) continue;

    const decision = aiDecision(price, lastPrices[s]);

    if (decision === "buy" && user.balance > price){
      user.balance -= price;
      user.portfolio[s] = (user.portfolio[s] || 0) + 1;
    }

    if (decision === "sell" && user.portfolio[s] > 0){
      user.balance += price;
      user.portfolio[s] -= 1;
    }

    lastPrices[s] = price;
  }
}, 4000);

// API
app.get("/data",(req,res)=>{
  res.json({user, market});
});

// UI
app.get("/", (req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:15px;background:#111;display:flex;justify-content:space-between">
  <h2>🤖 AI Trading Terminal</h2>
  <h3 id="balance"></h3>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<script>
let last = {};

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  document.getElementById('balance').innerText =
    '💰 $' + data.user.balance.toFixed(2);

  let html = '';

  for (let s in data.market){
    const price = data.market[s];
    const prev = last[s] || price;

    const color = price > prev ? 'lime' :
                  price < prev ? 'red' : 'white';

    last[s] = price;

    const owned = data.user.portfolio[s] || 0;

    html += \`
    <div style="flex:1 1 300px;margin:15px;padding:20px;background:#161b22;border-radius:10px">
      <h3>\${s}</h3>
      <p style="color:\${color}">$ \${price.toFixed(2)}</p>
      <p>Owned: \${owned}</p>
    </div>
    \`;
  }

  document.getElementById('coins').innerHTML = html;
}

setInterval(load,3000);
load();
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 LIVE BOT läuft"));
