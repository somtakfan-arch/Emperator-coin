// Рыночные данные: живые цены (Binance WebSocket), стакан, свечи.
// Запасной источник цен — CoinGecko.

export const PAIRS = [
  { symbol: "BTCUSDT", base: "BTC", name: "Bitcoin", glyph: "₿", cg: "bitcoin" },
  { symbol: "ETHUSDT", base: "ETH", name: "Ethereum", glyph: "Ξ", cg: "ethereum" },
  { symbol: "SOLUSDT", base: "SOL", name: "Solana", glyph: "S", cg: "solana" },
  { symbol: "BNBUSDT", base: "BNB", name: "BNB", glyph: "B", cg: "binancecoin" },
  { symbol: "XRPUSDT", base: "XRP", name: "XRP", glyph: "X", cg: "ripple" },
  { symbol: "DOGEUSDT", base: "DOGE", name: "Dogecoin", glyph: "Ð", cg: "dogecoin" },
  { symbol: "TONUSDT", base: "TON", name: "Toncoin", glyph: "T", cg: "the-open-network" },
  { symbol: "ADAUSDT", base: "ADA", name: "Cardano", glyph: "₳", cg: "cardano" },
  { symbol: "AVAXUSDT", base: "AVAX", name: "Avalanche", glyph: "A", cg: "avalanche-2" },
  { symbol: "LINKUSDT", base: "LINK", name: "Chainlink", glyph: "L", cg: "chainlink" },
  { symbol: "DOTUSDT", base: "DOT", name: "Polkadot", glyph: "●", cg: "polkadot" },
  { symbol: "LTCUSDT", base: "LTC", name: "Litecoin", glyph: "Ł", cg: "litecoin" },
  { symbol: "TRXUSDT", base: "TRX", name: "TRON", glyph: "Tr", cg: "tron" },
  { symbol: "SHIBUSDT", base: "SHIB", name: "Shiba Inu", glyph: "Sh", cg: "shiba-inu" },
  { symbol: "PEPEUSDT", base: "PEPE", name: "Pepe", glyph: "P", cg: "pepe" },
  { symbol: "NEARUSDT", base: "NEAR", name: "NEAR", glyph: "N", cg: "near" },
  { symbol: "SUIUSDT", base: "SUI", name: "Sui", glyph: "Su", cg: "sui" },
  { symbol: "APTUSDT", base: "APT", name: "Aptos", glyph: "Ap", cg: "aptos" },
  { symbol: "ARBUSDT", base: "ARB", name: "Arbitrum", glyph: "Ar", cg: "arbitrum" },
  { symbol: "OPUSDT", base: "OP", name: "Optimism", glyph: "OP", cg: "optimism" },
  { symbol: "ATOMUSDT", base: "ATOM", name: "Cosmos", glyph: "⚛", cg: "cosmos" },
  { symbol: "UNIUSDT", base: "UNI", name: "Uniswap", glyph: "U", cg: "uniswap" },
  { symbol: "BCHUSDT", base: "BCH", name: "Bitcoin Cash", glyph: "Ƀ", cg: "bitcoin-cash" },
  { symbol: "XLMUSDT", base: "XLM", name: "Stellar", glyph: "✦", cg: "stellar" },
  { symbol: "WIFUSDT", base: "WIF", name: "dogwifhat", glyph: "W", cg: "dogwifcoin" },
  { symbol: "FILUSDT", base: "FIL", name: "Filecoin", glyph: "F", cg: "filecoin" },
  { symbol: "ICPUSDT", base: "ICP", name: "Internet Computer", glyph: "∞", cg: "internet-computer" },
  { symbol: "HBARUSDT", base: "HBAR", name: "Hedera", glyph: "ħ", cg: "hedera-hashgraph" },
];
export const pairBySymbol = (s) => PAIRS.find((p) => p.symbol === s);
export const pairByBase = (b) => PAIRS.find((p) => p.base === b);

const WS_HOSTS = ["wss://stream.binance.com:9443", "wss://data-stream.binance.vision"];
const REST_HOSTS = ["https://data-api.binance.vision", "https://api.binance.com"];
const STALE_MS = 15000;

// ───────── REST ─────────
async function binanceGet(path) {
  let lastErr;
  for (const host of REST_HOSTS) {
    try {
      const r = await fetch(host + path);
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return await r.json();
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

// Свечи: [{time(сек, локальное время), open, high, low, close, volume}]
const TZ_SHIFT = -new Date().getTimezoneOffset() * 60;
export async function fetchKlines(symbol, interval, { limit = 500, startTime } = {}) {
  const q = new URLSearchParams({ symbol, interval, limit: String(limit) });
  if (startTime) q.set("startTime", String(startTime));
  const rows = await binanceGet(`/api/v3/klines?${q}`);
  return rows.map(parseKline);
}
const parseKline = (k) => ({
  openTime: k[0], time: k[0] / 1000 + TZ_SHIFT,
  open: +k[1], high: +k[2], low: +k[3], close: +k[4], volume: +k[5],
});
export const wsKline = (k) => ({
  openTime: k.t, time: k.t / 1000 + TZ_SHIFT,
  open: +k.o, high: +k.h, low: +k.l, close: +k.c, volume: +k.v,
});

// ───────── WebSocket с переподключением ─────────
// Открывает combined-stream; при обрыве переподключается и перебирает хосты.
export function openStreams(streams, onMessage, onStatus = () => {}) {
  let ws = null, closed = false, attempt = 0, timer = null;
  const connect = () => {
    if (closed) return;
    const host = WS_HOSTS[attempt % WS_HOSTS.length];
    ws = new WebSocket(`${host}/stream?streams=${streams.join("/")}`);
    ws.onopen = () => { attempt = 0; onStatus("open"); };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.data) onMessage(msg.stream, msg.data);
      } catch { /* мусор игнорируем */ }
    };
    ws.onclose = () => {
      onStatus("closed");
      if (closed) return;
      attempt++;
      timer = setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt, 5), 30000));
    };
    ws.onerror = () => ws.close();
  };
  connect();
  return () => { closed = true; clearTimeout(timer); ws?.close(); };
}

