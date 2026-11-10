/* 外贸市场查询引擎（纯前端、零依赖、可离线）
   ------------------------------------------------------------
   匹配优先级：
   1) 精确/别名/模糊命中知识库条目      → source: kb      （结论来自知识库）
   2) 品类级规则模板 + 外部参考数据      → source: rule    （规则推断，明确标注）
   3) 联网搜索补充（服务端代理）        → source: web     （标注来源与不确定性）
   每次返回都带 source / confidence / tookMs，UI 必须展示。
*/
(function (root) {
  'use strict';

  var KB = null;            // 扁平化后的知识库
  var READY = false;
  var POOL = [];            // 品类池（离线全量覆盖）
  var POOL_BY_ID = {};
  var COUNTRY_REF = {};
  var REGIONS = [];        // 地区定义
  var REGION_KEYS = [];    // 地区匹配键
  var REGION_DATA = [];    // 地区商品数据
  var PROVINCES = [];      // 中国省份定义
  var PROVINCE_KEYS = [];  // 省份匹配键
  var PROVINCE_DATA = [];  // 省份外贸数据
  var norm = function (s) { return String(s || '').toLowerCase().replace(/[\s\-_\/·,，。.()（）]+/g, ''); };

  /* ---------------- 索引构建 ---------------- */
  function buildIndex(entries) {
    var idx = [];
    entries.forEach(function (p, i) {
      idx.push({ key: norm(p.name), type: 'name', p: p, w: 100 });
      // 去掉括号/斜杠里的规格后缀，得到"净名"：「角磨机（100/125mm）」→「角磨机」
      var bare = norm(String(p.name || '').replace(/[（(][^）)]*[）)]/g, '').split('/')[0]);
      if (bare.length >= 2 && bare !== norm(p.name)) idx.push({ key: bare, type: 'name', p: p, w: 98 });
      // 去掉品类前缀：「宠物慢食碗」→「慢食碗」、「木质积木」保持
      var noPrefix = bare.replace(/^(宠物|猫用|狗用|儿童|婴儿|家用|商用|工业|户外|便携式?|折叠|硅胶|不锈钢|木质|汽车|电动车?|摩托车?|男式|女式|男士|女士)/, '');
      if (noPrefix.length >= 2 && noPrefix !== bare) idx.push({ key: noPrefix, type: 'core', p: p, w: 70 });
      (p.aliases || []).forEach(function (a) {
        idx.push({ key: norm(a), type: 'alias', p: p, w: 90 });
        // 别名里的顿号分隔多值（"吊床、露营吊床"）逐段入库
        String(a).split(/[、,，;；\/]/).forEach(function (part) {
          var k = norm(part);
          if (k.length >= 2 && k !== norm(a)) idx.push({ key: k, type: 'alias', p: p, w: 88 });
        });
      });
      // 去掉修饰词的核心名（如"磁吸无线充电宝"→"充电宝"），让口语查询也能命中
      var core = norm(p.name).replace(/^(氮化镓多口|磁吸无线|真无线|电竞游戏|便携式|可折叠|多合一|车载|便携|户外储能|电动自行车)/, '')
        .replace(/(套装|整套解决方案|与支架|与转向灯|方案|配件)$/, '');
      if (core && core.length >= 2 && core !== norm(p.name)) idx.push({ key: core, type: 'core', p: p, w: 80 });
      idx.push({ key: norm(p.category), type: 'category', p: p, w: 30 });
    });
    return idx;
  }

  function init(catalog) {
    KB = catalog;
    var all = [];
    (catalog.categories || []).forEach(function (c) {
      (c.products || []).forEach(function (p) { p._cat = c.name; p._catKey = c.key; all.push(p); });
    });
    KB._all = all;
    KB._index = buildIndex(all);
    KB._alias = Object.assign({}, (root.ALIAS_INDEX_EXT || {}), (root.ALIAS_INDEX || {}));
    KB._aliasNorm = {};
    Object.keys(KB._alias).forEach(function (k) { KB._aliasNorm[norm(k)] = KB._alias[k]; });
    KB._byId = {};
    all.forEach(function (p) { KB._byId[p.id] = p; });

    // 品类池：知识库未命中的产品用它补齐"为什么 / 工具 / 流量"三块，保证离线也有完整结构
    var pool = catalog.pool || { categories: [], regions: [] };
    POOL = pool.categories || [];
    POOL_BY_ID = {};
    POOL.forEach(function (c) { POOL_BY_ID[c.id] = c; });
    (pool.regions || []).forEach(function (r) { COUNTRY_REF[r.name] = r; });

    // 地区索引（用户搜"欧洲/美国/东南亚"时走地区模式）
    REGION_DATA = (catalog.regions || []).slice();
    REGIONS = (root.REGIONS && root.REGIONS.list) || [];
    REGION_KEYS = [];
    REGIONS.forEach(function (r) {
      (r.keys || []).forEach(function (k) {
        REGION_KEYS.push({ key: norm(k), region: r, w: k.length });
      });
    });

    // 省份索引（搜"河南/吉林"时走省份模式）
    PROVINCE_DATA = (catalog.provinces || []).slice();
    PROVINCES = (root.PROVINCES && root.PROVINCES.list) || [];
    PROVINCE_KEYS = [];
    PROVINCES.forEach(function (pv) {
      (pv.keys || []).forEach(function (k) { PROVINCE_KEYS.push({ key: norm(k), province: pv, w: k.length }); });
    });

    READY = true;
    return { products: all.length, keys: Object.keys(KB._aliasNorm).length, pool: POOL.length,
      regions: REGIONS.length, provinces: PROVINCES.length };
  }

  /* ---------------- 口语归一化 ---------------- */
  // "我是做饼干机器的" → 去壳 "饼干机器" → 术语表 → 标准词集合
  // 术语值格式："标准名 英文/品类词 [@期望品类id]"
  var STOP = /^(我是|我们|是|在|专门|只|主要|做|生产|制造|卖|出口|外贸|厂家|工厂|别人|人家|给|帮|的|机器|设备|产品|生意|行业|加工|代工|搞|弄|什么|那种|这种|一个|公司|老板|批发|零售|货|东西)+$/;

  function stripWrapper(s) {
    var W = root.SYNONYM_WRAPPERS || [];
    var out = s;
    for (var pass = 0; pass < 4; pass++) {
      var before = out;
      for (var i = 0; i < W.length; i++) out = out.replace(W[i], '');
      out = out.trim();
      if (out === before) break;
    }
    return out || s;
  }

  function parseSyn(v) {
    var exp = null;
    var t = String(v || '');
    var m = t.match(/@([a-z0-9-]+)\s*$/i);
    if (m) { exp = m[1]; t = t.slice(0, m.index); }
    var tokens = t.split(/\s+/).filter(Boolean);
    return { raw: t, tokens: tokens, expected: exp };
  }

  function synonymTable() {
    if (_SYNTAB) return _SYNTAB;
    _SYNTAB = {};
    var a = root.SYNONYMS || {}, b = root.SYNONYM_NODES || {};
    Object.keys(b).forEach(function (k) { _SYNTAB[k] = b[k]; });
    Object.keys(a).forEach(function (k) { _SYNTAB[k] = a[k]; });
    return _SYNTAB;
  }
  var _SYNTAB = null;

  function normalize(input) {
    var syn = synonymTable();
    var s = String(input || '').trim();
    var stripped = stripWrapper(s);

    // 1. 整句 / 去壳后精确命中术语表
    var term = syn[s] ? s : (syn[stripped] ? stripped : null);
    var via = syn[s] ? 'synonym-exact' : 'synonym-strip';

    // 2. 句内含术语：取最长命中（"灯带"优先于"灯"）
    if (!term) {
      var keys = Object.keys(syn).sort(function (a, b) { return b.length - a.length; });
      for (var i = 0; i < keys.length; i++) {
        if (stripped.indexOf(keys[i]) >= 0 || s.indexOf(keys[i]) >= 0) { term = keys[i]; via = 'synonym-contains'; break; }
      }
    }
    if (!term) return { text: stripped, via: 'none', tokens: [], expected: null };

    var p = parseSyn(syn[term]);
    // 把命中词从句子里去掉，剩余部分若还有实质内容（非停用词）保留为补充线索
    var rest = s.replace(term, '').trim();
    var restWords = rest.split(/[\s,，]+/).filter(function (w) { return w && !STOP.test(w); });
    return {
      text: p.tokens.join(' '),
      tokens: p.tokens.concat(restWords),
      expected: p.expected,
      term: term,
      via: via
    };
  }


  /** 宽泛品类词：指向"一个类目"而不是某个 SKU，应走品类池而不是硬套产品条目 */
  var BROAD_CATEGORY_TERMS = [
    '汽配','汽车配件','五金','五金工具','家纺','家居',
    '家居用品','服装','女装','男装','童装','鞋','包','床品',
    '小家电','家电','定制家具','家具','玩具','婴儿','母婴',
    '宠物','宠物用品','礼品','办公','文具','户外','运动'
  ];
  /** 明确指向具体产品的词：即使很短也不当作宽泛品类 */
  var DIRECT_PRODUCT_HINTS = {};

  /* ---------------- 省份解析 ---------------- */
  function resolveProvince(input) {
    if (!PROVINCE_KEYS.length) return null;
    var q = norm(input);
    if (!q) return null;
    var exact = null, contains = null;
    PROVINCE_KEYS.forEach(function (k) {
      if (k.key === q) { if (!exact || k.w > exact.w) exact = k; }
      else if (k.key.length >= 2 && (q.indexOf(k.key) >= 0 || k.key.indexOf(q) >= 0)) {
        if (!contains || k.w > contains.w) contains = k;
      }
    });
    var hit = exact || contains;
    return hit ? hit.province : null;
  }

  function queryProvince(input) {
    var t0 = (root.performance || Date).now();
    var pv = resolveProvince(input);
    if (!pv) return null;
    var data = null;
    PROVINCE_DATA.forEach(function (d) { if (d && (d.province === pv.name || d.id === pv.id)) data = d; });
    if (!data) {
      return finish({ ok: true, mode: 'province', source: 'province', confidence: 'low',
        province: { id: pv.id, name: pv.name }, products: [], baseProducts: [],
        message: '这个省的外贸库还在补' }, t0, input);
    }
    var prods = (data.exportTo || []).map(function (p, i) {
      return { rank: i + 1, name: p.name, category: p.category || '', why: [p.why],
        countries: p.target || [], platforms: p.platforms || [],
        flow: p.flow || '双轨并行', flowWhy: p.flowWhy || '', risk: p.risk || '' };
    });
    return finish({ ok: true, mode: 'province', source: 'province',
      confidence: data.confidence || 'medium',
      province: { id: pv.id, name: data.province || pv.name, summary: data.summary || '',
        logistics: data.logistics || '', baseProducts: data.baseProducts || [] },
      products: prods, sources: data.sources || [] }, t0, input);
  }

  /* ---------------- 地区解析 ---------------- */
  function resolveRegion(input) {
    if (!REGION_KEYS.length) return null;
    var q = norm(input);
    if (!q) return null;
    var exact = null, contains = null;
    REGION_KEYS.forEach(function (k) {
      if (k.key === q) { if (!exact) exact = k.region; }
      else if (!contains && k.key.length >= 2 && (q.indexOf(k.key) >= 0 || k.key.indexOf(q) >= 0)) contains = k.region;
    });
    return exact || contains;
  }

  // 地区模式：该地区适销商品 + 每件商品的国家/原因/平台/流量
  function queryRegion(input) {
    var t0 = (root.performance || Date).now();
    var region = resolveRegion(input);
    if (!region) return null;
    var data = null;
    // 各 agent 产出的 id 不一致（europe / kb2-region-europe / kb3-region-seasia）
    // 用地区中文名做唯一锚点，避免 id 对不上导致空结果
    REGION_DATA.forEach(function (d) {
      if (!d) return;
      if (d.region === region.name || d.id === region.id) data = d;
    });
    if (!data) {
      return finish({ ok: true, mode: 'region', source: 'region', confidence: 'low',
        region: { id: region.id, name: region.name }, products: [],
        message: '这个地区的商品库还在补' }, t0, input);
    }
    var prods = (data.products || []).map(function (p, i) {
      return { rank: i + 1, name: p.name, en: p.en || '', category: p.category || '',
        why: (p.why || []).slice(0, 2), countries: p.countries || [], platforms: p.platforms || [],
        flow: p.flow || '双轨并行', flowWhy: p.flowWhy || '', entry: p.entry || '', risk: p.risk || '' };
    });
    return finish({ ok: true, mode: 'region', source: 'region',
      confidence: data.confidence || 'medium',
      region: { id: region.id, name: data.region || region.name,
        markets: data.markets || [], summary: data.summary || '' },
      products: prods, sources: data.sources || [] }, t0, input);
  }


  // 地区模式：该地区适销商品 + 每件商品的国家/原因/平台/流量
  function queryRegion(input) {
    var t0 = (root.performance || Date).now();
    var region = resolveRegion(input);
    if (!region) return null;
    var data = null;
    // 各 agent 产出的 id 不一致（europe / kb2-region-europe / kb3-region-seasia）
    // 用地区中文名做唯一锚点，避免 id 对不上导致空结果
    REGION_DATA.forEach(function (d) {
      if (!d) return;
      if (d.region === region.name || d.id === region.id) data = d;
    });
    if (!data) {
      return finish({ ok: true, mode: 'region', source: 'region', confidence: 'low',
        region: { id: region.id, name: region.name }, products: [],
        message: '这个地区的商品库还在补' }, t0, input);
    }
    var prods = (data.products || []).map(function (p, i) {
      return { rank: i + 1, name: p.name, en: p.en || '', category: p.category || '',
        why: (p.why || []).slice(0, 2), countries: p.countries || [], platforms: p.platforms || [],
        flow: p.flow || '双轨并行', flowWhy: p.flowWhy || '', entry: p.entry || '', risk: p.risk || '' };
    });
    return finish({ ok: true, mode: 'region', source: 'region',
      confidence: data.confidence || 'medium',
      region: { id: region.id, name: data.region || region.name,
        markets: data.markets || [], summary: data.summary || '' },
      products: prods, sources: data.sources || [] }, t0, input);
  }

  /* ---------------- 产品解析 ---------------- */
  // 返回 { entry, score, via } 或 null
  /** 繁体 → 简体（只覆盖常见用字，够用且不引入依赖） */
  var T2S = {
    '燈': '灯', '帶': '带', '機': '机', '電': '电', '車': '车', '錢': '线', '線': '线',
    '鍋': '锅', '濾': '滤', '網': '网', '鏡': '镜', '錶': '表', '裝': '装', '飾': '饰',
    '鏈': '链', '釘': '钉', '鋸': '锯', '鐵': '铁', '鋼': '钢', '銅': '铜', '鋁': '铝',
    '壓': '压', '縮': '缩', '氣': '气', '體': '体', '溫': '温', '熱': '热', '爐': '炉',
    '麵': '面', '餅': '饼', '乾': '干', '糧': '粮', '油': '油', '劑': '剂', '藥': '药',
    '飲': '饮', '產': '产', '業': '业', '廠': '厂', '貿': '贸', '買': '买', '賣': '卖',
    '環': '环', '衛': '卫', '廚': '厨', '櫃': '柜', '門': '门', '蓋': '盖', '盤': '盘',
    '籃': '篮', '箱': '箱', '層': '层', '疊': '叠', '層': '层', '麥': '麦', '醬': '酱',
    '嬰': '婴', '兒': '儿', '媽': '妈', '寵': '宠', '貓': '猫', '狗': '狗', '頭': '头',
    '髮': '发', '髮': '发', '膚': '肤', '妝': '妆', '價': '价', '格': '格', '數': '数',
  };
  function toSimplified(s) {
    var out = '';
    for (var i = 0; i < s.length; i++) { var c = s.charAt(i); out += (T2S[c] || c); }
    return out;
  }

  function resolveProduct(input) {
    if (!READY) return null;
    var q = norm(input);
    if (!q) return null;

    // 0. 繁体先转简体再查（"LED燈帶" → "led灯带"）
    if (/[一-鿿]/.test(q)) {
      var simplified = norm(toSimplified(q));
      if (simplified && simplified !== q) {
        var tradHit = lookup(simplified);
        if (tradHit && /^(exact|alias|core)$/.test(tradHit.via)) { tradHit.via = 'trad-' + tradHit.via; return tradHit; }
      }
    }

    // 0a0. 混写输入（"LED灯带strip"）：找出"被输入完整包含"的最长索引键，
    //      长度 >= 4 才采信，避免被更短更泛的词（"LED灯"）抢走。
    var longestContained = null;
    KB._index.forEach(function (it) {
      if (it.type === 'category' || it.w < 80 || it.key.length < 4) return;
      if (q.indexOf(it.key) < 0) return;
      if (!longestContained || it.key.length > longestContained.key.length) longestContained = it;
    });
    if (longestContained && longestContained.key.length < q.length) {
      return { entry: longestContained.p, score: 0.92, via: 'contained-in-input' };
    }

    // 0a. 输入本身就是知识库里的产品名/别名 → 直接命中，绝不让翻译层改写
    var direct = lookup(q);
    if (direct && (direct.via === 'exact' || direct.via === 'alias' || direct.via === 'core')) return direct;

    // 0a'. 斜杠分隔的长别名（"Water Purifier / Under Sink RO Water Filter"）逐段再查一次
    if (q.indexOf('/') >= 0) {
      var parts = q.split('/');
      for (var pi = 0; pi < parts.length; pi++) {
        if (parts[pi].length < 3) continue;
        var ph = lookup(parts[pi]);
        if (ph && (ph.via === 'exact' || ph.via === 'alias' || ph.via === 'core' || ph.via === 'contains')) return ph;
      }
    }

    // 0a''. 口语外壳剥离后直查：「做压蒜器的」→「压蒜器」→ 知识库
    if (!direct) {
      var shell = String(input)
        .replace(/^(我是|我们|是|在|专门|只|主要|做|生产|制造|卖|出口|外贸|厂家|工厂|别人|人家|给|帮|搞|弄)+/g, '')
        .replace(/(的|机器|设备|产品|生意|行业|厂家|工厂|货)+$/g, '')
        .trim();
      // 多层剥壳：「做打包餐盒的」→「打包餐盒」；再剥一次得到「餐盒」
      var shells = [shell];
      var shell2 = shell.replace(/^(一次性|可重复使用|手动|电动|迷你|大容量|加厚|双层|防滑|防水|厨房|仓储|物流|包装|农用|园艺)/, '').trim();
      if (shell2 && shell2.length >= 2 && shell2 !== shell) shells.push(shell2);

      for (var si = 0; si < shells.length; si++) {
        var sh = shells[si];
        // 泛品类词（"做服装的"→"服装"）交给品类池，不硬套某个具体品
        if (BROAD_CATEGORY_TERMS.indexOf(norm(sh)) >= 0) {
          var syn2 = (root.SYNONYMS || {})[sh];
          if (syn2) {
            return { entry: null, broad: true, expected: (String(syn2).match(/@([a-z0-9-]+)/) || [])[1] || null,
              label: sh, score: 0.5, via: 'broad-category' };
          }
        }
        var shellHit = lookup(norm(sh), true);
        if (shellHit && (shellHit.via === 'exact' || shellHit.via === 'alias' || shellHit.via === 'core')) {
          return shellHit;
        }
      }
      // 外壳整体精确命中别名表（不做 contains，避免"包"字误抢）
      var shellWhole = lookup(norm(shell), true);
      if (shellWhole && (shellWhole.via === 'exact' || shellWhole.via === 'alias')) return shellWhole;
    }

    // 0b. 口语/翻译层：把说法翻译成标准词，再查知识库（避免落到通用规则）
    var nz = normalize(input);

    // 只用"第一词"=标准名去精确/别名匹配，后面的词只是英文与品类线索，不参与命中，
    // 否则"饼干生产线"里的"包装机"会抢走结果
    if (nz.term && nz.tokens.length) {
      var nq0 = norm(nz.tokens[0]);
      var nHit0 = nq0 && nq0 !== q ? lookup(nq0, true) : null;
      if (nHit0 && (nHit0.via === 'exact' || nHit0.via === 'alias' || nHit0.via === 'core')) {
        nHit0.via = nz.via + ':' + nz.term;
        nHit0.synonym = nz;
        return nHit0;
      }
    }

    // 0b''. 术语表只做了"包含匹配"（如"包"字命中"帆布托特包"）时，
    //        先试一次"整句剥壳 → 别名精确命中"，避免单字术语抢走结果
    if (nz.via === 'synonym-contains' && String(nz.term || '').length <= 1) {
      // 单字术语（"包""机""灯"）不做最终裁决，交给后续别名/品类逻辑
      nz = { text: '', tokens: [], expected: null, via: 'none' };
    }
    if (nz.via === 'synonym-contains') {
      var shellAll = q.replace(/^(我是|我们|是|在|专门|只|主要|做|生产|制造|卖|出口|外贸|厂家|工厂|别人|人家|给|帮|搞|弄)+/g, '')
                         .replace(/(的|机器|设备|产品|生意|行业|厂家|工厂|货)+$/g, '');
      var aliasHit = lookup(shellAll, true);
      if (aliasHit && (aliasHit.via === 'exact' || aliasHit.via === 'alias')) return aliasHit;
      // 逐段递进剥前缀再试
      var noPre = shellAll.replace(/^(一次性|可重复使用|手动|电动|迷你|大容量|加厚|双层|防滑|防水|厨房|仓储|物流|包装|农用|园艺)/, '');
      if (noPre !== shellAll) {
        var aliasHit2 = lookup(noPre, true);
        if (aliasHit2 && (aliasHit2.via === 'exact' || aliasHit2.via === 'alias')) return aliasHit2;
      }
    }

    // 0b'. 宽泛品类词（"汽配""五金""3C配件"）：不落到某个具体 SKU，交给品类池。
    //      但必须先确认"没有产品级精确命中"——否则会把"宠物用品"（pet-feeder 的别名）
    //      这种有实体的词错误降级成品类推断。
    if (nz.term && nz.expected && BROAD_CATEGORY_TERMS.indexOf(norm(input)) >= 0) {
      // 只有"产品名净名恰好等于该词"才算真产品命中；"宠物服装"这种带前缀的具体品
      // 不该抢走"服装"这个泛品类词
      var exactProduct = lookup(q);
      var realProduct = false;
      if (exactProduct && /^(exact|alias|core)$/.test(exactProduct.via)) {
        var bn = norm(String(exactProduct.entry.name || '').replace(/[（(][^）)]*[）)]/g, ''));
        if (bn === norm(input)) realProduct = true;
      }
      if (!realProduct) {
        return { entry: null, broad: true, expected: nz.expected, label: nz.tokens[0], score: 0.5, via: 'broad-category' };
      }
    }

    // 0c. 多词英文兜底："cookie machine" → 逐词查，全部可解释才命中
    var multi = lookupMultiWord(q);
    if (multi) return multi;

    return direct || lookup(q);
  }

  // 标准词查找：精确 → 别名 → 包含 → 编辑距离
  // strict=true 用于翻译层：不允许"反向包含"和过于宽松的模糊命中
  function lookup(q, strict) {
    if (!q) return null;
    // 1. 精确命中：产品级键（名称/别名/核心名）优先，category 键只在没有产品级命中时才考虑。
    //    必须先剔除 category 键再比较权重，否则 "宠物用品" 会被 pet-feeder 的
    //    category 标签（w=30）判成"品类级查询"，从而漏掉它在别名表里的真实指向。
    var exactAll = KB._index.filter(function (i) { return i.key === q; });
    var exactProduct = exactAll.filter(function (i) { return i.type !== 'category'; });
    // 泛品类词优先：查询"服装"时，不应命中"宠物服装"（core 键 w=70）
    if (BROAD_CATEGORY_TERMS.indexOf(q) >= 0 && exactProduct.length) {
      var strictHits = exactProduct.filter(function (i) {
        var bn = norm(String(i.p.name || '').replace(/[（(][^）)]*[）)]/g, ''));
        return bn === q || i.type === 'name';
      });
      exactProduct = strictHits;
    }
    if (exactProduct.length) {
      var maxW = Math.max.apply(null, exactProduct.map(function (i) { return i.w; }));
      exactProduct = exactProduct.filter(function (i) { return i.w === maxW; });
      exactProduct.sort(function (a, b) { return (b.type === 'name' ? 1 : 0) - (a.type === 'name' ? 1 : 0); });
      return best(exactProduct, 1.0, 'exact');
    }

    // 2. 别名表 → 知识库 id
    var mappedId = KB._aliasNorm[q];
    if (mappedId && KB._byId[mappedId]) return { entry: KB._byId[mappedId], score: 0.98, via: 'alias' };
    // 别名指向品类词（如 t恤→t恤）：交给品类池，不硬套某个具体条目
    if (mappedId && !KB._byId[mappedId]) return null;   // 指向品类关键词，交给品类池

    // 2'. 只剩 category 键命中 → 是一个品类级查询，交给品类池
    if (exactAll.length) return null;

    // 3. 包含关系：知识库名称/别名包含查询词（"饼干机" ⊂ "饼干生产线"）
    //    只允许"输入 ⊂ 索引键"这一个方向，避免短词反向吞掉长句
    if (q.length >= 2) {
      // 索引键包含整段输入的候选；并且必须与输入至少共享 70% 字符，
      // 防止"便携蓝牙音箱"这种完整产品名被更短的同品类词截走
      var cands = KB._index.filter(function (i) {
        if (i.type === 'category' || i.key.length < 2) return false;
        if (i.key.indexOf(q) < 0) return false;
        var shared = 0, chars = {};
        for (var x = 0; x < q.length; x++) chars[q.charAt(x)] = 1;
        for (var y = 0; y < i.key.length; y++) if (chars[i.key.charAt(y)]) shared++;
        return shared / i.key.length >= 0.7;
      });
      // 优先取最接近的（索引键长度最短的那个），同长度按权重
      if (cands.length) {
        cands.sort(function (a, b) { return (a.key.length - b.key.length) || (b.w - a.w); });
        return { entry: cands[0].p, score: 0.72, via: 'contains', cands: cands };
      }
    }

    // 4. 编辑距离：只对长度 ≥3 的中英文串做，且要求长度接近 + 首字符一致
    if (strict) return null;
    if (q.length >= 3) {
      var fuzzy = [];
      KB._index.forEach(function (i) {
        if (i.type === 'category' || i.key.length < 3) return;
        if (Math.abs(i.key.length - q.length) > 2) return;
        if (i.key.charAt(0) !== q.charAt(0)) return;
        // 语义错配防护：「灌装机」不能模糊到「灌肠机」——共有的字要在 60% 以上
        var same = 0;
        for (var ci = 0; ci < q.length; ci++) if (i.key.indexOf(q.charAt(ci)) >= 0) same++;
        if (same / q.length < 0.7) return;
        // 关键尾字必须一致：「灌装机」vs「灌肠机」尾字机相同但中段不同，再看长度
        if (i.key.length !== q.length && same / q.length < 0.85) return;
        var d = dist(q, i.key);
        if (d <= Math.max(1, Math.floor(Math.min(q.length, i.key.length) / 4))) fuzzy.push({ i: i, d: d });
      });
      if (fuzzy.length) {
        fuzzy.sort(function (a, b) { return a.d - b.d; });
        // 只在"唯一最优"时采用；并列最优视为歧义，不猜
        if (fuzzy.length === 1 || fuzzy[0].d < fuzzy[1].d) return { entry: fuzzy[0].i.p, score: 0.6, via: 'fuzzy' };
      }
    }
    return null;
  }

  /**
   * 多词查询兜底：把 "cookie machine" 这类切词输入逐个词查别名/名称，
   * 全部词都能解释时才认定命中，避免 cookie≈coffee 这种单点模糊错配。
   * 只用于"整串查不到"之后，不影响现有的精确/别名/包含逻辑。
   */
  function lookupMultiWord(q) {
    if (!/[a-z]/.test(q) || q.length < 6) return null;
    var words = q.split(/[^a-z0-9]+/).filter(function (w) { return w.length >= 3; });
    if (words.length < 2) return null;

    var perWord = words.map(function (w) {
      var hit = null;
      // 每个词只接受 别名 / 名称 的精确或前缀命中，绝不走编辑距离
      if (KB._aliasNorm[w] && KB._byId[KB._aliasNorm[w]]) hit = { entry: KB._byId[KB._aliasNorm[w]], full: true };
      if (!hit) {
        var cands = KB._index.filter(function (i) {
          return i.type !== 'category' && i.w >= 80 && i.key.indexOf(w) >= 0;
        });
        if (cands.length) {
          // 取被该词覆盖比例最高的键
          cands.sort(function (a, b) { return (a.key.length - b.key.length) || (b.w - a.w); });
          hit = { entry: cands[0].p, full: cands[0].key === w };
        }
      }
      return hit;
    });

    if (perWord.some(function (h) { return !h; })) return null;

    // 所有词都指向同一条目 → 强命中；否则取"完整覆盖词"最多的条目且要求一致
    var counts = {};
    perWord.forEach(function (h) { counts[h.entry.id] = (counts[h.entry.id] || 0) + (h.full ? 2 : 1); });
    var ranked = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    if (ranked.length > 1 && counts[ranked[0]] === counts[ranked[1]]) return null; // 歧义，不猜
    var winner = KB._byId[ranked[0]];
    if (!winner) return null;
    return { entry: winner, score: 0.85, via: 'multiword' };
  }

  function best(list, score, via) {
    list.sort(function (a, b) { return b.w - a.w; });
    return { entry: list[0].p, score: score, via: via };
  }

  /* ---------------- 品类池匹配 ---------------- */
  function matchPool(input, penalty) {
    // 只在"产品级匹配全部失败"时启用，因此这里可以比较宽松：
    // 只要用户输入里出现了某品类的关键词，就认为属于该品类
    // penalty：来自翻译层的标准词，比原始口语输入更可信，扣分更少
    var q = norm(input), bestC = null, bestScore = 0;
    var pen = typeof penalty === 'number' ? penalty : 0;
    POOL.forEach(function (c) {
      var score = 0;
      (c.keywords || []).forEach(function (k) {
        var kk = norm(k);
        if (!kk) return;
        // 关键词出现在输入里：越长越可信（"猫爬架" > "猫"）
        // 输入整体较短且被关键词包含：给低分，只作兜底
        if (q.indexOf(kk) >= 0) score = Math.max(score, 80 + Math.min(20, kk.length));
        else if (kk.indexOf(q) >= 0 && q.length >= 2) score = Math.max(score, 30 + q.length * 4);
      });
      score -= pen;
      if (score > bestScore) { bestScore = score; bestC = c; }
    });
    return bestC ? { cat: bestC, score: bestScore } : null;
  }

  function dist(a, b) {
    if (Math.abs(a.length - b.length) > 3) return 99;
    var m = a.length, n = b.length, prev = [], cur = [], i, j;
    for (j = 0; j <= n; j++) prev[j] = j;
    for (i = 1; i <= m; i++) {
      cur[0] = i;
      for (j = 1; j <= n; j++) {
        cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      }
      prev = cur.slice();
    }
    return prev[n];
  }

  /* ---------------- 规则推断层 ---------------- */
  // 用户输入里是否含有能识别的"产品语义"
  // 高频单字品类词：单独输入也承认它是产品语义（"锅""灯""鞋"）
  var SINGLE_CHAR_TERMS = '锅灯鞋包猫狗杯表锁床椅桌柜门窗镜盒箱袋刀剪钉网线轮泵阀管板纸布线纱';
  function recognized(input) {
    var s = String(input || '').trim();
    if (/[一-龥]{2,}/.test(s)) return true;            // 至少两个连续汉字
    if (/[a-zA-Z]{3,}/.test(s)) return true;                     // 至少三个连续字母
    if (s.length === 1 && SINGLE_CHAR_TERMS.indexOf(s) >= 0) return true;  // 高频单字品类
    return false;
  }

  function infer(input) {
    if (!recognized(input)) {
      return {
        source: 'rule', unrecognized: true, category: '—',
        markets: [], tools: [], adStrategy: null, sources: [], tags: [], confidence: 'low',
        reason: '该输入不像产品名称（纯数字/符号/过短），未做任何推断，以免给出误导性结论。'
      };
    }
    var R = root.RULES, REF = root.REF;
    var tags = [], cat = '通用消费品';
    R.productSignals.forEach(function (s) {
      if (s.re.test(input)) { tags = tags.concat(s.tags); if (cat === '通用消费品') cat = s.cat; }
    });
    tags = tags.length ? uniq(tags) : ['ecom_mature', 'price_sensitive'];
    var regions = Object.keys(R.regionProfiles).map(function (r) {
      var prof = R.regionProfiles[r];
      var hit = prof.drivers.filter(function (d) { return tags.indexOf(d) >= 0; });
      return { region: r, hit: hit.length, drivers: prof.drivers, note: prof.note };
    }).sort(function (a, b) { return b.hit - a.hit; });

    var top = regions.slice(0, 3).map(function (r) {
      var cs = (REF.countries || []).filter(function (c) { return c.region === r.region; })
        .sort(function (a, b) { return b.gdpPc - a.gdpPc; }).slice(0, 3);
      return {
        region: r.region,
        countries: cs.map(function (c) { return c.name; }),
        why: r.drivers.slice(0, 3).map(function (d) { return R.demandDrivers[d] || d; }),
        note: r.note,
        heat: Math.min(95, 45 + r.hit * 12)
      };
    });
    var adopt = R.adRule(0, cat);
    // 品类池：术语表给出的目标品类优先级最高（"做饼干机器的" → @bakery），
    // 该品类未建池时用它的标准名做关键词匹配；最后才用原始输入兜底
    var nzText = normalize(input);
    var pool = null;
    if (nzText.expected && POOL_BY_ID[nzText.expected]) {
      pool = { cat: POOL_BY_ID[nzText.expected], score: 100 };
    } else if (nzText.expected) {
      // 目标品类尚未建池（如烘焙换成了"食品加工"池）：用标准名做关键词匹配，
      // 而不是放任落到通用规则
      pool = matchPool(nzText.text, 25);
    }
    if (!pool || !pool.cat) {
      pool = matchPool(nzText.text, 40) || matchPool(nzText.tokens.join(' '), 40) || matchPool(input);
    }
    if (pool && !pool.cat) pool = null;

    // 有品类池模板：用真实国家排序 + 品类自带的渠道/工具/流量结构，可信度直升到 medium
    if (pool) {
      var pc = pool.cat;
      var regionsRanked = (pc.regions || []).map(function (rid) {
        var rp = R.regionProfiles[rid] || { drivers: [], note: '' };
        var hit = rp.drivers.filter(function (d) { return tags.indexOf(d) >= 0; }).length;
        return { rid: rid, hit: hit };
      }).sort(function (a, b) { return b.hit - a.hit; });

      var picked = [];
      regionsRanked.forEach(function (rr) {
        (COUNTRY_LIST[rr.rid] || []).forEach(function (n) { if (picked.indexOf(n) < 0) picked.push(n); });
      });
      picked = picked.slice(0, 6);

      var mk = picked.map(function (name, i) {
        var ref = COUNTRY_REF[name] || {};
        var rp = (pc.regions && pc.regions[i % pc.regions.length]) || pc.regions[0];
        var prof = R.regionProfiles[ref.region] || { note: '' };
        return {
          region: ref.region || '—', country: name, rank: i + 1,
          heat: Math.max(55, 92 - i * 6),
          why: (ref.region && prof.note ? [prof.note] : []).concat(pc.why || []).slice(0, 3),
          channels: pc.channels || [],
          entry: (pc.entry || '') + (ref.lang ? '；本地语言：' + ref.lang : ''),
          risk: (pc.risk || '') + (ref.gdpPc ? '；当地人均 GDP 约 ' + ref.gdpPc.toLocaleString() + ' 美元，注意价格带' : '')
        };
      });

      return {
        source: 'rule', confidence: 'medium', category: cat, tags: tags, poolId: pc.id, poolName: pc.label, matchedBy: 'pool'
        ,
        markets: mk, marketChannels: pc.channels || [],
        marketChannels: pc.channels || [],
        adStrategy: pc.adStrategy || { verdict: adopt.verdict, paid: [adopt.why], organic: [], budget: '', kpi: '' },
        tools: pc.tools || defaultTools(cat),
        sources: ['品类池模板：' + pc.label + '（规则推断，非收录结论）'].concat(pc.sources || [])
      };
    }

    return {
      source: 'rule', confidence: 'low', category: cat, tags: tags,
      markets: top.map(function (m, i) {
        return { region: m.region, country: (m.countries || [])[0] || '—', rank: i + 1, heat: m.heat,
          why: m.why, channels: ['平台站内（Amazon / 区域平台）', '独立站 + 社媒'], entry: m.note, risk: '需按当地认证与税务补齐合规' };
      }),
      adStrategy: { verdict: adopt.verdict, paid: [adopt.why], organic: ['用本地语言做站点 SEO 与社媒内容承接'], budget: '先小预算（500-1000 美元）测试 2-3 个 SKU', kpi: 'ACoS < 25%，首月转化率 > 5%' },
      tools: defaultTools(cat),
      sources: ['规则库推断', 'World Bank / REST Countries 参考数据']
    };
  }

  var COUNTRY_LIST = {
    "北美洲": ["美国", "加拿大", "墨西哥"],
    "欧洲": ["德国", "英国", "法国", "意大利", "西班牙", "荷兰", "波兰", "瑞典", "俄罗斯"],
    "亚洲": ["日本", "韩国", "新加坡", "马来西亚", "泰国", "越南", "印度尼西亚", "菲律宾", "印度"],
    "中东": ["阿联酋", "沙特阿拉伯", "土耳其", "以色列"],
    "拉丁美洲": ["巴西", "智利", "墨西哥", "阿根廷"],
    "大洋洲": ["澳大利亚", "新西兰"],
    "非洲": ["南非", "肯尼亚", "尼日利亚", "埃及"]
  };

  function defaultTools(cat) {
    var b2b = /工业|机械|仪器|新能源/.test(cat);
    return b2b ? [
      { name: 'Alibaba.com / Made-in-China', type: 'B2B', use: '主站询盘，配 RFQ 反向报价', priority: 1 },
      { name: 'LinkedIn', type: '社交', use: '按采购/工程职位定向触达', priority: 2 },
      { name: 'Google Ads（Search）', type: '投流', use: '高意图关键词承接询盘', priority: 3 },
      { name: '展会（Canton Fair / 行业展）', type: '展会', use: '大客户通道', priority: 4 }
    ] : [
      { name: 'Amazon Seller Central', type: 'B2C', use: '主力渠道，FBA 抓 Buy Box', priority: 1 },
      { name: 'TikTok Shop + 短视频', type: '社交', use: '内容测款，达人分销', priority: 2 },
      { name: 'Meta Ads（FB/IG）', type: '投流', use: '兴趣定向测试素材', priority: 3 },
      { name: 'Shopify 独立站', type: '独立站', use: '沉淀私域与复购', priority: 4 },
      { name: 'Google Shopping', type: '投流', use: '截标准备下单流量', priority: 5 }
    ];
  }

  function uniq(a) { var s = {}; return a.filter(function (x) { return s[x] ? false : (s[x] = 1); }); }

  /* ---------------- 对外查询 ---------------- */
  function query(input) {
    var t0 = (root.performance || Date).now();
    var raw = String(input || '').trim();
    if (!raw) { return { ok: false, code: 'EMPTY', message: '请输入产品名称，如"保温杯""LED灯带""蓝牙耳机"。' }; }
    if (!READY) { return { ok: false, code: 'NOT_READY', message: '知识库尚未加载完成，请稍后重试。' }; }
    if (raw.length > 40) { return { ok: false, code: 'TOO_LONG', message: '产品名称过长，请输入 40 字以内的核心词。' }; }

    // 省份优先：搜"河南/吉林/浙江"走省份模式
    var provinceHit = queryProvince(raw);
    if (provinceHit) return provinceHit;   // 命中省份就返回，哪怕数据待补，也要明确告知

    // 地区次之：搜"欧洲/美国/东南亚"走地区模式
    var regionHit = queryRegion(raw);
    if (regionHit && regionHit.products && regionHit.products.length) return regionHit;

    var hit = resolveProduct(raw);
    // 宽泛品类词：绕开产品条目，直接交给品类池（保留 expected 作为品类锚点）
    if (hit && hit.broad) {
      var infB = infer(raw);
      return finish({
        ok: true, source: 'rule', confidence: 'medium', matchedBy: 'broad-category',
        product: { id: 'rule-' + raw, name: hit.label || raw, en: '', category: infB.poolName || infB.category, summary: '「' + raw + '」是一个品类词，以下按「' + (infB.poolName || infB.category) + '」品类的通用规则给出' },
        markets: infB.markets, adStrategy: infB.adStrategy, tools: infB.tools,
        marketChannels: infB.marketChannels || null, sources: infB.sources, related: [],
        tags: infB.tags, poolId: infB.poolId || null, poolName: infB.poolName || null
      }, t0, raw);
    }
    if (hit && hit.entry) {
      var e = hit.entry;
      return finish({
        ok: true, source: 'kb', confidence: hit.score >= 0.9 ? 'high' : (hit.score >= 0.7 ? 'medium' : 'low'),
        matchedBy: hit.via, confidenceScore: hit.score,
        product: { id: e.id, name: e.name, en: (e.aliases || [])[0] || '', category: e._cat, summary: e.summary || '' },
        markets: attachFit(e, (e.markets || []).slice().sort(function (a, b) { return (a.rank || 9) - (b.rank || 9); })),
        adStrategy: e.adStrategy || null,
        tools: (e.tools || []).slice().sort(function (a, b) { return (a.priority || 9) - (b.priority || 9); }),
        sources: e.sources || [],
        related: related(e)
      }, t0, raw);
    }

    // 未收录 → 规则推断（同步、毫秒级）
    var inf = infer(raw);
    if (inf.unrecognized) {
      return { ok: false, code: 'UNRECOGNIZED', message: '无法把这个输入识别为产品名称（疑似纯数字/符号/过短）。请换一个具体产品词，例如"不锈钢保温杯""USB-C 数据线"。' };
    }
    return finish({
      ok: true, source: 'rule', confidence: 'low', matchedBy: 'rule',
      product: { id: 'rule-' + raw, name: raw, en: '', category: inf.poolName || inf.category, summary: '知识库未收录，以下为基于品类规则的推断结果' },
      markets: inf.markets, adStrategy: inf.adStrategy, tools: inf.tools, marketChannels: inf.marketChannels || null,
      sources: inf.sources, related: [], tags: inf.tags,
      poolId: inf.poolId || null, poolName: inf.poolName || null
    }, t0, raw);
  }

  /* 生活现状匹配层：把 kb.fit.json 的内容挂到对应市场上 */
  function attachFit(entry, markets) {
    var FIT = (KB && KB.fit) || null;
    if (!FIT || !FIT.products || !FIT.products[entry.id]) {
      markets.forEach(function (m) { m.fit = null; m.fitGaps = null; });
      return markets;
    }
    var pm = FIT.products[entry.id].markets || {};
    var labels = FIT.aspectLabels || {};
    markets.forEach(function (m) {
      var d = pm[m.country];
      if (!d) { m.fit = null; m.fitGaps = null; return; }
      m.fit = (d.fit || []).map(function (f) {
        return { aspect: f.aspect, aspectLabel: labels[f.aspect] || f.aspect, basis: f.basis, src: f.src || '', text: f.text };
      });
      m.fitGaps = (d.gaps || []).map(function (g) { return labels[g] || g; });
    });
    return markets;
  }

  function related(entry) {
    var out = [];
    KB._all.forEach(function (p) {
      if (p.id !== entry.id && p._catKey === entry._catKey) out.push(p);
    });
    return out.slice(0, 6).map(function (p) { return { id: p.id, name: p.name }; });
  }

  function finish(res, t0, raw) {
    res.query = raw;
    res.tookMs = Math.round(((root.performance || Date).now()) - t0);
    return res;
  }

  root.Engine = { init: init, query: query, queryRegion: queryRegion, queryProvince: queryProvince, infer: infer,
    _resolve: resolveProduct, _region: resolveRegion, get ready() { return READY; } };
})(window);