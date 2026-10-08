// Рыночные данные: живые цены (Binance WebSocket), стакан, свечи.
// Запасной источник цен — CoinGecko. Акции — токенизированные (Ondo / xStocks) с биржи Gate.

const CRYPTO = [
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

// Акции: цена токена 1:1 повторяет настоящую акцию. gate — пара на Gate, ticker — биржевой тикер.
const S = (base, name, gate, ticker = base) => ({ symbol: `${base}USDT`, base, name, ticker, glyph: ticker.slice(0, 2), gate, cg: STOCK_CG[base], stock: true });
// Запасной источник для акций — CoinGecko (Ondo-токены тех же акций).
const STOCK_CG = {
  AAPL: "apple-ondo-tokenized-stock",
  MSFT: "microsoft-ondo-tokenized-stock",
  NVDA: "nvidia-ondo-tokenized-stock",
  TSLA: "tesla-ondo-tokenized-stock",
  AMZN: "amazon-ondo-tokenized-stock",
  GOOGL: "alphabet-class-a-ondo-tokenized-stock",
  META: "meta-platforms-ondo-tokenized-stock",
  NFLX: "netflix-ondo-tokenized-stock",
  AMD: "amd-ondo-tokenized-stock",
  PLTR: "palantir-technologies-ondo-tokenized-stock",
  ORCL: "oracle-ondo-tokenized-stock",
  AVGO: "broadcom-ondo-tokenized-stock",
  INTC: "intel-ondo-tokenized-stock",
  CSCO: "cisco-systems-ondo-tokenized-stock",
  COIN: "coinbase-ondo-tokenized-stock",
  HOOD: "robinhood-markets-ondo-tokenized-stock",
  MSTR: "microstrategy-ondo-tokenized-stock",
  CRCL: "circle-internet-group-ondo-tokenized-stock",
  JPM: "jpmorgan-chase-ondo-tokenized-stock",
  VISA: "visa-ondo-tokenized-stock",
  MA: "mastercard-ondo-tokenized-stock",
  WMT: "walmart-ondo-tokenized-stock",
  KO: "coca-cola-ondo-tokenized-stock",
  PEP: "pepsico-ondo-tokenized-stock",
  MCD: "mcdonald-s-ondo-tokenized-stock",
  XOM: "exxon-mobil-ondo-tokenized-stocks",
  LLY: "eli-lilly-ondo-tokenized-stock",
  UNH: "unitedhealth-ondo-tokenized-stock",
  BABA: "alibaba-ondo-tokenized-stock",
  SPY: "spdr-s-p-500-etf-ondo-tokenized-etf",
  QQQ: "invesco-qqq-etf-ondo-tokenized-etf",
  GLD: "spdr-gold-shares-ondo-tokenized",
};
const STOCKS = [
  S("AAPL", "Apple", "AAPLON_USDT"), S("MSFT", "Microsoft", "MSFTON_USDT"), S("NVDA", "NVIDIA", "NVDAON_USDT"),
  S("TSLA", "Tesla", "TSLAON_USDT"), S("AMZN", "Amazon", "AMZNON_USDT"), S("GOOGL", "Alphabet (Google)", "GOOGLON_USDT"),
  S("META", "Meta (Facebook)", "METAON_USDT"), S("NFLX", "Netflix", "NFLXON_USDT"), S("AMD", "AMD", "AMDON_USDT"),
  S("PLTR", "Palantir", "PLTRON_USDT"), S("ORCL", "Oracle", "ORCLG_USDT"), S("AVGO", "Broadcom", "AVGOON_USDT"),
  S("INTC", "Intel", "INTCG_USDT"), S("CSCO", "Cisco", "CSCOON_USDT"), S("COIN", "Coinbase", "COINON_USDT"),
  S("HOOD", "Robinhood", "HOODON_USDT"), S("MSTR", "MicroStrategy", "MSTRON_USDT"), S("CRCL", "Circle", "CRCLON_USDT"),
  S("JPM", "JPMorgan", "JPMON_USDT"), S("VISA", "Visa", "VG_USDT", "V"), S("MA", "Mastercard", "MAON_USDT"),
  S("WMT", "Walmart", "WMTG_USDT"), S("KO", "Coca-Cola", "KOON_USDT"), S("PEP", "PepsiCo", "PEPON_USDT"),
  S("MCD", "McDonald's", "MCDON_USDT"), S("XOM", "Exxon Mobil", "XOMG_USDT"), S("LLY", "Eli Lilly", "LLYON_USDT"),
  S("UNH", "UnitedHealth", "UNHON_USDT"), S("BABA", "Alibaba", "BABAON_USDT"),
  S("SPY", "S&P 500 (фонд)", "SPYON_USDT"), S("QQQ", "Nasdaq 100 (фонд)", "QQQON_USDT"), S("GLD", "Золото (фонд)", "GLDX_USDT"),
];

export const PAIRS = [...CRYPTO, ...STOCKS];
export const isStock = (symbol) => !!pairBySymbol(symbol)?.stock;
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
  if (isStock(symbol)) {
    const p = pairBySymbol(symbol);
    try { return await gateKlines(p.gate, interval, { limit, startTime }); }
    catch { return cgOhlc(p.cg, interval, startTime); }
  }
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

// Мини-графики за 7 дней (4-часовые свечи), кэш на 10 минут.
const sparkCache = new Map();
export async function fetchSpark(symbol) {
  const c = sparkCache.get(symbol);
  if (c && Date.now() - c.t < 600e3) return c.data;
  const data = (await fetchKlines(symbol, "4h", { limit: 42 })).map((k) => k.close);
  sparkCache.set(symbol, { t: Date.now(), data });
  return data;
}

// Последние сделки на бирже (лента).
export const fetchTrades = async (symbol, limit = 30) => isStock(symbol)
  ? (await gateGet(`/spot/trades?currency_pair=${pairBySymbol(symbol).gate}&limit=${limit}`)).map((t) => ({ price: +t.price, qty: +t.amount, time: +t.create_time_ms, buyerMaker: t.side === "sell" }))
  : (await binanceGet(`/api/v3/trades?symbol=${symbol}&limit=${limit}`)).map((t) => ({ price: +t.price, qty: +t.qty, time: t.time, buyerMaker: t.isBuyerMaker }));

// Индекс страха и жадности (alternative.me), кэш на час.
let fng = null;
export async function fetchFearGreed() {
  if (fng && Date.now() - fng.t < 3600e3) return fng.data;
  const r = await fetch("https://api.alternative.me/fng/?limit=8");
  const j = await r.json();
  const data = j.data.map((d) => ({ value: +d.value, label: d.value_classification }));
  fng = { t: Date.now(), data };
  return data;
}

export const fetchDepth = (symbol, limit = 20) => isStock(symbol)
  ? gateGet(`/spot/order_book?currency_pair=${pairBySymbol(symbol).gate}&limit=${limit}`)
  : binanceGet(`/api/v3/depth?symbol=${symbol}&limit=${limit}`);

// ───────── Gate (акции) ─────────
const GATE = "https://api.gateio.ws/api/v4";
async function gateGet(path) {
  const r = await fetch(GATE + path);
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}
const GATE_TF = { "1m": "1m", "5m": "5m", "15m": "15m", "1h": "1h", "4h": "4h", "1d": "1d", "1w": "7d" };
const GATE_SEC = { "1m": 60, "5m": 300, "15m": 900, "1h": 3600, "4h": 14400, "1d": 86400, "7d": 604800 };
async function gateKlines(pair, interval, { limit = 500, startTime } = {}) {
  const iv = GATE_TF[interval] || interval;
  const q = new URLSearchParams({ currency_pair: pair, interval: iv });
  if (startTime) {
    q.set("from", String(Math.floor(startTime / 1000)));
    q.set("to", String(Math.min(Math.floor(Date.now() / 1000), Math.floor(startTime / 1000) + GATE_SEC[iv] * Math.min(limit, 999))));
  } else q.set("limit", String(Math.min(limit, 1000)));
  // [t(сек), объём в USDT, close, high, low, open, объём, закрыта]
  const rows = await gateGet(`/spot/candlesticks?${q}`);
  return rows.map((k) => ({ openTime: +k[0] * 1000, time: +k[0] + TZ_SHIFT, open: +k[5], high: +k[3], low: +k[4], close: +k[2], volume: +k[6] }));
}

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
  // у акций сделки реже — цена считается актуальной дольше
  return t && Date.now() - t.ts < (t.stock ? 900e3 : STALE_MS * 4) ? t.price : null;
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

function applyTicker(symbol, price, open, high, low, quoteVolume, stock = false) {
  if (!(price > 0)) return;
  const change = open ? ((price - open) / open) * 100 : 0;
  const prev = tickers[symbol]?.price;
  tickers[symbol] = { price, open, high, low, change, quoteVolume, prev, stock, ts: Date.now() };
}

export function startPrices() {
  if (started) return;
  started = true;
  lastBinanceMsg = Date.now(); // даём WebSocket время подключиться

  // Живые цены: WebSocket, при его недоступности — опрос REST Binance раз в 3 с.
  liveStream(
    CRYPTO.map((p) => `${p.symbol.toLowerCase()}@miniTicker`),
    (_, d) => {
      lastBinanceMsg = Date.now();
      applyTicker(d.s, +d.c, +d.o, +d.h, +d.l, +d.q);
      stopCoinGecko();
      setSource("binance");
      emit();
    },
    async () => {
      const rows = await binanceGet(`/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(CRYPTO.map((p) => p.symbol)))}`);
      lastBinanceMsg = Date.now();
      rows.forEach((r) => applyTicker(r.symbol, +r.lastPrice, +r.openPrice, +r.highPrice, +r.lowPrice, +r.quoteVolume));
      stopCoinGecko();
      setSource("binance");
      emit();
    },
    { pollMs: 3000, timeoutMs: 4000 },
  );

  startStocks();

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
    const ids = CRYPTO.map((p) => p.cg).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (Date.now() - lastBinanceMsg < STALE_MS) return; // Binance ожил
    CRYPTO.forEach((p) => {
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

// ───────── акции: WebSocket Gate → REST Gate → CoinGecko ─────────
let lastGateOk = 0, lastCgOk = 0;
// Откуда сейчас цены акций: gate | coingecko | offline | connecting
export function getStockSource() {
  if (Date.now() - lastGateOk < 90e3) return "gate";
  if (Date.now() - lastCgOk < 120e3) return "coingecko";
  return lastGateOk || lastCgOk ? "offline" : "connecting";
}
const gateTick = (r) => {
  const p = STOCKS.find((x) => x.gate === r.currency_pair);
  if (!p) return;
  const last = +r.last, ch = +r.change_percentage || 0;
  lastGateOk = Date.now();
  applyTicker(p.symbol, last, last / (1 + ch / 100), +r.high_24h || null, +r.low_24h || null, +r.quote_volume || null, true);
};
async function pollStocksCoinGecko() {
  try {
    const ids = STOCKS.map((p) => p.cg).join(",");
    const r = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const data = await r.json();
    if (Date.now() - lastGateOk < 60e3) return; // Gate ожил — его цены точнее
    for (const p of STOCKS) {
      const d = data[p.cg];
      if (!d?.usd) continue;
      const ch = d.usd_24h_change ?? 0, old = tickers[p.symbol];
      applyTicker(p.symbol, d.usd, d.usd / (1 + ch / 100), old?.high ?? null, old?.low ?? null, d.usd_24h_vol ?? old?.quoteVolume ?? null, true);
    }
    lastCgOk = Date.now();
    emit();
  } catch { /* нет связи */ }
}
function startStocks() {
  const ids = STOCKS.map((p) => p.gate);
  let ws = null, ping = null, attempt = 0;
  const connect = () => {
    try { ws = new WebSocket("wss://api.gateio.ws/ws/v4/"); } catch { return; }
    ws.onopen = () => {
      attempt = 0;
      ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), channel: "spot.tickers", event: "subscribe", payload: ids }));
      ping = setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ time: Math.floor(Date.now() / 1000), channel: "spot.ping" })), 20000);
    };
    ws.onmessage = (e) => {
      try {
        const m = JSON.parse(e.data);
        if (m.channel === "spot.tickers" && m.event === "update" && m.result) { gateTick(m.result); emit(); }
      } catch { /* ignore */ }
    };
    ws.onclose = () => { clearInterval(ping); attempt++; setTimeout(connect, Math.min(1000 * 2 ** Math.min(attempt, 5), 60000)); };
    ws.onerror = () => ws.close();
  };
  connect();

  // REST Gate: сначала проверяем одну пару; если Gate недоступен — не долбим его 32 запросами.
  let lastPoll = 0, gateDown = false;
  const pollGate = async () => {
    lastPoll = Date.now();
    try {
      const [first] = await gateGet(`/spot/tickers?currency_pair=${ids[0]}`);
      if (first) gateTick(first);
      gateDown = false;
    } catch { gateDown = true; return; }
    for (let i = 1; i < ids.length; i += 4) { // по 4 запроса за раз
      await Promise.all(ids.slice(i, i + 4).map(async (id) => {
        try { const [r] = await gateGet(`/spot/tickers?currency_pair=${id}`); if (r) gateTick(r); } catch { /* сеть */ }
      }));
    }
    emit();
  };
  pollGate().finally(() => { if (Date.now() - lastGateOk > 5000) pollStocksCoinGecko(); });
  let lastCg = Date.now();
  setInterval(() => {
    const wsAlive = Date.now() - lastGateOk < 30e3;
    if (Date.now() - lastPoll > (gateDown ? 120e3 : wsAlive ? 60e3 : 15e3)) pollGate();
    // Gate молчит больше 20 с — берём цены с CoinGecko раз в 30 с
    if (Date.now() - lastGateOk > 20e3 && Date.now() - lastCg > 30e3) { lastCg = Date.now(); pollStocksCoinGecko(); }
  }, 5000);
}

