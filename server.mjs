#!/usr/bin/env node
/**
 * 外贸快查 · 本地服务
 *  - 静态托管 ./web
 *  - GET /api/search?q=产品  → 联网兜底：多引擎检索 + 文本信号抽取（确定性规则，非生成）
 *  - GET /api/health
 * 零第三方依赖，Node >= 18（内置 fetch）。
 *
 * 搜索适配器（环境变量，任一可用即可）：
 *   SEARCH_PROVIDER = tavily | serper | bing | searx | auto(默认)
 *   TAVILY_API_KEY / SERPER_API_KEY / BING_SEARCH_KEY / SEARX_BASE
 *   未配 key 时自动降级到免 key 的 DuckDuckGo / Bing HTML 检索（受地区网络影响，可能失败）
 */
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const WEB = path.join(ROOT, 'web');

// 极简 .env 加载（零依赖）：读取同目录 .env，不覆盖已有环境变量
try {
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) {
    fs.readFileSync(envFile, 'utf8').split(/\r?\n/).forEach((line) => {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
    });
  }
} catch (e) { /* .env 可选 */ }
const PORT = Number(process.env.PORT || 8787);

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.md': 'text/markdown; charset=utf-8'
};

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122 Safari/537.36';

async function timed(url, opt = {}, ms = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal, headers: { 'User-Agent': UA, ...(opt.headers || {}) } }); }
  finally { clearTimeout(t); }
}

async function searchTavily(q, n) {
  const r = await timed('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + process.env.TAVILY_API_KEY },
    body: JSON.stringify({ query: q, max_results: n, search_depth: 'basic', include_answer: false })
  }, 15000);
  if (!r.ok) throw new Error('tavily ' + r.status);
  const j = await r.json();
  return (j.results || []).map(x => ({ title: x.title || x.url, url: x.url, snippet: x.content || '' }));
}

async function searchSerper(q, n) {
  const r = await timed('https://google.serper.dev/search', {
    method: 'POST',
    headers: { 'X-API-KEY': process.env.SERPER_API_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ q, num: n, gl: 'us', hl: 'en' })
  }, 8000);
  if (!r.ok) throw new Error('serper ' + r.status);
  const j = await r.json();
  return (j.organic || []).map(x => ({ title: x.title, url: x.link, snippet: x.snippet }));
}

async function searchBingApi(q, n) {
  const u = 'https://api.bing.microsoft.com/v7.0/search?count=' + n + '&q=' + encodeURIComponent(q);
  const r = await timed(u, { headers: { 'Ocp-Apim-Subscription-Key': process.env.BING_SEARCH_KEY } }, 8000);
  if (!r.ok) throw new Error('bing ' + r.status);
  const j = await r.json();
  return ((j.webPages && j.webPages.value) || []).map(x => ({ title: x.name, url: x.url, snippet: x.snippet }));
}

async function searchSearx(q, n) {
  const base = (process.env.SEARX_BASE || 'https://searx.be').replace(/\/+$/, '');
  const r = await timed(base + '/search?format=json&q=' + encodeURIComponent(q), {}, 8000);
  if (!r.ok) throw new Error('searx ' + r.status);
  const j = await r.json();
  return (j.results || []).slice(0, n).map(x => ({ title: x.title, url: x.url, snippet: x.content }));
}

async function searchDdg(q, n) {
  const r = await timed('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), {}, 7000);
  if (!r.ok) throw new Error('ddg ' + r.status);
  const html = await r.text();
  const out = [];
  const re = /<a[^>]+class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(html)) && out.length < n) {
    const href = m[1].replace(/^\/\/duckduckgo\.com\/l\/\?uddg=/, '').split('&')[0];
    out.push({ url: decodeURIComponent(href), title: stripHtml(m[2]), snippet: stripHtml(m[3]) });
  }
  return out;
}

async function searchBingHtml(q, n) {
  const r = await timed('https://www.bing.com/search?q=' + encodeURIComponent(q) + '&count=' + n, {}, 7000);
  if (!r.ok) throw new Error('bing-html ' + r.status);
  const html = await r.text();
  const out = [];
  const re = /<li class="b_algo"[\s\S]*?<h2><a href="([^"]+)"[^>]*>([\s\S]*?)<\/a><\/h2>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/g;
  let m;
  while ((m = re.exec(html)) && out.length < n) out.push({ url: m[1], title: stripHtml(m[2]), snippet: stripHtml(m[3]) });
  return out;
}

function stripHtml(s) {
  return String(s || '').replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'")
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ').trim();
}

