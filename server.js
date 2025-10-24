// server.js — TCS Marketplace Assistant
import express from "express";
import fs from "fs/promises";
import path from "path";
import cors from "cors";
import bodyParser from "body-parser";

const app = express();
app.use(cors());
app.use(bodyParser.json());

const CATALOG_PATH = path.join(process.cwd(), "catalog.json");

function normalize(s) {
  return (s || "").toLowerCase();
}

function scoreProduct(p, query, opts) {
  let score = 0;
  const q = normalize(query);
  const hay = `${normalize(p.title)} ${normalize(p.brand)} ${normalize(p.category)} ${(p.tags || []).map(normalize).join(" ")}`;
  if (q) {
    q.split(/\s+/).forEach(tok => {
      if (tok && hay.includes(tok)) score += 2;
    });
  }
  if (opts.category && normalize(p.category) === normalize(opts.category)) score += 3;
  if (opts.maxPrice && p.price <= opts.maxPrice) score += 2;
  if (opts.usOnly && (hay.includes("us") || hay.includes("us-made") || hay.includes("us supplier"))) score += 1;
  if (opts.tags?.length) opts.tags.forEach(t => { if (hay.includes(normalize(t))) score += 1; });
  if (p.in_stock) score += 1;
  return score;
}

function extractIntent(message) {
  const m = normalize(message);
  const intent = {
    type: "Find_Product",
    maxPrice: undefined,
    category: undefined,
    usOnly: /us|u\.s\.|usa|us-made|us supplier/.test(m),
    tags: []
  };
  const underMatch = m.match(/under\s*\$?(\d+)/);
  if (underMatch) intent.maxPrice = parseFloat(underMatch[1]);
  if (/sauce|bbq|rub|season/.test(m)) intent.category = "Sauces";
  if (/beauty|skincare|serum|hyaluronic|collagen|toothbrush|massage/.test(m)) intent.category = "Beauty & Wellness";
  if (/bundle|pack/.test(m)) intent.tags.push("bundle");
  if (/cater|event|booking|wedding|party|private flight/.test(m)) intent.type = "Catering_Lead";
  return intent;
}

function pickReply(intent, picks, shipping) {
  if (intent.type === "Catering_Lead") {
    return `I can help with TCS Promotions bookings. Could you share the date, city, headcount, cuisine vibe, and budget?`;
  }
  if (picks.length === 0) {
    return `I couldn’t find a perfect match yet. Want to see best sellers or tell me your budget and category?`;
  }
  const freeLeft = Math.max(0, (shipping?.free_threshold ?? 49) - picks.reduce((s, p) => s + p.price, 0));
  const freeNote = freeLeft > 0 ? `Add ~$${freeLeft.toFixed(2)} to unlock free shipping.` : `You're at the free-shipping threshold.`;
  return `Here are ${picks.length} good picks. ${freeNote}`;
}

app.post("/api/tcs-assistant", async (req, res) => {
  try {
    const { message } = req.body;
    const raw = await fs.readFile(CATALOG_PATH, "utf-8");
    const data = JSON.parse(raw);
    const products = data.products || [];
    const shipping = data.shipping || {};

    const intent = extractIntent(message || "");
    if (intent.type === "Catering_Lead") {
      return res.json({ reply: pickReply(intent, [], shipping), products: [] });
    }

    const scored = products.map(p => ({ p, s: scoreProduct(p, message || "", intent) }))
      .sort((a, b) => b.s - a.s);

    const top = scored.filter(x => x.s > 0).slice(0, 3).map(x => ({
      title: x.p.title,
      price: x.p.price,
      image: x.p.image,
      url: x.p.url
    }));

    const reply = pickReply(intent, top, shipping);
    res.json({ reply, products: top });
  } catch (e) {
    console.error(e);
    res.status(500).json({ reply: "I’m having trouble right now. Try again in a moment.", products: [] });
  }
});

app.get('/', (req, res) => {
  res.send(`
    <html>
      <head>
        <title>TCS Marketplace Assistant</title>
        <style>
          body {
            background-color: #000;
            color: #fff;
            font-family: Arial, sans-serif;
            text-align: center;
            padding-top: 100px;
          }
          h1 {
            color: #ff0000;
          }
          p {
            font-size: 18px;
          }
        </style>
      </head>
      <body>
        <h1>🔥 TCS Marketplace AI Assistant</h1>
        <p>Powered by Sauced HTX • “Get Sauced With Us”</p>
        <p>API is live and ready to connect!</p>
      </body>
    </html>
  `);
});
app.get('/', (req, res) => {
  const API_URL = `${req.protocol}://${req.get('host')}/api/tcs-assistant`;
  const LOGO = 'https://your-cdn-or-shopify-logo-url.png'; // <- replace with your logo

  res.send(`
<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>TCS Marketplace AI Assistant</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    body{margin:0;background:#000;color:#fff;font-family:Arial,Helvetica,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center}
    .card{max-width:760px;width:92%;background:#111;border:1px solid #222;border-radius:16px;padding:28px;box-shadow:0 10px 40px rgba(0,0,0,.4);text-align:center}
    img.logo{width:120px;height:120px;object-fit:contain;border-radius:12px;margin:6px auto 14px auto;display:block;filter:drop-shadow(0 4px 14px rgba(255,0,0,.25))}
    h1{margin:6px 0 8px 0;font-size:28px;letter-spacing:.2px}
    .tag{opacity:.85}
    .row{display:flex;gap:10px;justify-content:center;flex-wrap:wrap;margin-top:16px}
    input,button{padding:12px 14px;border-radius:10px;border:1px solid #333;background:#0f0f0f;color:#fff;outline:none}
    input{min-width:280px}
    button{cursor:pointer}
    .ok{border-color:#333}
    .cta{background:#ff1a1a;border-color:#ff1a1a;font-weight:700}
    pre{background:#0b0b0b;border:1px solid #222;border-radius:10px;padding:14px;text-align:left;overflow:auto;max-height:320px;margin-top:16px;white-space:pre-wrap;word-break:break-word}
    a.link{color:#ff4d4d;text-decoration:none}
    .small{opacity:.7;font-size:13px;margin-top:8px}
  </style>
</head>
<body>
  <div class="card">
    <img class="logo" src="\${LOGO}" alt="TCS Logo" onerror="this.style.display='none'"/>
    <h1>🔥 TCS Marketplace AI Assistant</h1>
    <div class="tag">Powered by Sauced HTX — “Get Sauced With Us”</div>

    <div class="row">
      <input id="msg" value="show me US-made sauces under $25" />
      <button class="cta" id="send">Test API</button>
      <a class="link" href="/health" target="_blank"><button class="ok">Health</button></a>
    </div>

    <pre id="out">Click “Test API” to see a live response from: \n\${API_URL}</pre>
    <div class="small">Docs: POST \`/api/tcs-assistant\` → { message: string }</div>
  </div>

  <script>
    const out = document.getElementById('out');
    document.getElementById('send').onclick = async () => {
      const message = document.getElementById('msg').value.trim();
      out.textContent = 'Sending…';
      try {
        const res = await fetch('\${API_URL}', {
          method: 'POST',
          headers: {'Content-Type':'application/json'},
          body: JSON.stringify({ message })
        });
        const data = await res.json();
        out.textContent = JSON.stringify(data, null, 2);
      } catch (e) {
        out.textContent = 'Error: ' + e.message;
      }
    };
  </script>
</body>
</html>
  `);
});


const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TCS Assistant running on http://localhost:${PORT}`));



