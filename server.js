const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 👤 User
let user = {
  balance: 10000,
  portfolio: {},
  loggedIn: false
};

// 🤖 Bot Status
let botRunning = false;

// Coins + History für Charts
let coins = {
  BTC: { price: 50000, history: [] },
  ETH: { price: 3000, history: [] },
  SOL: { price: 100, history: [] },
  XRP: { price: 0.5, history: [] },
  ADA: { price: 0.4, history: [] }
};

// 📊 Preisbewegung
setInterval(() => {
  for (let c in coins) {
    let change = (Math.random() - 0.5) * 0.01;
    coins[c].price *= (1 + change);

    coins[c].history.push(coins[c].price);
    if (coins[c].history.length > 30) coins[c].history.shift();
  }
}, 2000);

// 🧠 AI BOT (schneller Scalping Style)
setInterval(() => {
  if (!botRunning) return;

  for (let c in coins) {
    let coin = coins[c];
    let h = coin.history;
    if (h.length < 10) continue;

    let short = h.slice(-3).reduce((a,b)=>a+b)/3;
    let long = h.slice(-8).reduce((a,b)=>a+b)/8;

    if (short > long * 1.002 && user.balance > coin.price) {
      user.balance -= coin.price;
      user.portfolio[c] = (user.portfolio[c] || 0) + 1;
    }

    if (short < long * 0.998 && user.portfolio[c] > 0) {
      user.balance += coin.price;
      user.portfolio[c] -= 1;
    }
  }
}, 3000);

// API
app.get("/data",(req,res)=>{
  res.json({user, coins, botRunning});
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

// UI
app.get("/", (req,res)=>{
res.send(`
<html>
<body style="margin:0;background:#0b0f14;color:white;font-family:Arial">

<div style="padding:15px;background:#111;display:flex;justify-content:space-between">
  <h2>🤖 PRO Trading Terminal</h2>
  <div>
    <button onclick="login()">Login</button>
    <button onclick="start()">Start Bot</button>
    <button onclick="stop()">Stop Bot</button>
  </div>
</div>

<div style="padding:10px;background:#222">
  <span id="status"></span> | 
  <span id="balance"></span>
</div>

<div id="coins" style="display:flex;flex-wrap:wrap"></div>

<script>
let last = {};

async function load(){
  const res = await fetch('/data');
  const data = await res.json();

  document.getElementById('balance').innerText =
    '💰 $' + data.user.balance.toFixed(2);

  document.getElementById('status').innerText =
    data.botRunning ? '🟢 Bot läuft' : '🔴 Bot gestoppt';

  let html = '';

  for (let c in data.coins){
    const coin = data.coins[c];
    const prev = last[c] || coin.price;

    const color = coin.price > prev ? 'lime' :
                  coin.price < prev ? 'red' : 'white';

    last[c] = coin.price;

    // Mini Chart
    let chart = '';
    coin.history.forEach(v=>{
      chart += '<div style="width:2px;height:'+ (v/coin.price*50) +'px;background:lime;display:inline-block"></div>';
    });

    html += \`
    <div style="flex:1 1 300px;margin:10px;padding:15px;background:#161b22;border-radius:10px">
      <h3>\${c}</h3>
      <p style="color:\${color}">$ \${coin.price.toFixed(4)}</p>
      <p>Owned: \${data.user.portfolio[c]||0}</p>
      <div style="height:60px">\${chart}</div>
    </div>
    \`;
  }

  document.getElementById('coins').innerHTML = html;
}

async function login(){ await fetch('/login',{method:'POST'}); }
async function start(){ await fetch('/bot/start',{method:'POST'}); }
async function stop(){ await fetch('/bot/stop',{method:'POST'}); }

setInterval(load,2000);
load();
</script>

</body>
</html>
`);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>console.log("🚀 PRO BOT läuft"));