async function runSearch(q, n = 6) {
  const p = (process.env.SEARCH_PROVIDER || 'auto').toLowerCase();
  const chain = [];
  if (p === 'tavily') chain.push(['tavily', searchTavily]);
  else if (p === 'serper') chain.push(['serper', searchSerper]);
  else if (p === 'bing') chain.push(['bing', searchBingApi]);
  else if (p === 'searx') chain.push(['searx', searchSearx]);
  else {
    if (process.env.TAVILY_API_KEY) chain.push(['tavily', searchTavily]);
    if (process.env.SERPER_API_KEY) chain.push(['serper', searchSerper]);
    if (process.env.BING_SEARCH_KEY) chain.push(['bing', searchBingApi]);
    if (process.env.SEARX_BASE) chain.push(['searx', searchSearx]);
    chain.push(['duckduckgo', searchDdg], ['bing-html', searchBingHtml]);
  }
  const errors = [];
  for (const [name, fn] of chain) {
    try {
      const r = await fn(q, n);
      if (r && r.length) return { provider: name, results: r };
      errors.push(name + ': empty');
    } catch (e) { errors.push(name + ': ' + e.message); }
  }
  const err = new Error('所有搜索通道均不可用：' + errors.join(' | '));
  err.detail = errors;
  throw err;
}

const COUNTRY_HINTS = [
  ['美国', ['united states', 'usa', 'america', '美国'], '北美洲'],
  ['德国', ['germany', 'german', 'deutschland', '德国'], '欧洲'],
  ['英国', ['united kingdom', 'britain', 'england', '英国'], '欧洲'],
  ['法国', ['france', 'french', '法国'], '欧洲'],
  ['意大利', ['italy', 'italian', '意大利'], '欧洲'],
  ['西班牙', ['spain', 'spanish', '西班牙'], '欧洲'],
  ['荷兰', ['netherlands', 'holland', '荷兰'], '欧洲'],
  ['波兰', ['poland', 'polish', '波兰'], '欧洲'],
  ['俄罗斯', ['russia', 'russian', '俄罗斯'], '欧洲'],
  ['日本', ['japan', 'japanese', '日本'], '亚洲'],
  ['韩国', ['korea', 'korean', '韩国'], '亚洲'],
  ['印度', ['india', 'indian', '印度'], '亚洲'],
  ['越南', ['vietnam', '越南'], '亚洲'],
  ['印度尼西亚', ['indonesia', '印度尼西亚'], '亚洲'],
  ['泰国', ['thailand', '泰国'], '亚洲'],
  ['马来西亚', ['malaysia', '马来西亚'], '亚洲'],
  ['新加坡', ['singapore', '新加坡'], '亚洲'],
  ['阿联酋', ['uae', 'emirates', 'dubai', '阿联酋', '迪拜'], '中东'],
  ['沙特阿拉伯', ['saudi', '沙特'], '中东'],
  ['土耳其', ['turkey', '土耳其'], '中东'],
  ['巴西', ['brazil', '巴西'], '拉丁美洲'],
  ['墨西哥', ['mexico', '墨西哥'], '拉丁美洲'],
  ['加拿大', ['canada', '加拿大'], '北美洲'],
  ['澳大利亚', ['australia', '澳大利亚'], '大洋洲'],
  ['南非', ['south africa', '南非'], '非洲'],
  ['尼日利亚', ['nigeria', '尼日利亚'], '非洲']
];

const SIGNALS = [
  ['进口增长', /import[s]? (grew|rose|increased|up)|进口(增长|增加|上升)/i],
  ['关税或认证门槛', /tariff|duty|regulation|certification|ce mark|reach|gpsr|saso|关税|认证|合规/i],
  ['平台格局', /amazon|alibaba|aliexpress|shopee|temu|coupang|noon|mercado/i],
  ['需求走强', /demand (for|is) (rising|growing|strong)|需求(旺盛|增长|上升)|growing demand/i],
  ['价格敏感', /price[- ]sensitive|cheap|低价|价格敏感/i],
  ['展会采购', /trade fair|canton fair|exhibition|展会|采购/i]
];

function extractSignals(pages) {
  const text = pages.map(p => (p.title || '') + ' ' + (p.snippet || '')).join('\n');
  const countries = [];
  for (const [cn, words, region] of COUNTRY_HINTS) {
    let hits = 0;
    for (const w of words) {
      const re = new RegExp(w.replace(/[.*+?^${\}()|[\]\\]/g, '\\$&'), 'gi');
      hits += (text.match(re) || []).length;
    }
    if (hits >= 2) countries.push({ country: cn, region, hits });
  }
  countries.sort((a, b) => b.hits - a.hits);
  const signals = [];
  for (const [name, re] of SIGNALS) {
    const m = text.match(re);
    if (m) signals.push(name + '（' + m[0].slice(0, 24) + '）');
  }
  return {
    markets: countries.slice(0, 8).map(c => ({
      country: c.country, region: c.region,
      title: c.country + ' · ' + c.region + '（提及 ' + c.hits + ' 次）',
      snippet: '该条由公开网页文本中国家名的出现次数统计得出，仅代表"被提及频率"，不等同于市场规模或偏好强度。'
    })),
    notes: signals.length ? ['检索文本中出现的信号：' + signals.join('、')] : [],
    evidence: pages
  };
}

