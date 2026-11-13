// ===================== 工具 =====================
export const avg = a => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
export const num = v => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isNaN(n) ? 0 : n; };
export const pad = n => String(n).padStart(2, '0');
export const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const twNow = () => new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Taipei' }));
export const sleep = ms => new Promise(r => setTimeout(r, ms));
export const r2 = v => Math.round(v * 100) / 100;
export const CODE_RE = /^\d{4,6}[A-Z]?$/;

export function getMarketStatus() {
  const t = twNow(), dow = t.getDay(), m = t.getHours() * 60 + t.getMinutes();
  let desc = '盤後（收盤資料已定）';
  if (dow === 0 || dow === 6) desc = '週末休市';
  else if (m < 540) desc = '盤前（尚未開盤）';
  else if (m < 810) desc = '盤中（訊號以收盤為準，請盤後再確認）';
  else if (m < 930) desc = '盤後整理中（定盤資料約 15:30 後完整）';
  return { today: ymd(t), desc };
}

// ===================== TWSE 資料 =====================
const TWSE_PRICE = 'https://openapi.twse.com.tw/v1/exchangeReport/STOCK_DAY_ALL';
const TWSE_BWIBBU = 'https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL';
const stockDayUrl = (ym, code) => `https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ym}01&stockNo=${code}&response=json`;
const indexUrl = ym => `https://www.twse.com.tw/rwd/zh/TAIEX/MI_5MINS_HIST?date=${ym}01&response=json`;

