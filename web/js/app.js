/* 外贸快查 · 移动端交互层
   性能要点：
   - 知识库随页面同步加载（kb.bundle.js），首次查询为纯内存查找，目标 <10ms
   - 结果渲染用一次性 innerHTML 拼接，避免逐节点插入
   - 未命中时先用规则推断立刻出结果，再异步请求 /api/search 追加联网信息
*/
(function () {
  'use strict';
  var $ = function (id) { return document.getElementById(id); };
  var HOT = ['保温杯', 'LED灯带', '蓝牙耳机', '宠物用品', '电动滑板车', '瑜伽裤', '激光雕刻机', '太阳能路灯'];
  var state = { last: null, history: [], webAbort: null };

  /* ---------- 启动 ---------- */
  function boot() {
    var catalog = window.KB_CATALOG || { categories: [], builtAt: 'n/a' };
    var t0 = performance.now();
    var info = window.Engine.init(catalog);
    var ms = (performance.now() - t0).toFixed(1);
    $('kbCount').textContent = '已收录 ' + info.products + ' 个产品 · 即刻出结果';
    renderHot();
    loadHistory();
    bindUI();
    var q = new URLSearchParams(location.search).get('q');
    if (q) { $('q').value = q; runQuery(q); }
    measurePerf(info.products);
  }

  function measurePerf(n) {
    var t = performance.now();
    var list = (window.KB_CATALOG.categories || []).reduce(function (a, c) { return a.concat(c.products.map(function (p) { return p.name; })); }, []);
    var sample = list.slice(0, 300);
    sample.forEach(function (s) { window.Engine.query(s); });
    var avg = (performance.now() - t) / Math.max(1, sample.length);
    window.__perf = { products: n, avgQueryMs: +avg.toFixed(3) };
  }

  function renderHot() {
    $('hotTags').innerHTML = HOT.map(function (h) { return '<button data-q="' + h + '">' + h + '</button>'; }).join('');
  }

  function bindUI() {
    $('searchForm').addEventListener('submit', function (e) {
      e.preventDefault();
      runQuery($('q').value);
    });
    $('hotTags').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-q]');
      if (!b) return;
      $('q').value = b.dataset.q;
      runQuery(b.dataset.q);
    });
    // 一屏版式：不再有页签与卡片展开，全部内容直接平铺
    $('relChips').addEventListener('click', function (e) {
      var b = e.target.closest('button[data-name]');
      if (!b) return;
      $('q').value = b.dataset.name;
      runQuery(b.dataset.name);
    });
    $('errRetry').addEventListener('click', function () { $('q').focus(); showState('empty'); });
    $('btnHistory').addEventListener('click', openDrawer);
    $('btnCloseDrawer').addEventListener('click', closeDrawer);
    $('drawerMask').addEventListener('click', closeDrawer);
    $('historyList').addEventListener('click', onHistoryClick);

    // 输入即提示（本地建议，不发网络请求）
    var timer = null;
    $('q').addEventListener('input', function () {
      clearTimeout(timer);
    });
  }

  function showState(which) {
    document.body.classList.toggle('in-result', which === 'result');
    ['emptyState', 'loading', 'errorState', 'result'].forEach(function (k) { $(k).hidden = true; });
    if (which === 'empty') $('emptyState').hidden = false;
    if (which === 'loading') $('loading').hidden = false;
    if (which === 'error') $('errorState').hidden = false;
    if (which === 'result') $('result').hidden = false;
  }

  /* ---------- 主流程 ---------- */
  function runQuery(raw) {
    var q = String(raw || '').trim();
    if (!q) { showError('请输入产品名称', '例如：保温杯、LED灯带、蓝牙耳机。支持中文、英文与常见别名。'); return; }

    showState('loading');
    // 让骨架先绘制一帧，保证移动端有反馈
    requestAnimationFrame(function () {
      setTimeout(function () { doQuery(q); }, 0);
    });
  }

  var ORIGINAL_QUERY = {};

  function doQuery(q) {
    var res;
    try { res = window.Engine.query(q); } catch (err) { showError('查询异常', String(err && err.message)); return; }
    ORIGINAL_QUERY[q] = res;

    if (!res.ok) {
      showError(
        res.code === 'TOO_LONG' ? '名称太长' : '无法识别',
        res.message || '请输入更具体的产品名称，例如"不锈钢保温杯""USB-C 数据线"。'
      );
      return;
    }
    if (res.product && res.product.id && String(res.product.id).indexOf('rule-') === 0) {
      res.needsWeb = true;
    }
    state.last = res;
    render(res);
    pushHistory(q);
    // 未收录 → 记录到本地队列 + 上报服务端，供下一轮补进知识库
    if (res.source === 'rule') reportMiss(q, res);
    if (res.needsWeb) fetchWeb(q, res);
  }

  function fetchWeb(q, res) {
    var ctrl = (typeof AbortController !== 'undefined') ? new AbortController() : null;
    state.webAbort = ctrl;
    var url = '/api/search?q=' + encodeURIComponent(q) + '&pool=' + encodeURIComponent(res.poolName || '');
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 30000);
    var started = performance.now();

    fetch(url, { signal: ctrl ? ctrl.signal : undefined })
      .then(function (r) { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then(function (data) {
        clearTimeout(timer);
        if (state.last !== res) return;
        var ms = Math.round(performance.now() - started);
        mergeWeb(res, data, ms);
        // AI 回来后整体重渲染：未收录产品此时应展示四块真实内容
        render(state.last);
      })
      .catch(function (e) {
        clearTimeout(timer);
        if (state.last !== res) return;
        var box = $('noticeBox');
        box.className = 'notice rule';
        box.hidden = false;
        box.innerHTML = '<b>没连上网</b><br>下面只按本地资料估算，没用网上数据。原因：' +
          (e && e.name === 'AbortError' ? '请求超时（>30s）' : ('无法连接本地服务或网络受限（' + esc(e.message || 'unknown') + '）')) +
          '<br>如需联网兜底，请在本机运行 <code>node server.mjs</code> 后通过 http://localhost:8787 访问。';
      });
  }

  function mergeWeb(res, data, ms) {
    if (!data || !data.ok || !data.result) {
      var box0 = $('noticeBox');
      box0.className = 'notice rule';
      box0.hidden = false;
      box0.innerHTML = '<b>联网未取得有效信息</b><br>' + esc((data && data.message) || '搜索服务未返回结果') +
        '<br>结果照常可以看。';
      return;
    }
    var w = data.result;
    res.web = { markets: w.markets || [], notes: w.notes || [], sources: w.sources || [], tookMs: ms, engine: data.provider || 'web' };
    // AI 结构化推断：补全四块内容（国家/原因/平台/流量），并标注来源
    if (data.ai) {
      res.ai = data.ai;
      res.aiModel = data.aiModel;
      applyAI(res, data.ai);
    }
    var box = $('noticeBox');
    box.className = 'notice web';
    box.hidden = false;
    box.innerHTML = data.ai
      ? '<b>AI 已补全</b> · 依据 ' + esc(data.provider || 'web') + ' 检索结果 + ' + esc(data.aiModel || 'AI') +
        ' 推断（' + ms + 'ms），下面是推断不是官方数据，请自行核实。'
      : '<b>已联网</b> · 但 AI 未启用（' + esc(data.aiError || '未配置') + '），下面仍是本地估算。';
  }

  /* 把 AI 的结构化结果灌进四块数据 */
  function applyAI(res, ai) {
    var mks = (ai.countries || []).map(function (c, i) {
      return { country: c.country || '', region: c.region || '', rank: i + 1, heat: 90 - i * 8,
        why: (c.why || []).slice(0, 2), entry: c.entry || '', channels: [], fit: (c.why || []).slice(0, 2).map(function (w) {
          return { aspectLabel: 'AI 推断', text: w };
        }) };
    }).filter(function (m) { return m.country; });
    if (mks.length) res.markets = mks;

    if (ai.platforms && ai.platforms.length) {
      res.aiPlatforms = ai.platforms;
    }
    var f = ai.flow || {};
    if (f.verdict || f.organic) {
      res.adStrategy = {
        verdict: f.verdict || '自然流为主',
        organic: (f.organic || []).slice(0, 2),
        paid: (f.paid || []).slice(0, 1),
        budget: '', kpi: ''
      };
    }
    if (ai.category) res.product.category = ai.category;
    res.aiUncertain = ai.uncertain || [];
  }

  function showError(title, msg) {
    showState('error');
    $('errTitle').textContent = title;
    $('errMsg').textContent = msg;
  }

  /* ---------- 渲染 ---------- */
  /* 设计：一张答案卡回答三问，顺序固定，全部首屏可见。
     其余信息（市场详情、工具、来源）收进「看细节」，不干扰首屏阅读。 */

  var PLAIN = [
    [/ACoS/g, '广告花费占比'], [/Spark Ads/g, '达人视频加热'], [/Advantage\+/g, '自动投放'],
    [/\bPPC\b/g, '站内广告'], [/P4P/g, '竞价排名'], [/\bSEO\b/g, '搜索排名'],
    [/listing/gi, '产品页'], [/再营销/g, '回头客追投'], [/视频素材/g, '视频/图片'],
    [/图片素材/g, '图片'], [/素材/g, '物料'], [/ROAS/g, '投放回报'],
    [/转化率/g, '下单率'], [/B2B/g, '企业客户'], [/意图长尾词/g, '精准关键词'],
    [/高意图/g, '有购买意向的']
  ];
  function plain(s) {
    var t = String(s == null ? '' : s);
    PLAIN.forEach(function (p) { t = t.replace(p[0], p[1]); });
    return t.replace(/\uFF08[^\uFF09]{0,30}\uFF09/g, '').trim();
  }
  function clip(str, n) {
    var t = String(str == null ? '' : str).replace(/\s+/g, ' ').trim();
    return t.length > n ? t.slice(0, n - 1) + '\u2026' : t;
  }

  /** 把 37 种 verdict 写法归一成 3 档 */
  function flowOf(ad) {
    var raw = String((ad && ad.verdict) || '');
    if (/^\u6295\u6d41\u4e3a\u4e3b|^\u6295\u6d41\u4f18\u5148/.test(raw)) return { key: 'paid', label: '\u6295\u6d41\u4e3a\u4e3b' };
    if (/^\u81ea\u7136\u6d41\u4e3a\u4e3b|^\u81ea\u7136\u6d41\u4f18\u5148/.test(raw)) return { key: 'org', label: '\u81ea\u7136\u6d41\u4e3a\u4e3b' };
    if (/^\u53cc\u8f68|\u5e76\u91cd|\u53cc\u8f6e/.test(raw)) return { key: 'mix', label: '\u4e24\u8fb9\u90fd\u8981' };
    if (/B2B|B\u7aef|\u9879\u76ee|\u6e20\u9053\u9a71\u52a8|\u6280\u672f\u4fe1\u4efb|\u5de5\u827a\u65b9\u6848|\u670d\u52a1\u9a71\u52a8/.test(raw)) return { key: 'org', label: '\u81ea\u7136\u6d41\u4e3a\u4e3b' };
    if (/\u5185\u5bb9/.test(raw)) return { key: 'org', label: '\u81ea\u7136\u6d41\u4e3a\u4e3b' };
    return { key: 'mix', label: '\u4e24\u8fb9\u90fd\u8981' };
  }

  function render(res) {
    // 地区模式：展示该地区适销商品清单
    if (res.mode === 'region') { renderRegion(res); return; }
    showState('result');
    var p = res.product || {};
    var isColloquial = res.source === 'rule' && res.poolName;
    $('pName').textContent = isColloquial ? res.poolName : (p.name || res.query);

    var isUncertain = res.source === 'rule' && res.confidence === 'low' && !res.poolId;
    $('pCat').textContent = isUncertain
      ? '\u672a\u6536\u5f55'
      : (res.source === 'rule'
          ? ('\u6309\u300c' + (res.poolName || '\u540c\u7c7b') + '\u300d\u4f30\u7b97')
          : (p.category || '\u672a\u5206\u7c7b'));
    $('tookMs').textContent = res.tookMs < 100 ? '0.0 \u79d2' : (res.tookMs / 1000).toFixed(1) + ' \u79d2';

    var b = $('srcBadge');
    if (res.source === 'kb') { b.className = 'badge kb'; b.textContent = '\u5df2\u6536\u5f55'; }
    else if (isUncertain) { b.className = 'badge rule'; b.textContent = '\u672a\u6536\u5f55'; }
    else if (res.source === 'rule') { b.className = 'badge rule'; b.textContent = '\u4f30\u7b97'; }
    else { b.className = 'badge web'; b.textContent = '\u8054\u7f51'; }

    $('noticeBox').hidden = true;
    $('platLine').innerHTML = '';
    $('moreBox').open = false;
    $('moreBox').hidden = false;
    $('relatedBox').hidden = true;

    // 未收录且 AI 尚未返回：占位等待，不提前下"查不到"结论
    if (res.source === 'rule' && res.confidence === 'low' && !res.poolId && !res.ai) {
      renderPending(res);
      return;
    }

    var mk = (res.markets || []).slice().sort(function (a, b) { return (b.heat || 0) - (a.heat || 0); });

    /* \u2460 \u54ea\u4e2a\u56fd\u5bb6 / \u5730\u533a */
    $('qa1v').innerHTML = mk.length
      ? '<div class="countries">' + mk.slice(0, 3).map(function (m, i) {
          return (i ? '<span class="sep">\u00b7</span>' : '') +
            '<span class="c' + (i === 0 ? ' top' : '') + '">' + esc(m.country) + '</span>' +
            (m.region && m.region !== '\u2014' ? '<span class="rg">' + esc(m.region) + '</span>' : '');
        }).join('') + '</div>'
      : '<span class="muted">\u6682\u65e0\u5e02\u573a\u6570\u636e</span>';

    /* \u2461 \u4e3a\u4ec0\u4e48\u597d\u5356 \u2014\u2014 \u53d6\u9996\u9009\u5e02\u573a\u6700\u8d34\u751f\u6d3b\u7684\u4e00\u6761 */
    var top = mk[0] || null;
    var why = '';
    if (top) {
      if (top.fit && top.fit.length) {
        // 优先取「日常怎么用」或「肯花多少钱」，这两类最能解释为什么好卖
        var pref = ['日常怎么用', '肯花多少钱', '当地人怎么用', '习惯'];
        var pick = null;
        for (var pi = 0; pi < pref.length && !pick; pi++) {
          pick = top.fit.filter(function (x) { return (x.aspectLabel || '').indexOf(pref[pi]) >= 0; })[0];
        }
        why = (pick || top.fit[0]).text;
      }
      else if (top.why && top.why.length) why = top.why[0];
    }
    $('qa2v').innerHTML = why
      ? esc(clip(plain(why), 64))
      : '<span class="muted">\u6682\u65e0\u539f\u56e0\u6570\u636e</span>';

    /* \u2462 \u6295\u6d41\u8fd8\u662f\u81ea\u7136\u6d41 */
    var ad = res.adStrategy;
    if (ad) {
      var f = flowOf(ad);
      var act = f.key === 'paid'
        ? ((ad.paid && ad.paid[0]) || '')
        : f.key === 'org'
          ? ((ad.organic && ad.organic[0]) || '')
          : ((ad.paid && ad.paid[0]) ? '\u5148\u6295\u6d41\uff1a' + ad.paid[0] : ((ad.organic && ad.organic[0]) || ''));
      $('qa3v').innerHTML = '<span class="flow ' + f.key + '">' + esc(f.label) + '</span>' +
        (act ? '<span class="sub">' + esc(clip(plain(act), 44)) + '</span>' : '');
    } else {
      $('qa3v').innerHTML = '<span class="muted">\u6682\u65e0\u6d41\u91cf\u5efa\u8bae</span>';
    }

    /* \u5e73\u53f0\uff1a\u53ea\u5217\u540d\u5b57 + \u4e00\u4e2a\u6807\u7b7e */
    var plats = channelList(res).slice(0, 3);
    if (plats.length) {
      $('platLine').innerHTML = '<span class="pl-label">\u5e73\u53f0</span>' + plats.map(function (pl) {
        var mode = (window.CHANNEL_PLAYBOOK.mode[pl.id] || '\u53cc\u8f68');
        var k = mode === '\u6295\u6d41\u4e3a\u4e3b' ? 'pad' : (mode === '\u81ea\u7136\u6d41\u4e3a\u4e3b' ? 'org' : 'mix');
        var t = mode === '\u6295\u6d41\u4e3a\u4e3b' ? '\u6295\u6d41' : (mode === '\u81ea\u7136\u6d41\u4e3a\u4e3b' ? '\u81ea\u7136\u6d41' : '\u53cc\u8f68');
        return '<span class="pl">' + esc(pl.name) + '<i class="' + k + '">' + t + '</i></span>';
      }).join('');
    }

    renderMarkets(res);
    renderTools(res);
    renderRelated(res);
    renderSources(res);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** \u4f4e\u7f6e\u4fe1\u515c\u5e95\uff1a\u53ea\u63d0\u793a\uff0c\u4e0d\u7ed9\u56fd\u5bb6/\u539f\u56e0/\u6295\u6d41\u7ed3\u8bba */
  /* ---------- 地区模式 ---------- */
  function renderRegion(res) {
    return regionBody(res);
  }
  // qa 块的标题节点位置不固定，统一做安全写入
  function setQTitle(id, html) {
    var card = $(id);
    if (!card) return;
    var t = card.querySelector('.q-t');
    if (!t) t = card.querySelector('.qa-t') || card;
    if (t && t !== card) t.innerHTML = html;
  }

  function regionBody(res) {
    showState('result');
    var rg = res.region || {};
    var prods = res.products || [];
    $('pName').textContent = rg.name || '地区';
    $('pCat').textContent = '该地区适销商品 · ' + prods.length + ' 个';
    var b0 = $('srcBadge');
    b0.className = 'badge kb';
    b0.textContent = '地区模式';
    $('tookMs').textContent = '秒出结果';
    $('noticeBox').hidden = true;

    // 头部：地区概况
    setQTitle('qa1', '<i class="blk-no">1</i>这个地区的市场特征');
    setQTitle('qa2', '<i class="blk-no">2</i>适合卖的商品 <span class="rg-hint">' + prods.length + ' 个 · 点开看国家/平台/流量</span>');
    $('qa1v').innerHTML = (rg.summary ? esc(rg.summary) : '') +
      (rg.markets && rg.markets.length
        ? '<div class="rg-tags" style="margin-top:6px">' + rg.markets.slice(0, 8)
            .map(function (m) { return '<span>' + esc(m) + '</span>'; }).join('') + '</div>'
        : '');

    // 商品清单：放入 platLine 上方的列表容器
    var listHtml = '<div class="rg-list">' + prods.map(function (p, i) {
      var flowCls = /自然流/.test(p.flow) ? 'org' : (/投流/.test(p.flow) ? 'paid' : 'mix');
      return '<details class="rg-item"' + (i === 0 ? ' open' : '') + '>' +
        '<summary class="rg-sum-row">' +
          '<span class="rg-rank">' + (i + 1) + '</span>' +
          '<span class="rg-name">' + esc(p.name) + '</span>' +
          '<span class="rg-cat">' + esc(p.category) + '</span>' +
          '<span class="rg-flow ' + flowCls + '">' + esc(String(p.flow).replace('为主', '')) + '</span>' +
        '</summary>' +
        '<div class="rg-body">' +
          '<div class="rg-k">为什么这个地区要</div>' +
          (p.why || []).map(function (w) { return '<p class="rg-p">' + esc(plain(w)) + '</p>'; }).join('') +
          '<div class="rg-k">最合适的国家</div>' +
          '<div class="rg-tags">' + (p.countries || []).map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' +
          '<div class="rg-k">平台与流量</div>' +
          '<div class="rg-tags">' + (p.platforms || []).map(function (c) { return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' +
          '<p class="rg-p muted">' + esc(p.flow) + (p.flowWhy ? '：' + esc(p.flowWhy) : '') + '</p>' +
          (p.entry ? '<p class="rg-p muted">怎么切：' + esc(p.entry) + '</p>' : '') +
          (p.risk ? '<p class="rg-p warn">门槛：' + esc(p.risk) + '</p>' : '') +
        '</div>' +
      '</details>';
    }).join('') + '</div>';

    $('qa2v').innerHTML = listHtml;
    $('qa3v').innerHTML = '<span class="muted">选一个商品看它的平台与流量</span>';
    $('platLine').innerHTML = '';
    $('qa1').style.display = '';
    $('qa2').style.display = '';
    $('qa3').style.display = 'none';
    $('moreBox').hidden = true;
    $('sourcesBox').hidden = true;
    $('relatedBox').hidden = true;
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /** 未收录且 AI 尚未返回：占位 + 正在检索提示 */
  function renderPending(res) {
    var msg = '<span class="muted">AI 正在查…</span>';
    $('qa1v').innerHTML = msg;
    $('qa2v').innerHTML = msg;
    $('qa3v').innerHTML = msg;
    $('platLine').innerHTML = '';
    $('noticeBox').hidden = false;
    $('noticeBox').className = 'notice web';
    $('noticeBox').innerHTML = '<b>「' + esc(res.query || '') + '」还没收录</b> · 正在联网检索 + AI 推断，约 5–20 秒…';
    $('marketList').innerHTML = '';
    $('toolList').innerHTML = '';
    $('moreBox').hidden = true;
    $('sourcesBox').hidden = true;
    $('relatedBox').hidden = true;
  }

  function renderUncertain(res) {
    $('qa1v').innerHTML = '<span class="muted">\u4e0d\u505a\u63a8\u8350</span>';
    $('qa2v').innerHTML = '<span class="muted">\u6682\u65e0\u53ef\u4fe1\u4f9d\u636e</span>';
    $('qa3v').innerHTML = '<span class="muted">\u4e0d\u7ed9\u5e73\u53f0\u5efa\u8bae</span>';
    $('platLine').innerHTML = '';
    $('noticeBox').hidden = false;
    $('noticeBox').className = 'notice rule';
    $('noticeBox').innerHTML = '<b>\u6ca1\u67e5\u5230\u300c' +
      esc(res.query || (res.product && res.product.name) || '') + '\u300d</b> \u00b7 ' +
      '\u6ca1\u5339\u914d\u5230\u4efb\u4f55\u5df2\u77e5\u54c1\u7c7b\uff0c\u6240\u4ee5\u4e0d\u7ed9\u56fd\u5bb6\u548c\u6295\u6d41\u5efa\u8bae\uff0c\u4ee5\u514d\u8bef\u5bfc\u3002' +
      '\u6362\u4e2a\u5e38\u89c1\u8bf4\u6cd5\u8bd5\u8bd5\uff0c\u4f8b\u5982\u300c\u997c\u5e72\u673a\u5668\u300d\u300c\u4fdd\u6e29\u676f\u300d\u3002';
    $('marketList').innerHTML = '';
    $('toolList').innerHTML = '';
    $('moreBox').hidden = true;
    $('sourcesBox').hidden = true;
    $('relatedBox').hidden = true;
  }

  /* ---------- \u5e73\u53f0\u5217\u8868 ---------- */
  function channelList(res) {
    var PB = window.CHANNEL_PLAYBOOK;
    if (!PB) return [];
    var cat = (res.product && res.product.category) || '';
    var ids = PB.byCategory[cat] || (res.poolId ? PB.byPool[res.poolId] : null) || null;
    if (!ids) ids = PB.byCategory['\u901a\u7528\u5e38\u9752\u54c1\u7c7b'] || ['facebook'];
    var byId = {};
    PB.platforms.forEach(function (p) { byId[p.id] = p; });
    return ids.map(function (id) { return byId[id]; }).filter(Boolean);
  }

  /* ---------- \u7ec6\u8282\uff1a\u5e02\u573a\u5361 ---------- */
  var BASIS = {
    kb: { label: '\u6709\u51fa\u5904', cls: 'kb' },
    infer: { label: '\u63a8\u6d4b', cls: 'infer' },
    ref: { label: '\u53c2\u8003', cls: 'ref' }
  };

  function fitBlock(m) {
    if (!m.fit || !m.fit.length) {
      if (!m.fitGaps || !m.fitGaps.length) return '';
      return '<div class="fit"><h5>\u5f53\u5730\u4eba\u600e\u4e48\u7528</h5>' +
        '<p class="fit-gap">\u8fd9\u4e2a\u5e02\u573a\u8fd8\u6ca1\u67e5\u5230\u751f\u6d3b\u7ec6\u8282\uff08\u7f3a\uff1a' + esc(m.fitGaps.join('\u3001')) + '\uff09\uff0c\u4e0d\u778e\u7f16\u3002</p></div>';
    }
    return '<div class="fit"><h5>\u5f53\u5730\u4eba\u600e\u4e48\u7528</h5>' +
      m.fit.map(function (f) {
        var b = BASIS[f.basis] || BASIS.infer;
        return '<div class="fit-row">' +
          '<div class="fit-t"><span class="fit-a">' + esc(f.aspectLabel) + '</span>' +
          '<span class="fit-b ' + b.cls + '">' + b.label + '</span></div>' +
          '<p class="fit-x">' + esc(f.text) + '</p></div>';
      }).join('') +
      (m.fitGaps && m.fitGaps.length
        ? '<p class="fit-gap">\u8fd8\u6ca1\u67e5\u5230\u7684\u65b9\u9762\uff1a' + esc(m.fitGaps.join('\u3001')) + '</p>' : '') +
      '</div>';
  }

  function renderMarkets(res) {
    var mk = (res.markets || []).slice().sort(function (a, b) { return (b.heat || 0) - (a.heat || 0); });
    var box = $('marketList');
    if (!box) return;
    if (!mk.length) { box.innerHTML = '<p class="fl-empty">\u6682\u65e0\u5e02\u573a\u6570\u636e</p>'; return; }

    box.innerHTML = mk.slice(0, 5).map(function (m, i) {
      var heat = Math.max(0, Math.min(100, m.heat || 60));
      return '<div class="mcard' + (i < 2 ? ' open' : '') + '">' +
        '<div class="mhead">' +
          '<div class="rank' + (i === 0 ? ' top1' : '') + '">' + (i + 1) + '</div>' +
          '<div class="mname"><b>' + esc(m.country || '\u2014') + '</b><i>' + esc(m.region || '') + '</i></div>' +
          '<div class="heat"><div class="bar"><i style="width:' + heat + '%"></i></div><span>' + heat + '</span></div>' +
        '</div>' +
        '<div class="mbody">' +
          fitBlock(m) +
          ((m.fit && m.fit.length) ? '' : '<h5>\u4e3a\u4ec0\u4e48\u9002\u5408</h5><ul>' +
            (m.why || []).map(function (w) { return '<li>' + esc(plain(w)) + '</li>'; }).join('') + '</ul>') +
          ((m.channels && m.channels.length) ?
            '<h5>\u4e3b\u8981\u6e20\u9053</h5><div class="chan">' + m.channels.map(function (c) {
              return '<span>' + esc(c) + '</span>'; }).join('') + '</div>' : '') +
          (m.entry ? '<h5>\u600e\u4e48\u5207\u8fdb\u53bb</h5><p>' + esc(plain(m.entry)) + '</p>' : '') +
          (m.risk ? '<h5>\u8981\u6ce8\u610f</h5><p>' + esc(plain(m.risk)) + '</p>' : '') +
        '</div></div>';
    }).join('');
  }

  /* ---------- \u7ec6\u8282\uff1a\u5de5\u5177 ---------- */
  function renderTools(res) {
    var tools = (res.tools || []).slice().sort(function (a, b) {
      return (a.priority || 9) - (b.priority || 9);
    }).slice(0, 6);
    var box = $('toolList');
    if (!box) return;
    if (!tools.length) { box.innerHTML = ''; return; }
    box.innerHTML = '<h5 style="font-size:11.5px;color:var(--dim);margin:4px 0 8px;font-weight:600">\u53ef\u7528\u5de5\u5177</h5>' +
      tools.map(function (t, i) {
        return '<div class="tcard">' +
          '<div class="tnum">' + (i + 1) + '</div>' +
          '<div class="tinfo"><b>' + esc(t.name) + '</b>' +
            (t.use ? '<p>' + esc(plain(t.use)) + '</p>' : '') + '</div>' +
          (t.type ? '<div class="ttype">' + esc(t.type) + '</div>' : '') +
        '</div>';
      }).join('');
  }

  /* ---------- \u7ec6\u8282\uff1a\u6765\u6e90 ---------- */
  function renderSources(res) {
    var list = (res.sources || []).slice();
    if (res.web && res.web.sources) {
      res.web.sources.forEach(function (s) {
        list.push('[\u8054\u7f51] ' + (s.title || s.url) + (s.url ? ' \u2014 ' + s.url : ''));
      });
    }
    $('sourceList').innerHTML = list.length
      ? list.map(function (s) { return '<li>' + esc(s) + '</li>'; }).join('')
      : '<li>\u672c\u9875\u7ed3\u8bba\u5f15\u7528\u672c\u5730\u77e5\u8bc6\u5e93\uff0c\u65e0\u5916\u90e8\u94fe\u63a5</li>';
  }

  /* ---------- \u76f8\u5173\u4ea7\u54c1 ---------- */
  function renderRelated(res) {
    var rel = res.related || [];
    if (!rel.length || res.source !== 'kb') { $('relatedBox').hidden = true; return; }
    $('relatedBox').hidden = false;
    $('relChips').innerHTML = rel.map(function (r) {
      return '<button data-name="' + esc(r.name) + '">' + esc(r.name) + '</button>';
    }).join('');
  }

  /* ---------- 未命中记录（供扩充知识库） ---------- */
  function reportMiss(q, res) {
    var rec = { q: q, poolId: res.poolId || null, poolName: res.poolName || null,
      confidence: res.confidence || null, at: new Date().toISOString() };
    try {
      var arr = JSON.parse(localStorage.getItem('ft_miss') || '[]');
      arr.unshift(rec);
      localStorage.setItem('ft_miss', JSON.stringify(arr.slice(0, 200)));
    } catch (e) {}
    try {
      fetch('/api/miss', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rec) }).catch(function () {});
    } catch (e) {}
  }

  /* ---------- 历史 ---------- */
  function loadHistory() {
    try { state.history = JSON.parse(localStorage.getItem('ft_history') || '[]'); } catch (e) { state.history = []; }
    renderHistory();
  }
  function pushHistory(q) {
    state.history = [q].concat(state.history.filter(function (x) { return x !== q; })).slice(0, 30);
    try { localStorage.setItem('ft_history', JSON.stringify(state.history)); } catch (e) {}
    renderHistory();
  }
  function renderHistory() {
    $('historyList').innerHTML = state.history.length ? state.history.map(function (h) {
      return '<div class="hitem" data-q="' + esc(h) + '">🔎 ' + esc(h) + '<i class="del" data-del="' + esc(h) + '">删除</i></div>';
    }).join('') : '<p class="muted" style="font-size:12px">暂无历史记录</p>';
  }
  function onHistoryClick(e) {
    var del = e.target.closest('[data-del]');
    if (del) {
      state.history = state.history.filter(function (x) { return x !== del.dataset.del; });
      try { localStorage.setItem('ft_history', JSON.stringify(state.history)); } catch (err) {}
      renderHistory();
      return;
    }
    var item = e.target.closest('[data-q]');
    if (!item) return;
    closeDrawer();
    $('q').value = item.dataset.q;
    runQuery(item.dataset.q);
  }
  function openDrawer() { $('drawer').hidden = false; $('drawerMask').hidden = false; }
  function closeDrawer() { $('drawer').hidden = true; $('drawerMask').hidden = true; }

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // sticky tabs 顶部偏移
  function syncTop() { document.documentElement.style.setProperty('--topH', ($('topbar').offsetHeight || 120) + 'px'); }
  window.addEventListener('resize', syncTop);
  document.addEventListener('DOMContentLoaded', function () { syncTop(); boot(); });
  // 调试钩子：无 AI Key 时可用它注入模拟结果，验证渲染链路
  window.__mockAI = function (q, aiPayload) {
    var res = window.Engine.query(q);
    state.last = res;
    res.web = { markets: [], notes: [], sources: [], tookMs: 1, engine: 'mock' };
    if (aiPayload && aiPayload.ai) { res.ai = aiPayload.ai; res.aiModel = aiPayload.aiModel; applyAI(res, aiPayload.ai); }
    render(res);
    return { markets: (res.markets || []).length, platforms: (res.aiPlatforms || []).length, flow: res.adStrategy && res.adStrategy.verdict };
  };
})();