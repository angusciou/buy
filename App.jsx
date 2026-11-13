import React, { useState, useEffect, useMemo } from 'react';
import {
  Search, Filter, Download, RefreshCw, Sliders, ShieldCheck, ShieldAlert, Award, Activity, Calendar, Clock,
  Check, X, Info, Lock, Target, Calculator, Database, Star, Plus, Trash2, Smartphone, HardDrive
} from 'lucide-react';
import {
  API_NODES, CODE_RE, DEMO, num, r2, getMarketStatus, fetchBw, fetchPool, fetchIndex, fetchStock,
  makeDemoHist, marketGate, rankStocks
} from './lib';

const LS = 'tw-screener-v1', CACHE = 'tw-screener-cache-v1';
const readLS = k => { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } };
const writeLS = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* 容量不足時略過 */ } };
const DEF_PARAMS = { capital: 1000000, riskPct: 1, maxLoss: 8, maxPos: 25 };
const DEF_WEIGHTS = { trend: 25, breakout: 25, volume: 20, rs: 20, chip: 10 };

export default function App() {
  const saved = useMemo(() => readLS(LS), []);
  const [stocks, setStocks] = useState([]);
  const [indexHist, setIndexHist] = useState([]);
  const [mode, setMode] = useState('DEMO');
  const [tab, setTab] = useState('ranking');
  const [selected, setSelected] = useState('');
  const [search, setSearch] = useState('');
  const [flt, setFlt] = useState({ buy: false, aligned: false, breakout: false, vol: false });
  const [params, setParams] = useState({ ...DEF_PARAMS, ...saved.params });
  const [weights, setWeights] = useState({ ...DEF_WEIGHTS, ...saved.weights });
  const [nodeId, setNodeId] = useState(saved.nodeId || 'corsproxy');
  const [topN, setTopN] = useState(saved.topN || 12);
  const [watch, setWatch] = useState(saved.watch || []);
  const [fund, setFund] = useState(saved.fund || {});
  const [unlock, setUnlock] = useState(false);
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState('');
  const [addCode, setAddCode] = useState('');
  const [importText, setImportText] = useState('');
  const [updatedAt, setUpdatedAt] = useState('');
  const [installEvt, setInstallEvt] = useState(null);
  const market = useMemo(getMarketStatus, [updatedAt]);
  const watchSet = useMemo(() => new Set(watch.map(w => w.code)), [watch]);
  const standalone = typeof window !== 'undefined' && (window.matchMedia('(display-mode: standalone)').matches || navigator.standalone);

  // ---------- 啟動：讀快取，沒有就用示範資料 ----------
  useEffect(() => {
    const c = readLS(CACHE);
    if (c.stocks?.length && c.indexHist?.length) {
      setStocks(c.stocks); setIndexHist(c.indexHist); setMode('LIVE'); setUpdatedAt(c.at || '');
    } else {
      setStocks(DEMO); setIndexHist(makeDemoHist('8888', 22000, 120, 0, 0)); setMode('DEMO');
    }
    const h = e => { e.preventDefault(); setInstallEvt(e); };
    window.addEventListener('beforeinstallprompt', h);
    return () => window.removeEventListener('beforeinstallprompt', h);
  }, []);

  useEffect(() => { writeLS(LS, { params, weights, nodeId, topN, watch, fund }); }, [params, weights, nodeId, topN, watch, fund]);
  useEffect(() => { if (mode === 'LIVE') writeLS(CACHE, { stocks, indexHist, at: updatedAt }); }, [stocks, indexHist, mode, updatedAt]);

  const exportBackup = () => {
    const blob = new Blob([JSON.stringify({ v: 1, params, weights, nodeId, topN, watch, fund }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = `台股選股備份_${market.today}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };
  const importBackup = async e => {
    const f = e.target.files?.[0]; if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      if (d.params) setParams(p => ({ ...p, ...d.params }));
      if (d.weights) setWeights(p => ({ ...p, ...d.weights }));
      if (d.nodeId) setNodeId(d.nodeId);
      if (d.topN) setTopN(d.topN);
      if (Array.isArray(d.watch)) setWatch(d.watch.filter(w => CODE_RE.test(w.code)));
      if (d.fund && typeof d.fund === 'object') setFund(d.fund);
      setNotice('✅ 已匯入備份。監控個股請按「同步真實資料」載入 K 線。');
    } catch { setNotice('⚠️ 備份檔格式不正確。'); }
    e.target.value = '';
  };

  // ---------- 安裝 ----------
  const install = async () => {
    if (installEvt) { installEvt.prompt(); await installEvt.userChoice; setInstallEvt(null); return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setNotice(ios ? '請用 Safari：點「分享」→「加入主畫面」。' : '請從瀏覽器選單選擇「安裝應用程式」或「加入主畫面」。');
  };

  // ---------- 資料 ----------
  const syncAll = async () => {
    setBusy('sync'); setNotice(null);
    const say = t => setNotice(`⏳ ${t}`);
    try {
      say('抓取全市場排行與本益比…');
      const [pool, bw] = await Promise.all([fetchPool(nodeId, topN), fetchBw(nodeId)]);
      const idx = await fetchIndex(nodeId, say);
      const targets = new Map(pool.map(p => [p.code, { ...p, pool: true }]));
      watch.forEach(w => targets.has(w.code) || targets.set(w.code, { code: w.code, name: w.name, pool: false }));
      const list = []; let fail = 0, i = 0;
      for (const t of targets.values()) {
        say(`K 線 ${++i}/${targets.size}：${t.code} ${t.name || ''}`);
        try { list.push({ ...(await fetchStock(nodeId, t.code, bw)), pool: t.pool }); } catch { fail++; }
      }
      if (!list.length) throw new Error('沒有成功載入任何個股');
      setStocks(list); setIndexHist(idx); setMode('LIVE'); setUpdatedAt(new Date().toLocaleString('zh-TW', { hour12: false }));
      setNotice(`✅ 已載入 ${list.length} 檔與加權指數${fail ? `（${fail} 檔失敗）` : ''}。`);
    } catch (e) { setNotice(`⚠️ 同步失敗：${e.message}。可換一個中繼節點再試；目前資料維持不變。`); }
    setBusy('');
  };

  const addWatch = async (raw, silent) => {
    const code = String(raw).trim().toUpperCase();
    if (!CODE_RE.test(code)) { setNotice('⚠️ 代號格式不正確（例：2330、0050、00878）。'); return; }
    if (watchSet.has(code)) { setNotice(`${code} 已在監控清單。`); return; }
    let name = stocks.find(s => s.code === code)?.name || '';
    setBusy(code);
    try {
      if (mode === 'DEMO' || !stocks.some(s => s.code === code)) {
        const bw = await fetchBw(nodeId);
        const st = await fetchStock(nodeId, code, bw, t => setNotice(`⏳ ${t}`));
        name = st.name;
        if (mode === 'DEMO') { setIndexHist(await fetchIndex(nodeId, t => setNotice(`⏳ ${t}`))); setStocks([{ ...st, pool: false }]); setMode('LIVE'); }
        else setStocks(p => [...p.filter(s => s.code !== code), { ...st, pool: false }]);
        setUpdatedAt(new Date().toLocaleString('zh-TW', { hour12: false }));
      }
      const item = { code, name, note: '' };
      setWatch(p => [...p, item]);
      if (!silent) setNotice(`✅ 已加入監控：${code} ${name}`);
      setAddCode('');
    } catch (e) { setNotice(`⚠️ 加入失敗：${e.message}`); }
    setBusy('');
  };

  const removeWatch = code => {
    setWatch(p => p.filter(w => w.code !== code));
    setStocks(p => p.filter(s => s.code !== code || s.pool || s.industry === '示範'));
  };
  const saveNote = (code, note) => {
    setWatch(p => p.map(w => (w.code === code ? { ...w, note } : w)));
  };
  const setFundVal = (code, key, val) => {
    const next = { ...(fund[code] || { inst: null, yoy: null }), [key]: val === '' ? null : num(val) };
    setFund(p => ({ ...p, [code]: next }));
  };
  const toggleWatch = (e, code) => { e.stopPropagation(); watchSet.has(code) ? removeWatch(code) : addWatch(code, true); };

  const importPaste = () => {
    const upd = {};
    importText.trim().split('\n').forEach(line => {
      const cols = line.split(/[,\t\s]+/).filter(Boolean), ci = cols.findIndex(c => /^\d{4,6}$/.test(c));
      if (ci < 0) return;
      const ns = cols.filter((_, i) => i !== ci).filter(c => /^-?[\d,]+(\.\d+)?$/.test(c)).map(num);
      if (ns.length) upd[cols[ci]] = ns;
    });
    let hit = 0;
    setStocks(prev => prev.map(s => {
      const u = upd[s.code]; if (!u || !s.hist?.length) return s;
      hit++;
      const hist = s.hist.slice(), n = hist.length, price = u[0], v = u.length > 2 ? u[2] : hist[n - 1].v;
      hist[n - 1] = { ...hist[n - 1], c: price, h: Math.max(hist[n - 1].h, price), l: Math.min(hist[n - 1].l, price), v };
      if (u.length > 1 && n > 1) hist[n - 2] = { ...hist[n - 2], c: price - u[1] };
      return { ...s, hist };
    }));
    setNotice(hit ? `✅ 已更新 ${hit} 檔最新報價。` : '⚠️ 沒有符合的個股。格式：2330 台積電 2380 45 52000（代號 名稱 現價 漲跌 張數）');
    if (hit) setImportText('');
  };

  // ---------- 計算 ----------
  const stocksF = useMemo(() => stocks.map(s => ({ ...s, inst: fund[s.code]?.inst ?? null, yoy: fund[s.code]?.yoy ?? null })), [stocks, fund]);
  const gate = useMemo(() => marketGate(indexHist, stocksF), [indexHist, stocksF]);
  const gateOpen = gate.pass || unlock;
  const { ranked, skipped } = useMemo(() => rankStocks(stocksF, weights, params, gateOpen), [stocksF, weights, params, gateOpen]);
  const list = useMemo(() => ranked.filter(s => {
    if (!(s.code.includes(search) || s.name.includes(search))) return false;
    return !((flt.buy && s.signal !== 'BUY') || (flt.aligned && !s.aligned) || (flt.breakout && !s.breakout) || (flt.vol && !s.volOk));
  }), [ranked, search, flt]);
  const watchRows = useMemo(() => ranked.filter(s => watchSet.has(s.code)), [ranked, watchSet]);
  const watchMissing = watch.filter(w => !ranked.some(r => r.code === w.code));
  const diag = ranked.find(s => s.code === selected) || null;

  const exportCSV = () => {
    const head = '排名,代碼,名稱,收盤,漲跌幅%,多頭排列,20日新高,60日新高,量比,ATR14,訊號,停損價,建議股數,首批股數,評分\n';
    const rows = ranked.map((s, i) => `${i + 1},${s.code},"${s.name}",${s.price},${s.returnRate},${s.aligned ? '是' : '否'},${s.breakout ? '是' : '否'},${s.breakout60 ? '是' : '否'},${s.volRatio},${r2(s.atr)},${s.signal},${r2(s.stop)},${s.shares},${s.first},${s.score}`).join('\n');
    const url = URL.createObjectURL(new Blob(['\uFEFF' + head + rows], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a'); a.href = url; a.download = `台股趨勢突破選股_${market.today}.csv`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
  };

  // ---------- UI 小元件 ----------
  const dataDate = mode === 'LIVE' ? (indexHist[indexHist.length - 1]?.date || '--') : '示範資料';
  const sigBadge = s => ({
    BUY: ['🟢 買進', 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'],
    LOCKED: ['🔒 大盤鎖定', 'bg-slate-700/60 text-slate-300 border-slate-600'],
    WATCH: ['🟡 觀察', 'bg-amber-500/15 text-amber-300 border-amber-500/30'],
    NONE: ['—', 'text-slate-500 border-transparent']
  }[s]);
  const chg = v => (v > 0 ? 'text-rose-400' : v < 0 ? 'text-emerald-400' : 'text-slate-400');
  const Pill = ({ on, onClick, children }) => (
    <button onClick={onClick} className={`px-3 py-1 rounded-lg text-xs font-semibold border transition ${on ? 'bg-rose-500/20 border-rose-500 text-rose-300' : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-slate-200'}`}>{children}</button>
  );
  const numField = (label, k, step = 1) => (
    <label className="block text-xs text-slate-300">{label}
      <input type="number" step={step} value={params[k]} onChange={e => setParams({ ...params, [k]: num(e.target.value) })}
        className="mt-1 w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-slate-100 focus:outline-none focus:border-rose-500" />
    </label>
  );
  const pick = code => { setSelected(code); setTab('diagnosis'); };

  const StockTable = ({ rows, empty }) => (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-slate-300">
          <thead className="bg-slate-800/80 text-xs text-slate-400 border-b border-slate-800">
            <tr>{['', '標的', '收盤', '漲跌幅', '多頭排列', '突破', '量比', '防呆', '停損價', '建議股數 (首批)', '訊號', '評分'].map((h, i) => <th key={i} className={`py-3 px-3 whitespace-nowrap ${[2, 3, 8, 9, 11].includes(i) ? 'text-right' : ''}`}>{h}</th>)}</tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {rows.length === 0 ? <tr><td colSpan="12" className="text-center py-12 text-slate-500">{empty}</td></tr> : rows.slice(0, 50).map(s => {
              const [bt, bc] = sigBadge(s.signal);
              return (
                <tr key={s.code} className="hover:bg-slate-800/50 cursor-pointer" onClick={() => pick(s.code)}>
                  <td className="py-3 px-3"><button aria-label="加入或移除監控" onClick={e => toggleWatch(e, s.code)}><Star className={`w-4 h-4 ${watchSet.has(s.code) ? 'fill-amber-400 text-amber-400' : 'text-slate-600 hover:text-amber-300'}`} /></button></td>
                  <td className="py-3 px-3 whitespace-nowrap"><span className="font-mono text-cyan-400 font-semibold mr-1.5">{s.code}</span>{s.name}</td>
                  <td className="py-3 px-3 text-right font-mono font-bold">{s.price.toFixed(1)}</td>
                  <td className={`py-3 px-3 text-right font-mono ${chg(s.change)}`}>{s.change > 0 ? '+' : ''}{s.returnRate}%</td>
                  <td className="py-3 px-3 text-xs">{s.aligned ? <span className="text-rose-300">✔ 多頭</span> : <span className="text-slate-500">—</span>}</td>
                  <td className="py-3 px-3 text-xs">{s.breakout60 ? <span className="text-rose-300">60日高</span> : s.breakout ? <span className="text-rose-300">20日高</span> : <span className="text-slate-500">—</span>}</td>
                  <td className={`py-3 px-3 font-mono text-xs ${s.volOk ? 'text-emerald-300 font-bold' : 'text-slate-400'}`}>{s.volRatio}x</td>
                  <td className="py-3 px-3 text-xs">{!s.fund.ok ? <span className="text-rose-400">未過</span> : s.fund.known ? <span className="text-emerald-400">通過</span> : <span className="text-amber-400">未驗證</span>}</td>
                  <td className="py-3 px-3 text-right font-mono text-xs">{s.stop.toFixed(1)}</td>
                  <td className="py-3 px-3 text-right font-mono text-xs whitespace-nowrap">{s.shares.toLocaleString()} ({s.first.toLocaleString()})</td>
                  <td className="py-3 px-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold border whitespace-nowrap ${bc}`}>{bt}</span></td>
                  <td className="py-3 px-3 text-right font-mono font-bold text-amber-400">{s.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 pb-12 antialiased">
      <header className="sticky top-0 z-30 bg-slate-900/90 backdrop-blur border-b border-slate-800 px-4 lg:px-8 py-3">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <Activity className="w-5 h-5 text-rose-400" />
              <h1 className="text-base md:text-lg font-bold">台股趨勢突破選股</h1>
              <span className={`px-2 py-0.5 text-xs font-semibold rounded-full border ${mode === 'LIVE' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-amber-500/10 text-amber-400 border-amber-500/30'}`}>
                {mode === 'LIVE' ? '真實 K 線' : '示範資料（非真實行情）'}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 mt-1">
              <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-rose-400" />資料日 <b className="text-slate-100 font-mono">{dataDate}</b></span>
              <span>•</span><span>{market.desc}</span>
              {updatedAt && <><span>•</span><span className="flex items-center gap-1"><Clock className="w-3 h-3 text-amber-400" />{updatedAt}</span></>}
            </div>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto">
            {[['ranking', Award, '選股榜'], ['watch', Star, `監控 (${watch.length})`], ['diagnosis', ShieldCheck, '個股診斷'], ['settings', Sliders, '設定與備份']].map(([id, Icon, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`px-3.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 whitespace-nowrap ${tab === id ? 'bg-rose-500 text-white font-semibold' : 'bg-slate-800 text-slate-300 hover:bg-slate-700'}`}>
                <Icon className="w-4 h-4" />{label}
              </button>
            ))}
            {!standalone && <button onClick={install} className="px-3 py-1.5 rounded-lg text-xs font-medium bg-cyan-500/15 text-cyan-300 border border-cyan-500/30 flex items-center gap-1.5 whitespace-nowrap"><Smartphone className="w-4 h-4" />安裝</button>}
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 lg:px-8 mt-6 space-y-5">
        {notice && (
          <div className="bg-slate-900 border border-cyan-500/30 rounded-xl p-3 flex items-center justify-between text-xs text-slate-300">
            <span className="flex items-center gap-2"><Info className="w-4 h-4 text-cyan-400 shrink-0" />{notice}</span>
            <button onClick={() => setNotice(null)} aria-label="關閉"><X className="w-4 h-4 text-slate-500 hover:text-white" /></button>
          </div>
        )}

        <div className={`rounded-2xl border p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 ${gateOpen ? 'bg-emerald-950/30 border-emerald-500/30' : 'bg-rose-950/30 border-rose-500/40'}`}>
          <div className="flex items-center gap-2 text-sm font-bold">
            {gateOpen ? <ShieldCheck className="w-5 h-5 text-emerald-400" /> : <Lock className="w-5 h-5 text-rose-400" />}
            {gate.pass ? '大盤濾網通過：允許出手' : unlock ? '濾網未過，已手動解鎖（不建議）' : '大盤濾網未過：買進鍵鎖死，只允許減碼或空手'}
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {[[gate.above, `加權 ${gate.close ? Math.round(gate.close) : '--'} 站上季線 ${gate.ma60 ? Math.round(gate.ma60) : '--'}`], [gate.rising, '季線向上'], [gate.breadth, `廣度 漲${gate.up} / 跌${gate.down}（僅統計已載入個股）`]].map(([ok, t], i) => (
              <span key={i} className={`px-2 py-1 rounded-md border flex items-center gap-1 ${ok ? 'border-emerald-500/40 text-emerald-300' : 'border-rose-500/40 text-rose-300'}`}>{ok ? <Check className="w-3 h-3" /> : <X className="w-3 h-3" />}{t}</span>
            ))}
          </div>
        </div>

        {tab === 'ranking' && (<>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-400 flex items-center gap-1"><Filter className="w-3.5 h-3.5 text-rose-400" />條件:</span>
              <Pill on={flt.buy} onClick={() => setFlt({ ...flt, buy: !flt.buy })}>只看買進訊號</Pill>
              <Pill on={flt.aligned} onClick={() => setFlt({ ...flt, aligned: !flt.aligned })}>多頭排列 20&gt;60&gt;120</Pill>
              <Pill on={flt.breakout} onClick={() => setFlt({ ...flt, breakout: !flt.breakout })}>突破 20 日高</Pill>
              <Pill on={flt.vol} onClick={() => setFlt({ ...flt, vol: !flt.vol })}>量 ≥ 5日均量 1.5 倍</Pill>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={search} onChange={e => setSearch(e.target.value)} placeholder="代號 / 名稱" className="w-44 bg-slate-950 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-rose-500" />
              </div>
              <button onClick={exportCSV} className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-400 border border-slate-700 rounded-lg text-xs flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />CSV</button>
            </div>
          </div>
          <StockTable rows={list} empty="沒有符合條件的標的。放寬條件，或到「設定與備份」載入真實資料。" />
          {skipped > 0 && <p className="text-xs text-slate-500">{skipped} 檔 K 線不足 121 根（無法算 120MA），已排除，不以假資料補。</p>}
        </>)}

        {tab === 'watch' && (<>
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3">
            <span className="text-sm font-semibold text-slate-300">加入監控:</span>
            <input value={addCode} maxLength={7} onChange={e => setAddCode(e.target.value)} onKeyDown={e => e.key === 'Enter' && addWatch(addCode)} placeholder="代號，例 2330 / 0050"
              className="w-44 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:border-rose-500" />
            <button onClick={() => addWatch(addCode)} disabled={!!busy || !addCode.trim()} className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-sm font-bold flex items-center gap-1.5 disabled:opacity-40">
              <Plus className="w-4 h-4" />{busy && busy !== 'sync' ? '載入中…' : '加入'}
            </button>
            <span className="text-xs text-slate-500">加入時會抓取近 7 個月 K 線（約 10 秒）。也可在選股榜點 ★ 加入。</span>
          </div>
          <StockTable rows={watchRows} empty="監控清單是空的。輸入代號加入第一檔。" />
          {watch.length > 0 && (
            <div className="bg-slate-900 border border-slate-800 rounded-2xl divide-y divide-slate-800">
              {watch.map(w => (
                <div key={w.code} className="p-3 flex items-center gap-3 text-xs">
                  <span className="font-mono text-cyan-400 w-12">{w.code}</span><span className="w-24 truncate">{w.name}</span>
                  <input key={w.code + w.note} defaultValue={w.note} onBlur={e => e.target.value !== w.note && saveNote(w.code, e.target.value)} placeholder="備註（例：等回測 20MA）"
                    className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2 py-1 text-slate-200 focus:outline-none focus:border-rose-500" />
                  {!ranked.some(r => r.code === w.code) && <span className="text-amber-400">K 線不足／未載入</span>}
                  <button onClick={() => removeWatch(w.code)} aria-label="移除" className="text-slate-500 hover:text-rose-400"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
          )}
          {watchMissing.length > 0 && <p className="text-xs text-slate-500">未載入的監控個股可在「設定與備份」按「同步真實資料」一併更新。</p>}
        </>)}

        {tab === 'diagnosis' && (
          <div className="space-y-5">
            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-wrap items-center gap-3 text-sm">
              <span className="text-slate-300 font-semibold">股票代碼:</span>
              <input key={selected} maxLength={7} defaultValue={selected} onKeyDown={e => e.key === 'Enter' && setSelected(e.currentTarget.value.trim().toUpperCase())} className="w-28 bg-slate-950 border border-slate-700 rounded-lg px-3 py-1.5 font-mono text-rose-400 focus:outline-none focus:border-rose-500" />
              <div className="flex flex-wrap gap-1.5 text-xs">
                {(watchRows.length ? watchRows : ranked).slice(0, 6).map(s => <button key={s.code} onClick={() => setSelected(s.code)} className={`px-2.5 py-1 rounded-md ${selected === s.code ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>{s.code} {s.name}</button>)}
              </div>
            </div>
            {!diag ? <div className="text-center py-12 text-slate-500 text-sm">{selected ? `找不到 ${selected}，或該檔 K 線不足 121 根。` : '從選股榜或監控清單點一檔個股，或輸入代碼後按 Enter。'}</div> : (
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div><h2 className="text-2xl font-bold">{diag.name} <span className="font-mono text-cyan-400 text-lg">{diag.code}</span></h2><span className="text-xs text-slate-400">{diag.date}</span></div>
                    <button onClick={e => toggleWatch(e, diag.code)} className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border border-slate-700 hover:border-amber-400"><Star className={`w-4 h-4 ${watchSet.has(diag.code) ? 'fill-amber-400 text-amber-400' : 'text-slate-400'}`} />{watchSet.has(diag.code) ? '監控中' : '加入監控'}</button>
                  </div>
                  <div className="flex items-baseline gap-3"><span className="text-3xl font-bold font-mono">{diag.price}</span><span className={`font-mono font-bold ${chg(diag.change)}`}>{diag.change > 0 ? '+' : ''}{diag.change} ({diag.returnRate}%)</span></div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[['10MA', diag.ma10], ['20MA', diag.ma20], ['60MA', diag.ma60], ['120MA', diag.ma120], ['20日高', diag.hi20], ['ATR(14)', diag.atr]].map(([l, v]) => (
                      <div key={l} className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/50"><span className="text-slate-400 block text-[11px]">{l}</span><span className="font-mono font-bold">{v.toFixed(1)}</span></div>
                    ))}
                  </div>
                  <div className="border-t border-slate-800 pt-3 space-y-2 text-xs text-slate-300">
                    <p className="text-slate-400">防呆資料（手動填寫，空白＝未驗證）</p>
                    <label className="flex items-center justify-between gap-2">法人近期淨買超（張）<input key={diag.code + 'i'} type="number" defaultValue={diag.inst ?? ''} onBlur={e => setFundVal(diag.code, 'inst', e.target.value)} className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono" /></label>
                    <label className="flex items-center justify-between gap-2">營收年增率 YoY（%）<input key={diag.code + 'y'} type="number" defaultValue={diag.yoy ?? ''} onBlur={e => setFundVal(diag.code, 'yoy', e.target.value)} className="w-28 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono" /></label>
                    <p className="text-slate-500">近四季 EPS：{diag.eps == null ? '未知' : diag.eps > 0 ? '為正' : '為負'}（{mode === 'LIVE' ? '以本益比為正近似' : '示範值'}）</p>
                  </div>
                </div>
                <div className="lg:col-span-2 space-y-5">
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Target className="w-4 h-4 text-rose-400" />買進條件檢查</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {[
                        [gateOpen, '大盤濾網', gate.pass ? '加權站上季線、季線向上、漲多於跌' : '濾網未過，買進鍵鎖死'],
                        [diag.aligned, '多頭排列', `20MA ${diag.ma20.toFixed(1)} > 60MA ${diag.ma60.toFixed(1)} > 120MA ${diag.ma120.toFixed(1)}`],
                        [diag.breakout, '創高突破', `收盤 ${diag.price} vs 前 20 日高 ${diag.hi20.toFixed(1)}${diag.breakout60 ? '（同時創 60 日高）' : ''}`],
                        [diag.volOk, '量能 ≥ 1.5 倍', `今日量為前 5 日均量的 ${diag.volRatio} 倍`],
                        [diag.fund.ok, '籌碼／基本面防呆', diag.fund.known ? '法人淨買超、EPS 為正、YoY 不為負' : '有未填欄位，尚未完整驗證']
                      ].map(([ok, t, d]) => (
                        <div key={t} className={`p-3 rounded-xl border ${ok ? 'bg-emerald-950/30 border-emerald-500/40' : 'bg-slate-800/30 border-slate-700/50 text-slate-400'}`}>
                          <div className="flex items-center justify-between text-xs font-bold">{t}{ok ? <Check className="w-4 h-4 text-emerald-400" /> : <X className="w-4 h-4 text-slate-500" />}</div>
                          <p className="text-[11px] mt-1">{d}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5">
                    <h3 className="text-sm font-bold mb-3 flex items-center gap-2"><Calculator className="w-4 h-4 text-rose-400" />交易計畫（ATR 部位計算）</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      {[['試單 30%', `${diag.first.toLocaleString()} 股`], ['總部位上限', `${diag.shares.toLocaleString()} 股`], ['停損價', diag.stop.toFixed(1)], ['單筆風險額', Math.round(diag.riskAmt).toLocaleString()],
                        ['加碼區 +5~8%', `${(diag.price * 1.05).toFixed(1)}~${(diag.price * 1.08).toFixed(1)}`], ['移動停利啟動 +15%', (diag.price * 1.15).toFixed(1)],
                        ['停利線（10MA / 20MA）', `${diag.ma10.toFixed(1)} / ${diag.ma20.toFixed(1)}`], ['預估停損虧損', Math.round((diag.price - diag.stop) * diag.shares).toLocaleString()]
                      ].map(([l, v]) => <div key={l} className="bg-slate-800/50 rounded-lg p-2.5 border border-slate-700/50"><span className="text-slate-400 block text-[11px]">{l}</span><span className="font-mono font-bold">{v}</span></div>)}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-3">股數 = 單筆風險額 ÷ max(ATR, 進場價−停損價)，再受單檔上限限制。加碼僅限已獲利且回測 10 日線不破、量縮止穩。獲利超過 15% 後，跌破 10MA（強勢股）或 20MA（波段股），或自高點回落 10% 即出清。</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'settings' && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="space-y-5">
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3 text-sm">
                <h2 className="font-bold flex items-center gap-2"><HardDrive className="w-4 h-4 text-rose-400" />本機資料與備份</h2>
                <p className="text-xs text-slate-400">所有設定、監控清單與籌碼欄位只存在這台裝置的瀏覽器。換裝置或清除瀏覽器資料前，請先匯出備份。</p>
                <div className="flex flex-wrap gap-2">
                  <button onClick={exportBackup} className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs flex items-center gap-1.5"><Download className="w-3.5 h-3.5" />匯出備份</button>
                  <label className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs cursor-pointer">匯入備份<input type="file" accept="application/json" onChange={importBackup} className="hidden" /></label>
                </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                <h2 className="font-bold flex items-center gap-2"><ShieldAlert className="w-4 h-4 text-rose-400" />資金與風控</h2>
                <div className="grid grid-cols-2 gap-3">
                  {numField('總資金 (元)', 'capital', 10000)}{numField('單筆最大虧損 (%)', 'riskPct', 0.1)}
                  {numField('最大停損幅度 (%)', 'maxLoss', 0.5)}{numField('單檔部位上限 (%)', 'maxPos', 1)}
                </div>
                <label className="flex items-center gap-2 text-xs text-slate-400"><input type="checkbox" checked={unlock} onChange={e => setUnlock(e.target.checked)} />濾網未過時仍顯示買進訊號（不建議）</label>
                <h2 className="font-bold flex items-center gap-2 pt-2"><Sliders className="w-4 h-4 text-rose-400" />排序權重</h2>
                {[['trend', '多頭排列'], ['breakout', '創高突破'], ['volume', '量能'], ['rs', '60 日相對強度'], ['chip', '籌碼／基本面']].map(([k, l]) => (
                  <div key={k}><div className="flex justify-between text-xs mb-1"><span className="text-slate-300">{l}</span><span className="font-mono text-rose-400 font-bold">{weights[k]}</span></div>
                    <input type="range" min="0" max="100" value={weights[k]} onChange={e => setWeights({ ...weights, [k]: Number(e.target.value) })} className="w-full accent-rose-400" /></div>
                ))}
                <p className="text-[11px] text-slate-500">權重只影響排序；買進燈號由絕對條件決定。</p>
              </div>
            </div>

            <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4 text-xs h-fit">
              <h2 className="font-bold text-sm flex items-center gap-2"><Database className="w-4 h-4 text-rose-400" />資料來源</h2>
              <div className="flex items-center justify-between gap-2"><span className="text-slate-400">中繼節點</span>
                <select value={nodeId} onChange={e => setNodeId(e.target.value)} className="bg-slate-950 border border-slate-700 rounded-lg px-2 py-1">{API_NODES.map(n => <option key={n.id} value={n.id}>{n.name}</option>)}</select></div>
              <label className="flex items-center justify-between gap-2 text-slate-400">成交金額前 N 檔（每檔約 7 次請求）
                <input type="number" min="3" max="40" value={topN} onChange={e => setTopN(Math.min(40, Math.max(3, num(e.target.value))))} className="w-20 bg-slate-950 border border-slate-700 rounded px-2 py-1 font-mono" /></label>
              <button onClick={syncAll} disabled={!!busy} className="w-full py-2 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold flex items-center justify-center gap-1.5 disabled:opacity-50">
                <RefreshCw className={`w-3.5 h-3.5 ${busy === 'sync' ? 'animate-spin' : ''}`} />{busy === 'sync' ? '同步中…（約 1~2 分鐘）' : '同步真實資料（含監控清單）'}
              </button>
              <div className="border-t border-slate-800 pt-3 space-y-2">
                <p className="text-slate-300 font-bold">貼上最新報價（更新已載入個股的最新一根）</p>
                <textarea rows={4} value={importText} onChange={e => setImportText(e.target.value)} placeholder={'代號 名稱 現價 漲跌 張數\n2330 台積電 2380 45 52000'} className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 font-mono text-slate-200 focus:outline-none focus:border-rose-500" />
                <button onClick={importPaste} disabled={!importText.trim()} className="w-full py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-cyan-300 font-semibold disabled:opacity-40">套用報價</button>
              </div>
              <p className="text-[11px] text-slate-500">本工具僅為量化篩選輔助，不構成投資建議；訊號以收盤資料為準，請於盤後確認。</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
