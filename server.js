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

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`TCS Assistant running on http://localhost:${PORT}`));
