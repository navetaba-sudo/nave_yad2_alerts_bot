import * as cheerio from 'cheerio';
import fs from 'fs';

const SEARCH_URL = process.env.YAD2_URL;
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
const SEEN_FILE = './seen.json';

async function fetchListings() {
  const res = await fetch(SEARCH_URL, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
      'Accept-Language': 'he-IL,he;q=0.9,en;q=0.8',
    },
  });

  if (!res.ok) {
    throw new Error(`Yad2 responded with status ${res.status}`);
  }

  const html = await res.text();
  const $ = cheerio.load(html);

  const listings = new Map();

  $('a[href*="/realestate/item/"]').each((_, el) => {
    const href = $(el).attr('href');
    if (!href) return;

    const match = href.match(/\/realestate\/item\/[^/]+\/([a-zA-Z0-9]+)/);
    if (!match) return;

    const id = match[1];
    if (listings.has(id)) return;

    const text = $(el).text().replace(/\s+/g, ' ').trim();
    const priceMatch = text.match(/₪\s*([\d,]+)/);
    const cleanHref = href.split('?')[0];
    const link = cleanHref.startsWith('http')
      ? cleanHref
      : `https://www.yad2.co.il${cleanHref}`;

    listings.set(id, {
      id,
      text: text || 'מודעה ללא כותרת',
      price: priceMatch ? priceMatch[1] : null,
      link,
    });
  });

  return [...listings.values()];
}

async function sendTelegram(message) {
  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: CHAT_ID,
      text: message,
      disable_web_page_preview: false,
    }),
  });

  if (!res.ok) {
    console.error('Telegram send failed:', await res.text());
  }
}

function loadSeen() {
  try {
    const raw = fs.readFileSync(SEEN_FILE, 'utf-8');
    return new Set(JSON.parse(raw));
  } catch {
    return null;
  }
}

function saveSeen(idSet) {
  fs.writeFileSync(SEEN_FILE, JSON.stringify([...idSet], null, 2));
}

async function main() {
  if (!SEARCH_URL || !BOT_TOKEN || !CHAT_ID) {
    throw new Error(
      'Missing one of the required env vars: YAD2_URL, TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID'
    );
  }

  const listings = await fetchListings();
  console.log(`Found ${listings.length} listings on the page right now`);

  const seen = loadSeen();
  const currentIds = new Set(listings.map((l) => l.id));

  if (seen === null) {
    saveSeen(currentIds);
    console.log('First run: baseline saved, no notifications sent.');
    return;
  }

  const newOnes = listings.filter((l) => !seen.has(l.id));

  for (const item of newOnes) {
    const priceLine = item.price ? `💰 ${item.price} ₪\n` : '';
    const message = `🏠 מודעה חדשה ביד2!\n${priceLine}${item.text}\n${item.link}`;
    await sendTelegram(message);
    console.log('Notified about new listing:', item.id);
  }

  if (newOnes.length === 0) {
    console.log('No new listings this run.');
  }

  const merged = new Set([...seen, ...currentIds]);
  saveSeen(merged);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