export const API_NODES = [
  { id: 'twse_direct', name: 'TWSE 直連（多半被 CORS 擋）', buildUrl: u => u },
  { id: 'corsproxy', name: 'CorsProxy', buildUrl: u => `https://corsproxy.io/?${encodeURIComponent(u)}` },
  { id: 'allorigins', name: 'AllOrigins', buildUrl: u => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}` }
];

async function getJson(nodeId, url) {
  const node = API_NODES.find(n => n.id === nodeId) || API_NODES[1];
  const res = await fetch(node.buildUrl(url));
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return JSON.parse(await res.text());
}
const roc = s => { const [y, m, d] = s.split('/'); return `${+y + 1911}-${m}-${d}`; };
const uniq = bars => [...new Map(bars.map(b => [b.date, b])).values()].sort((a, b) => a.date.localeCompare(b.date));
const monthsBack = k => {
  const t = twNow(), out = [];
  for (let i = k - 1; i >= 0; i--) { const d = new Date(t.getFullYear(), t.getMonth() - i, 1); out.push(`${d.getFullYear()}${pad(d.getMonth() + 1)}`); }
  return out;
};

export async function fetchBw(nodeId) {
  const bw = await getJson(nodeId, TWSE_BWIBBU);
  return Object.fromEntries(bw.map(x => [x.Code, x]));
}

export async function fetchPool(nodeId, topN) {
  const px = await getJson(nodeId, TWSE_PRICE);
  return px.filter(x => /^\d{4}$/.test(x.Code) && num(x.ClosingPrice) > 0)
    .sort((a, b) => num(b.TradeValue) - num(a.TradeValue)).slice(0, topN)
    .map(x => ({ code: x.Code, name: x.Name }));
}

export async function fetchIndex(nodeId, onProgress = () => {}) {
  let bars = [];
  for (const ym of monthsBack(5)) {
    onProgress(`加權指數 ${ym}…`);
    const j = await getJson(nodeId, indexUrl(ym));
    bars.push(...(j.data || []).map(r => ({ date: roc(r[0]), v: 0, o: num(r[1]), h: num(r[2]), l: num(r[3]), c: num(r[4]) })));
    await sleep(700);
  }
  bars = uniq(bars.filter(b => b.c > 0));
  if (bars.length < 66) throw new Error('加權指數資料不足');
  return bars;
}

export async function fetchStock(nodeId, code, bw, onProgress = () => {}) {
  let bars = [], name = '';
  for (const ym of monthsBack(7)) {
    onProgress(`${code} ${ym}…`);
    const j = await getJson(nodeId, stockDayUrl(ym, code));
    if (!name && j.title) name = j.title.trim().split(/\s+/)[2] || '';
    bars.push(...(j.data || []).map(r => ({ date: roc(r[0]), v: Math.round(num(r[1]) / 1000), o: num(r[3]), h: num(r[4]), l: num(r[5]), c: num(r[6]) })));
    await sleep(650);
  }
  bars = uniq(bars.filter(b => b.c > 0));
  if (!bars.length) throw new Error(`查無 ${code} 的資料`);
  const b = bw[code], price = bars[bars.length - 1].c;
  const pe = b ? num(b.PEratio) : 0;
  return {
    code, name: name || code, industry: '上市', pe, yield: b ? num(b.DividendYield) : 0,
    // 本益比為正近似「近四季 EPS 為正」；不在本益比表內（如 ETF）視為未知
    eps: b ? (pe > 0 ? price / pe : -1) : null,
    hist: bars
  };
}

// ===================== 示範資料（隨機漫步，僅供看介面） =====================
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function makeDemoHist(seed, price, change, volume, vma20, n = 150) {
  const r = rng(parseInt(seed) || 7), drift = (r() - 0.4) * 0.004, w = [1];
  for (let i = 1; i < n - 1; i++) w.push(w[i - 1] * (1 + drift + (r() - 0.5) * 0.03));
  const k = (price - change) / w[n - 2], closes = w.map(x => x * k).concat(price);
  const dates = [], d = twNow();
  while (dates.length < n) { if (d.getDay() % 6 !== 0) dates.unshift(ymd(d)); d.setDate(d.getDate() - 1); }
  return closes.map((c, i) => {
    const last = i === n - 1, p = i ? closes[i - 1] : c;
    return { date: dates[i], o: p, c, h: Math.max(c, p) * (1 + (last ? 0.004 : r() * 0.012)), l: Math.min(c, p) * (1 - (last ? 0.004 : r() * 0.012)), v: last ? volume : Math.round(vma20 * (0.6 + r() * 0.8)) };
  });
}
export const DEMO = [
  ['2330', '台積電', 2380, 45, 52000, 38000, 28.8, 1.40, 82.8], ['2454', '聯發科', 1910, 40, 12100, 8800, 21.5, 3.55, 88.7],
  ['2317', '鴻海', 252, 6, 78000, 71000, 16.6, 2.58, 15.1], ['2382', '廣達', 395, 15, 31000, 21000, 19.3, 2.78, 20.4],
  ['6669', '緯穎', 3320, 95, 2650, 1750, 25.1, 1.80, 132.2], ['3661', '世芯-KY', 3720, -20, 2200, 2350, 45.6, 0.71, 81.4],
  ['2603', '長榮', 242, 4.5, 41000, 26000, 6.9, 5.05, 35.3], ['3231', '緯創', 146.5, 3.5, 56000, 41000, 17.1, 2.08, 8.52],
  ['3017', '奇鋐', 845, 30, 9600, 6200, 32.5, 1.21, 26.0], ['2881', '富邦金', 101, 1.5, 34500, 30000, 10.4, 3.46, 9.66]
].map(([code, name, price, change, volume, vma20, pe, y, eps]) => ({ code, name, industry: '示範', pe, yield: y, eps, hist: makeDemoHist(code, price, change, volume, vma20) }));

// ===================== 指標引擎 =====================
export function analyze(s) {
  const h = s.hist;
  if (!h || h.length < 121) return { ok: false };
  const n = h.length, c = h.map(x => x.c), last = h[n - 1], prev = h[n - 2];
  const ma = k => avg(c.slice(n - k));
  const hi20 = Math.max(...h.slice(n - 21, n - 1).map(x => x.h));
  const hi60 = Math.max(...h.slice(n - 61, n - 1).map(x => x.h));
  const vol5 = avg(h.slice(n - 6, n - 1).map(x => x.v));
  const volRatio = vol5 > 0 ? r2(last.v / vol5) : 0;
  const trs = h.slice(n - 14).map((x, i) => { const pc = h[n - 14 + i - 1].c; return Math.max(x.h - x.l, Math.abs(x.h - pc), Math.abs(x.l - pc)); });
  const change = r2(last.c - prev.c), ma20 = ma(20), ma60 = ma(60), ma120 = ma(120);
  return {
    ok: true, price: last.c, low: last.l, change, returnRate: r2(change / prev.c * 100), volume: last.v, date: last.date,
    ma10: ma(10), ma20, ma60, ma120, hi20, hi60, volRatio, atr: avg(trs), ret60: c[n - 1] / c[n - 61] - 1,
    aligned: ma20 > ma60 && ma60 > ma120, breakout: last.c > hi20, breakout60: last.c > hi60, volOk: volRatio >= 1.5
  };
}

export const fundStatus = s => {
  const ok = (s.eps == null || s.eps > 0) && (s.yoy == null || s.yoy >= 0) && (s.inst == null || s.inst > 0);
  return { ok, known: s.yoy != null && s.inst != null };
};

export function marketGate(indexHist, stocks) {
  const c = indexHist.map(b => b.c), n = c.length;
  const chg = s => (s.hist?.length > 1 ? s.hist[s.hist.length - 1].c - s.hist[s.hist.length - 2].c : 0);
  const up = stocks.filter(s => chg(s) > 0).length, down = stocks.filter(s => chg(s) < 0).length;
  if (n < 66) return { pass: false, above: false, rising: false, breadth: up > down, up, down, ma60: 0, close: 0 };
  const ma60 = avg(c.slice(n - 60)), prev = avg(c.slice(n - 65, n - 5));
  const above = c[n - 1] > ma60, rising = ma60 > prev, breadth = up > down;
  return { pass: above && rising && breadth, above, rising, breadth, up, down, ma60, close: c[n - 1] };
}

export function rankStocks(stocks, weights, params, gateOpen) {
  const base = stocks.map(s => ({ ...s, ...analyze(s) }));
  const ok = base.filter(s => s.ok);
  const byRet = [...ok].sort((a, b) => a.ret60 - b.ret60);
  const W = weights, tw = Object.values(W).reduce((a, b) => a + b, 0) || 1;
  const rows = ok.map(a => {
    const fund = fundStatus(a);
    const rs = byRet.findIndex(x => x.code === a.code) / Math.max(1, byRet.length - 1);
    const comp = {
      trend: a.aligned ? 1 : Math.min(0.7, (a.ma20 > a.ma60 ? 0.5 : 0) + (a.price > a.ma20 ? 0.2 : 0)),
      breakout: a.breakout ? 1 : Math.max(0, 1 - (a.hi20 - a.price) / a.hi20 * 10),
      volume: Math.min(1, a.volRatio / 1.5), rs,
      chip: ((a.inst == null ? 0.5 : a.inst > 0 ? 1 : 0) + (a.yoy == null ? 0.5 : a.yoy >= 0 ? 1 : 0)) / 2
    };
    const score = r2(Object.keys(W).reduce((s, k) => s + W[k] * comp[k], 0) / tw * 100);
    let signal = 'NONE';
    if (a.aligned && a.breakout && a.volOk && fund.ok) signal = gateOpen ? 'BUY' : 'LOCKED';
    else if (a.aligned && a.price >= a.hi20 * 0.97) signal = 'WATCH';
    const stop = Math.max(a.low, a.price * (1 - params.maxLoss / 100));
    const riskAmt = params.capital * params.riskPct / 100;
    let shares = Math.floor(riskAmt / Math.max(a.atr, a.price - stop));
    shares = Math.max(0, Math.min(shares, Math.floor(params.capital * params.maxPos / 100 / a.price)));
    return { ...a, fund, score, signal, stop, shares, first: Math.floor(shares * 0.3), riskAmt };
  });
  return { ranked: rows.sort((a, b) => b.score - a.score), skipped: base.length - ok.length };
}
