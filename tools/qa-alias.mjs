/**
 * 大规模别名 / 翻译 / 口语表达测试台
 * ------------------------------------------------------------
 * 覆盖 6 类输入：
 *   A 口语外壳（"我是做…的"）  B 行业俗称  C 中英混写
 *   D 多义词 / 歧义            E 错别字 / 变体  F 边界（空/超长/无意义）
 *
 * 判定：期望 = { cat: 期望品类名或产品名关键字 }，落库(source=kb)或品类池(source=rule,poolId)都算
 * 用法：node tools/qa-alias.mjs [--verbose]
 */
import fs from 'node:fs';
import vm from 'node:vm';

const R = 'D:/vibecoding/外贸数据查找/web/';
const win = { performance };
win.window = win;
const ctx = vm.createContext(win);
for (const f of ['js/synonyms.js', 'js/aliases.js', 'js/reference.js', 'js/rules.js', 'js/market-engine.js', 'data/kb.bundle.js']) {
  vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
}
const info = ctx.Engine.init(ctx.KB_CATALOG);

/* ------------------------------------------------------------------ */
/* 用例：q=输入, want=期望命中的关键字（产品名/品类名/池名任一包含即可）
   tag=类别, note=说明 */
const CASES = [
  /* ============ A 口语外壳：用户自述式表达 ============ */
  { q: '我是做饼干机器的', want: '饼干', tag: 'A', note: '用户原句，应识别为烘焙设备' },
  { q: '我是做饼干机的', want: '饼干', tag: 'A' },
  { q: '我们厂做饼干机器', want: '饼干', tag: 'A' },
  { q: '我家生产饼干成型机', want: '饼干', tag: 'A' },
  { q: '做饼干设备的', want: '饼干', tag: 'A' },
  { q: '专门做饼干生产线', want: '饼干', tag: 'A' },
  { q: '做LED灯的', want: 'LED', tag: 'A' },
  { q: '我是做灯带的', want: '灯带', tag: 'A' },
  { q: '做保温杯的厂家', want: '保温杯', tag: 'A' },
  { q: '我们是做蓝牙耳机的', want: '耳机', tag: 'A' },
  { q: '给人家做袋子的机器', want: '包装', tag: 'A' },
  { q: '做猫爬架的', want: '猫', tag: 'A' },
  { q: '生产瑜伽裤的工厂', want: '瑜伽', tag: 'A' },
  { q: '我这边卖充电宝', want: '充电宝', tag: 'A' },
  { q: '做太阳能路灯生意的', want: '路灯', tag: 'A' },
  { q: '外贸做电动工具的', want: '电动工具', tag: 'A' },
  { q: '帮我查一下空气炸锅', want: '空气炸锅', tag: 'A' },
  { q: '我想出口咖啡机', want: '咖啡', tag: 'A' },
  { q: '这边有个和面机的单子', want: '和面', tag: 'A' },
  { q: '客户要工业烤箱', want: '烤', tag: 'A' },

  /* ============ B 行业俗称 / 简称 ============ */
  { q: '饼干机', want: '饼干', tag: 'B' },
  { q: '曲奇机', want: '饼干', tag: 'B' },
  { q: '醒发箱', want: '醒发', tag: 'B' },
  { q: '和面机', want: '和面', tag: 'B' },
  { q: '打面机', want: '和面', tag: 'B' },
  { q: '揉面机', want: '和面', tag: 'B' },
  { q: '面包线', want: '面包', tag: 'B' },
  { q: '烘焙线', want: '烘焙', tag: 'B' },
  { q: '空压机', want: '空压机', tag: 'B' },
  { q: '注塑机', want: '注塑', tag: 'B' },
  { q: 'CNC', want: '数控', tag: 'B' },
  { q: '加工中心', want: '加工中心', tag: 'B' },
  { q: '摩配', want: '摩托', tag: 'B' },
  { q: '3C配件', want: '3C', tag: 'B' },
  { q: '二类电商', want: null, tag: 'B', note: '非产品词，应走兜底或提示' },
  { q: '光储', want: '储能', tag: 'B' },
  { q: '小家电', want: '家电', tag: 'B' },
  { q: '汽配', want: '汽车', tag: 'B' },
  { q: '家纺', want: '床品', tag: 'B' },
  { q: '五金', want: '工具', tag: 'B' },

  /* ============ C 中英混写 / 纯英文 ============ */
  { q: 'LED面板灯', want: 'LED', tag: 'C' },
  { q: 'LED strip', want: '灯带', tag: 'C' },
  { q: 'TWS耳机', want: '耳机', tag: 'C' },
  { q: 'USB-C数据线', want: '数据线', tag: 'C' },
  { q: 'power bank', want: '充电宝', tag: 'C' },
  { q: 'air fryer', want: '空气炸锅', tag: 'C' },
  { q: 'coffee machine', want: '咖啡', tag: 'C' },
  { q: 'biscuit machine', want: '饼干', tag: 'C' },
  { q: 'cookie machine', want: '饼干', tag: 'C' },
  { q: 'bakery equipment', want: '烘焙', tag: 'C' },
  { q: 'dough mixer', want: '和面', tag: 'C' },
  { q: 't-shirt', want: 't恤', tag: 'C' },
  { q: 'phone case', want: '手机', tag: 'C' },
  { q: 'solar panel', want: '光伏', tag: 'C' },
  { q: 'hand tools', want: '工具', tag: 'C' },
  { q: 'yoga pants', want: '瑜伽', tag: 'C' },
  { q: 'pet supplies', want: '宠物', tag: 'C' },
  { q: 'LED灯带strip', want: '灯带', tag: 'C' },
  { q: '注塑机injection', want: '注塑', tag: 'C' },
  { q: '饼干machine', want: '饼干', tag: 'C' },

  /* ============ D 多义词 / 歧义 ============ */
  { q: '苹果', want: null, tag: 'D', note: '水果 or 品牌？应给提示而非瞎猜' },
  { q: '小米', want: null, tag: 'D', note: '粮食 or 品牌' },
  { q: '空调', want: '空', tag: 'D' },
  { q: '电视', want: '电视', tag: 'D' },
  { q: '冰箱', want: '冰箱', tag: 'D' },
  { q: '洗衣机', want: '洗衣', tag: 'D' },
  { q: '口罩', want: '口罩', tag: 'D' },
  { q: '眼镜', want: '镜', tag: 'D', note: '太阳镜是合理下钻' },
  { q: '手套', want: '手套', tag: 'D' },
  { q: '杯子', want: '杯', tag: 'D' },
  { q: '锅', want: '锅', tag: 'D' },
  { q: '灯', want: '灯', tag: 'D' },
  { q: '玩具', want: '玩具', tag: 'D' },
  { q: '电池', want: '电池', tag: 'D' },
  { q: '电机', want: '电机', tag: 'D' },

  /* ============ E 错别字 / 异体 / 变体 ============ */
  { q: '保温怀', want: '保温杯', tag: 'E', note: '错别字：怀→杯' },
  { q: '蓝牙耳级', want: '耳机', tag: 'E', note: '错别字' },
  { q: '充电保', want: '充电宝', tag: 'E', note: '错别字' },
  { q: '空气炸锅', want: '空气炸锅', tag: 'E' },
  { q: '空气炸窝', want: '空气炸锅', tag: 'E', note: '错别字' },
  { q: '饼干機', want: '饼干', tag: 'E', note: '繁体' },
  { q: 'LED燈帶', want: '灯带', tag: 'E', note: '繁体' },
  { q: '保温杯 ', want: '保温杯', tag: 'E', note: '尾部空格' },
  { q: '  保温杯', want: '保温杯', tag: 'E', note: '首部空格' },
  { q: '保 温 杯', want: '保温杯', tag: 'E', note: '中间空格' },
  { q: '保温杯（500ml）', want: '保温杯', tag: 'E', note: '带规格后缀' },

  /* ============ F 边界 ============ */
  { q: '', want: null, tag: 'F', expectCode: 'EMPTY' },
  { q: '   ', want: null, tag: 'F', expectCode: 'EMPTY' },
  { q: '123456', want: null, tag: 'F', expectCode: 'UNRECOGNIZED' },
  { q: '!!!???', want: null, tag: 'F', expectCode: 'UNRECOGNIZED' },
  { q: '😀😀😀', want: null, tag: 'F', expectCode: 'UNRECOGNIZED' },
  { q: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmn', want: null, tag: 'F', note: '恰好40字符，应走兜底' },
  { q: 'abcdefghijklmnopqrstuvwxyzabcdefghijklmnopq', want: null, tag: 'F', expectCode: 'TOO_LONG', note: '42 字符，应报超长' },
  { q: '某某不存在的东西xyz', want: null, tag: 'F', note: '应明确兜底，不编造' },
  { q: 'asdfghjkl', want: null, tag: 'F', note: '乱码' },
  { q: '一个东西', want: null, tag: 'F', note: '无信息量' },
];

/* ------------------------------------------------------------------ */
const results = CASES.map((c) => {
  const r = ctx.Engine.query(c.q);
  let verdict = 'FAIL';
  let got = '';

  if (c.expectCode) {
    verdict = !r.ok && r.code === c.expectCode ? 'PASS' : 'FAIL';
    got = !r.ok ? r.code : r.product.name;
  } else if (r.ok) {
    const hay = [r.product.name, r.product.category, r.poolName || '', r.product.en || ''].join(' ').toLowerCase();
    if (c.want === null) {
      // 明确要求"不应给出确定性结论"的用例：必须不是 kb 高置信命中
      verdict = r.source === 'kb' && r.confidence === 'high' ? 'WRONG' : 'PASS';
    } else {
      verdict = hay.includes(String(c.want).toLowerCase()) ? 'PASS' : 'WRONG';
    }
    got = `${r.source}/${r.confidence} → ${r.product.name}` + (r.poolId ? ` [池:${r.poolId}]` : '');
  } else {
    verdict = c.want === null ? 'PASS' : 'FAIL';
    got = `ERR ${r.code}`;
  }
  return { ...c, verdict, got, source: r.ok ? r.source : '-', conf: r.ok ? r.confidence : '-', matchedBy: r.ok ? r.matchedBy : '-', tookMs: r.ok ? r.tookMs : 0 };
});

/* ------------------------------------------------------------------ */
const by = (t) => results.filter((r) => r.tag === t);
const pass = results.filter((r) => r.verdict === 'PASS').length;
const wrong = results.filter((r) => r.verdict === 'WRONG');
const fail = results.filter((r) => r.verdict === 'FAIL');

console.log(`\n引擎索引: 产品 ${info.products} | 别名键 ${info.keys} | 品类池 ${info.pool}`);
console.log(`用例 ${results.length} 条 → PASS ${pass} / WRONG ${wrong.length} / FAIL ${fail.length}\n`);

for (const t of ['A', 'B', 'C', 'D', 'E', 'F']) {
  const g = by(t);
  if (!g.length) continue;
  const p = g.filter((r) => r.verdict === 'PASS').length;
  console.log(`── ${t} 类（${p}/${g.length}）`);
  for (const r of g) {
    const mark = r.verdict === 'PASS' ? '✓' : r.verdict === 'WRONG' ? '✗错配' : '✗未命中';
    if (r.verdict !== 'PASS' || process.argv.includes('--verbose')) {
      console.log(`   ${mark} "${r.q}"  →  ${r.got}${r.note ? `   // ${r.note}` : ''}`);
    }
  }
}

console.log(`\n${'═'.repeat(60)}`);
if (wrong.length) {
  console.log('错配（命中了，但不是期望的品类）:');
  wrong.forEach((r) => console.log(`  · "${r.q}" want≈${r.want} got=${r.got}`));
}
if (fail.length) {
  console.log('未命中（应有结论但没有）:');
  fail.forEach((r) => console.log(`  · "${r.q}" want≈${r.want} got=${r.got}${r.note ? ` // ${r.note}` : ''}`));
}
if (!wrong.length && !fail.length) console.log('全部通过。');

fs.writeFileSync('D:/vibecoding/外贸数据查找/tools/qa-alias.result.json', JSON.stringify(results, null, 1), 'utf8');
console.log(`\n明细已写入 tools/qa-alias.result.json`);
process.exit(wrong.length + fail.length ? 1 : 0);