// Свечи акций с CoinGecko (если Gate недоступен). Кэш на минуту.
const ohlcCache = new Map();
async function cgOhlc(id, interval, startTime) {
  const days = startTime ? Math.min(365, Math.max(1, Math.ceil((Date.now() - startTime) / 86400e3) + 1))
    : { "1m": 1, "5m": 1, "15m": 1, "1h": 7, "4h": 30, "1d": 180, "1w": 365 }[interval] || 7;
  const key = `${id}:${days}`;
  const c = ohlcCache.get(key);
  let rows = c && Date.now() - c.t < 60e3 ? c.rows : null;
  if (!rows) {
    const r = await fetch(`https://api.coingecko.com/api/v3/coins/${id}/ohlc?vs_currency=usd&days=${days}`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    rows = await r.json();
    ohlcCache.set(key, { t: Date.now(), rows });
  }
  return rows.filter((k) => !startTime || k[0] >= startTime)
    .map((k) => ({ openTime: k[0], time: k[0] / 1000 + TZ_SHIFT, open: k[1], high: k[2], low: k[3], close: k[4], volume: 0 }));
}

// Для акций нет живого потока Binance — только опрос REST.
export function pollStream(poll, ms = 3000) {
  let stopped = false;
  const tick = () => poll().catch(() => {});
  tick();
  const t = setInterval(() => !stopped && tick(), ms);
  return () => { stopped = true; clearInterval(t); };
}
// Универсально: крипта — WebSocket Binance с подстраховкой, акции — опрос Gate.
export function pairStream(symbol, streams, onWs, poll, opts = {}) {
  return isStock(symbol) ? pollStream(poll, opts.pollMs || 3000) : liveStream(streams, onWs, poll, opts);
}

// Биржа США (NYSE/Nasdaq): пн–пт 9:30–16:00 по Нью-Йорку.
export function usMarketOpen(t = new Date()) {
  const ny = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", weekday: "short", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(t);
  const get = (k) => ny.find((x) => x.type === k)?.value;
  const wd = get("weekday"), mins = (+get("hour") % 24) * 60 + +get("minute");
  return !["Sat", "Sun"].includes(wd) && mins >= 570 && mins < 960;
}

// Часы работы биржи США в местном времени пользователя (учитывает летнее/зимнее время).
export function usMarketHoursLocal(t = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", hour12: false }).formatToParts(t);
  const g = (k) => +parts.find((x) => x.type === k).value;
  const nyAsUtc = Date.UTC(g("year"), g("month") - 1, g("day"), g("hour") % 24, g("minute"));
  const offset = Math.round((nyAsUtc - t.getTime()) / 900e3) * 900e3; // NY − UTC
  const at = (h, m) => new Date(Date.UTC(g("year"), g("month") - 1, g("day"), h, m) - offset).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return `с ${at(9, 30)} до ${at(16, 0)}`;
}
