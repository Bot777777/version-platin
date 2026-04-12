const express = require("express");
const cors = require("cors");

const app = express();
app.use(cors());
app.use(express.json());

// 💰 Startkapital
let balance = 250000;

// 📊 Coins
let coins = {
  BTC: { price: 68950,93 owned: 1},
  ETH: { price: 1878,84, owned: 0 },
  SOL: { price: 100, owned: 0 }
  xrp :( price    1,14 , owned :1000
};

// 📈 Preis Simulation
setInterval(() => {
  for (let c in coins) {
    let change = (Math.random() - 0.5) * 0.02;
    coins[c].price *= (1 + change);
  }
}, 2000);

// API
app.get("/data", (req, res) => {
  res.json({ balance, coins });
});

app.post("/buy", (req, res) => {
  const { coin } = req.body;
  const price = coins[coin].price;

  if (balance >= price) {
    balance -= price;
    coins[coin].owned += 1;
  }

  res.json({ success: true });
});

app.post("/sell", (req, res) => {
  const { coin } = req.body;
  const price = coins[coin].price;

  if (coins[coin].owned > 0) {
    coins[coin].owned -= 1;
    balance += price;
  }

  res.json({ success: true });
});

// 🖥️ UI
app.get("/", (req, res) => {
  res.send(`
  <html>
  <body style="font-family:Arial;background:#111;color:#fff;text-align:center">

  <h1>🚀 PRO Crypto Trading App</h1>

  <h2 id="balance"></h2>

  <div id="coins"></div>

  <script>
  async function load(){
    const res = await fetch('/data');
    const data = await res.json();

    document.getElementById('balance').innerText =
      'Balance: $' + data.balance.toFixed(2);

    let html = '';

    for (let c in data.coins){
      const coin = data.coins[c];

      html += \`
        <div style="margin:20px;padding:20px;border:1px solid #444">
          <h2>\${c}</h2>
          <p>Preis: $\${coin.price.toFixed(2)}</p>
          <p>Besitz: \${coin.owned}</p>

          <button onclick="buy('\${c}')">Kaufen</button>
          <button onclick="sell('\${c}')">Verkaufen</button>
        </div>
      \`;
    }

    document.getElementById('coins').innerHTML = html;
  }

  async function buy(c){
    await fetch('/buy',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({coin:c})
    });
  }

  async function sell(c){
    await fetch('/sell',{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({coin:c})
    });
  }

  setInterval(load,2000);
  load();
  </script>

  </body>
  </html>
  `);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🚀 PRO APP läuft"));
