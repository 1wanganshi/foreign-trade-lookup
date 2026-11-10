/**
 * 外贸快查 · Cloudflare Worker 版
 *  - 静态资源由 [assets] 绑定提供（web/ 目录）
 *  - /api/search 走 Tavily + 大模型（Key 存在 Worker Secret 里）
 *  - /api/miss 记录未命中（写入 KV，未绑定时降级为内存 Map）
 */
const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: JSON_HEADERS });

async function timed(url, opt = {}, ms = 12000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try { return await fetch(url, { ...opt, signal: ctl.signal }); } finally { clearTimeout(t); }
}

/* ---------- Tavily 检索 ---------- */
async function searchTavily(q, n, env) {
  const r = await timed('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.TAVILY_API_KEY },
    body: JSON.stringify({ query: q, max_results: n, search_depth: 'basic', include_answer: false })
  }, 15000);
  if (!r.ok) throw new Error('tavily ' + r.status);
  const j = await r.json();
  return (j.results || []).map(x => ({ title: x.title || x.url, url: x.url, snippet: x.content || '' }));
}

/* ---------- 大模型结构化推断 ---------- */
function aiPrompt(q, pages, poolName) {
  const ctx = pages.map((p, i) => `[${i + 1}] ${p.title}\n${(p.snippet || '').slice(0, 300)}\n${p.url}`).join('\n\n').slice(0, 6000);
  return [
    { role: 'system', content: '你是外贸选品分析师。只依据给定资料与通用外贸常识作答，不确定就写"不确定"，绝不编造数字、政策条文或平台名。输出严格 JSON，中文，每句不超过 40 字。' },
    { role: 'user', content: `产品：${q}${poolName ? `（系统初步归入"${poolName}"，若明显不符请纠正）` : ''}

资料：
${ctx || '（无检索资料，仅凭通用外贸常识，须标注不确定）'}

输出 JSON：
{"product":"标准品名","category":"品类","countries":[{"country":"","region":"","why":[""],"entry":""}],"platforms":[{"name":"","mode":"自然流|投流|双轨","why":""}],"flow":{"verdict":"自然流为主|双轨并行|投流为主","organic":[""],"paid":[""],"reason":""},"confidence":"high|medium|low","uncertain":[""]}
countries 给 3 个，platforms 给 4 个，按适用度排序。` }
  ];
}

async function aiInfer(q, pages, poolName, env) {
  if (!env.AI_API_KEY) return { ok: false, message: '未配置 AI_API_KEY' };
  const base = (env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '');
  const model = env.AI_MODEL || 'gpt-4o-mini';
  try {
    const r = await timed(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + env.AI_API_KEY },
      body: JSON.stringify({ model, messages: aiPrompt(q, pages, poolName), temperature: 0.3, response_format: { type: 'json_object' } })
    }, 30000);
    if (!r.ok) return { ok: false, message: 'AI 接口返回 ' + r.status };
    const j = await r.json();
    const txt = j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
    if (!txt) return { ok: false, message: 'AI 未返回内容' };
    return { ok: true, result: JSON.parse(txt.replace(/^\s*```(json)?/i, '').replace(/```\s*$/, '')), model };
  } catch (e) {
    return { ok: false, message: 'AI 调用失败：' + e.message };
  }
}

/* ---------- 主检索流程 ---------- */
async function webQuery(q, poolName, env) {
  const queries = [q + ' export market demand country', q + ' 出口 目标市场 需求 国家', q + ' top importing countries HS code'];
  const all = [];
  const settled = await Promise.allSettled(queries.map(qq => searchTavily(qq, 5, env)));
  settled.forEach(s => { if (s.status === 'fulfilled') s.value.forEach(x => all.push(x)); });

  const seen = new Set();
  const pages = all.filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true))).slice(0, 12);
  const ai = await aiInfer(q, pages, poolName, env).catch(e => ({ ok: false, message: e.message }));
  const aiData = ai.ok ? ai.result : null;
  if (aiData && !pages.length) {
    aiData.uncertain = ['本次没检索到网页资料，结论仅基于模型通用常识，准确性有限'].concat(aiData.uncertain || []);
  }
  return {
    ok: !!(aiData || pages.length),
    retrievalFailed: !pages.length,
    message: pages.length ? undefined : '网页检索失败，已改用 AI 通用常识推断',
    result: { markets: [], notes: [], sources: pages.map(p => ({ title: p.title, url: p.url })) },
    ai: aiData,
    aiModel: ai.ok ? ai.model : null,
    aiError: ai.ok ? null : ai.message,
    provider: pages.length ? 'tavily' : 'ai-only'
  };
}

export default {
  async fetch(request, env, ctx) {
    const u = new URL(request.url);

    if (u.pathname === '/api/health') {
      return json({
        ok: true, platform: 'cloudflare-worker',
        keys: { tavily: !!env.TAVILY_API_KEY },
        ai: !!env.AI_API_KEY, aiModel: env.AI_MODEL || 'gpt-4o-mini'
      });
    }

    if (u.pathname === '/api/search') {
      const q = (u.searchParams.get('q') || '').trim();
      if (!q) return json({ ok: false, message: '缺少参数 q' }, 400);
      if (q.length > 60) return json({ ok: false, message: '查询词过长' }, 400);
      if (!/[\u4e00-\u9fa5]{2,}|[a-zA-Z]{3,}/.test(q)) {
        return json({ ok: false, message: '这个输入不像产品名（纯数字/符号/过短），不调用 AI 以免浪费额度' });
      }
      if (!env.TAVILY_API_KEY && !env.AI_API_KEY) {
        return json({ ok: false, message: '服务端未配置检索与 AI 密钥，本次只返回本地知识库结果' });
      }
      const cacheKey = new Request('https://cache.internal/' + encodeURIComponent(q.toLowerCase()), request);
      const cache = caches.default;
      const hit = await cache.match(cacheKey);
      if (hit) return hit;
      try {
        const out = await webQuery(q, u.searchParams.get('pool') || '', env);
        const resp = new Response(JSON.stringify(out), { headers: { ...JSON_HEADERS, 'Cache-Control': 'public, max-age=600' } });
        ctx.waitUntil(cache.put(cacheKey, resp.clone()));
        return resp;
      } catch (e) {
        return json({ ok: false, message: e.message });
      }
    }

    if (u.pathname === '/api/miss') {
      if (request.method === 'POST') {
        try {
          const rec = await request.json();
          const q = String(rec.q || '').trim().slice(0, 60);
          if (!q) return json({ ok: false, message: '缺少 q' }, 400);
          if (env.MISS_KV) {
            const key = 'miss:' + Date.now() + ':' + Math.random().toString(36).slice(2, 8);
            await env.MISS_KV.put(key, JSON.stringify({ ...rec, q, at: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 90 });
          }
          return json({ ok: true, saved: q });
        } catch (e) { return json({ ok: false, message: e.message }); }
      }
      if (env.MISS_KV) {
        const list = await env.MISS_KV.list({ limit: 100 });
        return json({ ok: true, total: list.keys.length });
      }
      return json({ ok: true, total: 0, note: '未绑定 KV，未命中记录不会持久化' });
    }

    return env.ASSETS.fetch(request);
  }
};