async function webQuery(q, poolName) {
  const queries = [
    q + ' export market demand country',
    q + ' 出口 目标市场 需求 国家',
    q + ' top importing countries HS code'
  ];
  // 三路并行检索：把 3 次串行的等待压成 1 次
  const all = [];
  const used = new Set();
  const settled = await Promise.allSettled(queries.map(qq => runSearch(qq, 5)));
  settled.forEach(s => {
    if (s.status === 'fulfilled' && s.value) {
      used.add(s.value.provider);
      s.value.results.forEach(x => all.push(x));
    }
  });
  const seen = new Set();
  const pages = all.filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true))).slice(0, 12);
  // 检索失败也继续走 AI：模型可用通用外贸常识给出方向，但要标注"无检索资料"
  const hasPages = pages.length > 0;
  const sig = hasPages ? extractSignals(pages) : { markets: [], notes: [] };
  // 检索结果 + AI 结构化推断并行产出；AI 失败不影响检索结果展示
  const ai = await aiInfer(q, pages, poolName).catch(e => ({ ok: false, message: e.message }));
  const aiData = ai.ok ? ai.result : null;
  if (aiData && !hasPages) {
    aiData.uncertain = ['本次没检索到网页资料，结论仅基于模型通用常识，准确性有限'].concat(aiData.uncertain || []);
  }
  return {
    ok: !!(aiData || hasPages),
    retrievalFailed: !hasPages,
    message: hasPages ? undefined : '网页检索失败，已改用 AI 通用常识推断',
    result: { markets: sig.markets, notes: sig.notes, sources: pages.map(p => ({ title: p.title, url: p.url })) },
    ai: aiData,
    aiModel: ai.ok ? ai.model : null,
    aiError: ai.ok ? null : ai.message,
    provider: hasPages ? [...used].join('+') : 'ai-only'
  };
}

/* ---------------- AI 结构化推断 ----------------
   未收录产品在"本地规则"之外，再用大模型把检索到的公开信息整理成四块结论。
   OpenAI 兼容接口：AI_BASE_URL / AI_API_KEY / AI_MODEL。
   未配置时返回 ok:false，界面明确标注"仅本地估算"，不伪造。 */
function aiPrompt(q, pages, poolName) {
  const ctx = pages.map((p, i) => `[${i + 1}] ${p.title}\n${(p.snippet || '').slice(0, 300)}\n${p.url}`).join('\n\n').slice(0, 6000);
  return [
    { role: 'system', content: '你是外贸选品分析师。只依据给定资料与通用外贸常识作答，不确定就写"不确定"，绝不编造数字、政策条文或平台名。输出严格 JSON，中文，每句不超过 40 字。' },
    { role: 'user', content: `产品：${q}${poolName ? `（系统初步归入"${poolName}"，若明显不符请纠正）` : ''}

资料：
${ctx || '（无检索资料，仅凭通用外贸常识，须标注不确定）'}

输出 JSON：
{
  "product": "标准品名",
  "category": "品类",
  "countries": [{"country":"","region":"","why":["为什么这个国家要，1-2 条"],"entry":"怎么切进去一句"}],
  "platforms": [{"name":"平台","mode":"自然流|投流|双轨","why":"一句"}],
  "flow": {"verdict":"自然流为主|双轨并行|投流为主","organic":["内容打法 1-2 条"],"paid":["投流做法 1 条"],"reason":"为什么这样选"},
  "confidence": "high|medium|low",
  "uncertain": ["不确定的点"]
}
countries 给 3 个，platforms 给 4 个，按适用度排序。` }
  ];
}

async function aiInfer(q, pages, poolName) {
  const key = process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!key) return { ok: false, message: '未配置 AI 接口（AI_API_KEY），本次未做 AI 推断' };
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  try {
    const r = await timed(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ model, messages: aiPrompt(q, pages, poolName), temperature: 0.3,
        response_format: { type: 'json_object' } })
    }, 25000);
    if (!r.ok) return { ok: false, message: 'AI 接口返回 ' + r.status };
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) return { ok: false, message: 'AI 未返回内容' };
    const data = JSON.parse(txt.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, ''));
    return { ok: true, result: data, model };
  } catch (e) {
    return { ok: false, message: 'AI 调用失败：' + e.message };
  }
}