// WebSocket с подстраховкой: если сокет молчит timeoutMs — опрашиваем REST,
// пока сокет не оживёт. Нужно, когда WebSocket к Binance заблокирован, а REST — нет.
export function liveStream(streams, onWs, poll, { pollMs = 3000, timeoutMs = 6000 } = {}) {
  let lastWs = 0, pollTimer = null, stopped = false;
  const startPoll = () => {
    if (pollTimer || stopped) return;
    const tick = () => poll().catch(() => {});
    tick();
    pollTimer = setInterval(() => {
      if (Date.now() - lastWs < timeoutMs) { clearInterval(pollTimer); pollTimer = null; return; }
      tick();
    }, pollMs);
  };
  const stopWs = openStreams(streams, (name, d) => { lastWs = Date.now(); onWs(name, d); });
  const watchdog = setInterval(() => { if (Date.now() - lastWs > timeoutMs) startPoll(); }, 1000);
  const first = setTimeout(() => { if (!lastWs) startPoll(); }, timeoutMs);
  return () => { stopped = true; stopWs(); clearInterval(watchdog); clearInterval(pollTimer); clearTimeout(first); };
}

export const fetchDepth = (symbol, limit = 20) => binanceGet(`/api/v3/depth?symbol=${symbol}&limit=${limit}`);

// ───────── тикеры (цены всех пар) ─────────
// tickers[symbol] = { price, open, high, low, change, quoteVolume, ts }
export const tickers = {};
const priceListeners = new Set();
let source = "connecting"; // binance | coingecko | offline | connecting
let started = false;
let lastBinanceMsg = 0;
let cgTimer = null;
let emitQueued = false;

export const getSource = () => source;
export const getPrice = (symbol) => {
  const t = tickers[symbol];
  return t && Date.now() - t.ts < STALE_MS * 4 ? t.price : null;
};

export function onPrices(cb) {
  priceListeners.add(cb);
  if (Object.keys(tickers).length) cb(tickers, source);
  return () => priceListeners.delete(cb);
}
function emit() {
  if (emitQueued) return;
  emitQueued = true;
  setTimeout(() => {
    emitQueued = false;
    priceListeners.forEach((cb) => { try { cb(tickers, source); } catch (e) { console.error(e); } });
  }, 120);
}
function setSource(s) { if (source !== s) { source = s; emit(); } }

function applyTicker(symbol, price, open, high, low, quoteVolume) {
  const change = open ? ((price - open) / open) * 100 : 0;
  const prev = tickers[symbol]?.price;
  tickers[symbol] = { price, open, high, low, change, quoteVolume, prev, ts: Date.now() };
}

export function startPrices() {
  if (started) return;
  started = true;
  lastBinanceMsg = Date.now(); // даём WebSocket время подключиться

  // Живые цены: WebSocket, при его недоступности — опрос REST Binance раз в 3 с.
  liveStream(
    PAIRS.map((p) => `${p.symbol.toLowerCase()}@miniTicker`),
    (_, d) => {
      lastBinanceMsg = Date.now();
      applyTicker(d.s, +d.c, +d.o, +d.h, +d.l, +d.q);
      stopCoinGecko();
      setSource("binance");
      emit();
    },
    async () => {
      const rows = await binanceGet(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(PAIRS.map((p) => p.symbol)))}`);
      lastBinanceMsg = Date.now();
      rows.forEach((r) => applyTicker(r.symbol, +r.lastPrice, +r.openPrice, +r.highPrice, +r.lowPrice, +r.quoteVolume));
      stopCoinGecko();
      setSource("binance");
      emit();
    },
    { pollMs: 3000, timeoutMs: 4000 },
  );

  // Сторож: если Binance недоступен совсем — переключаемся на CoinGecko.
  setInterval(() => {
    if (Date.now() - lastBinanceMsg > STALE_MS && !cgTimer) {
      pollCoinGecko();
      cgTimer = setInterval(pollCoinGecko, 30000);
    }
  }, 5000);
}

function stopCoinGecko() {
  if (cgTimer) { clearInterval(cgTimer); cgTimer = null; }
}

async function pollCoinGecko() {
  try {
    const ids = PAIRS.map((p) => p.cg).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (Date.now() - lastBinanceMsg < STALE_MS) return; // Binance ожил
    PAIRS.forEach((p) => {
      const d = data[p.cg];
      if (!d?.usd) return;
      const change = d.usd_24h_change ?? 0;
      const open = d.usd / (1 + change / 100);
      const old = tickers[p.symbol];
      applyTicker(p.symbol, d.usd, open, old?.high ?? null, old?.low ?? null, old?.quoteVolume ?? null);
    });
    setSource("coingecko");
    emit();
  } catch {
    if (!Object.keys(tickers).length || Date.now() - lastBinanceMsg > STALE_MS * 4) setSource("offline");
  }
}