const cache = new Map();

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');
  if (u.pathname === '/api/health') {
    return send(res, 200, JSON.stringify({
      ok: true, provider: process.env.SEARCH_PROVIDER || 'auto',
      keys: {
        tavily: !!process.env.TAVILY_API_KEY, serper: !!process.env.SERPER_API_KEY,
        bing: !!process.env.BING_SEARCH_KEY, searx: !!process.env.SEARX_BASE
      }, ai: !!(process.env.AI_API_KEY || process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY),
      aiModel: process.env.AI_MODEL || 'gpt-4o-mini',
      uptime: Math.round(process.uptime())
    }));
  }
  // 知识库未命中记录：落盘到 web/data/misses.jsonl，供后续补充进知识库
  if (u.pathname === '/api/miss') {
    const MISS_FILE = path.join(WEB, 'data', 'misses.jsonl');
    if (req.method === 'POST') {
      let body = '';
      req.on('data', (c) => { body += c; if (body.length > 4096) req.destroy(); });
      req.on('end', () => {
        try {
          const rec = JSON.parse(body || '{}');
          const q = String(rec.q || '').trim().slice(0, 60);
          if (!q) return send(res, 400, JSON.stringify({ ok: false, message: '缺少 q' }));
          const line = JSON.stringify({
            q, poolId: rec.poolId || null, poolName: rec.poolName || null,
            confidence: rec.confidence || null, at: new Date().toISOString(),
            ua: String(req.headers['user-agent'] || '').slice(0, 120)
          });
          fs.appendFileSync(MISS_FILE, line + '\n', 'utf8');
          return send(res, 200, JSON.stringify({ ok: true, saved: q }));
        } catch (e) {
          return send(res, 200, JSON.stringify({ ok: false, message: e.message }));
        }
      });
      return;
    }
    // GET：返回未命中统计（按查询词聚合）
    try {
      const txt = fs.existsSync(MISS_FILE) ? fs.readFileSync(MISS_FILE, 'utf8') : '';
      const rows = txt.split('\n').filter(Boolean).map(l => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
      const agg = {};
      rows.forEach(r => { agg[r.q] = (agg[r.q] || 0) + 1; });
      const top = Object.entries(agg).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([q, n]) => ({ q, n }));
      return send(res, 200, JSON.stringify({ ok: true, total: rows.length, top }));
    } catch (e) {
      return send(res, 200, JSON.stringify({ ok: false, message: e.message }));
    }
  }
  if (u.pathname === '/api/search') {
    const q = (u.searchParams.get('q') || '').trim();
    if (!q) return send(res, 400, JSON.stringify({ ok: false, message: '缺少参数 q' }));
    if (q.length > 60) return send(res, 400, JSON.stringify({ ok: false, message: '查询词过长' }));
    // 无意义输入不调 AI：纯数字/符号/单字符
    if (!/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/.test(q)) {
      return send(res, 200, JSON.stringify({ ok: false, message: '这个输入不像产品名（纯数字/符号/过短），不调用 AI 以免浪费额度' }));
    }
    const key = q.toLowerCase();
    const hit = cache.get(key);
    // 缓存 10 分钟：AI 结果同样缓存，避免重复调用烧钱
    if (hit && Date.now() - hit.t < 10 * 60 * 1000) return send(res, 200, JSON.stringify({ ...hit.v, cached: true }));
    try {
      const out = await webQuery(q, u.searchParams.get('pool') || '');
      cache.set(key, { t: Date.now(), v: out });
      return send(res, 200, JSON.stringify(out));
    } catch (e) {
      return send(res, 200, JSON.stringify({ ok: false, message: e.message }));
    }
  }

  let p = decodeURIComponent(u.pathname);
  if (p === '/') p = '/index.html';
  const file = path.join(WEB, path.normalize(p).replace(/^(\.\.[/\\])+/, ''));
  if (!file.startsWith(WEB)) return send(res, 403, 'forbidden', 'text/plain');
  fs.readFile(file, (err, buf) => {
    if (err) return send(res, 404, 'not found', 'text/plain');
    send(res, 200, buf, MIME[path.extname(file).toLowerCase()] || 'application/octet-stream');
  });
});

server.listen(PORT, () => {
  console.log('外贸快查已启动: http://localhost:' + PORT);
  console.log('搜索通道:', process.env.SEARCH_PROVIDER || 'auto（无 key 时兜底 DuckDuckGo / Bing HTML）');
});
