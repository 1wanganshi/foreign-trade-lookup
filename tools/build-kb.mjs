
import fs from 'node:fs';
import path from 'node:path';
const DATA = 'D:/vibecoding/外贸数据查找/web/data';
const CATS = [
  { file: 'kb.home.json', key: 'home', name: '家居园艺' },
  { file: 'kb.3c.json', key: '3c', name: '3C电子·汽配' },
  { file: 'kb.fashion.json', key: 'fashion', name: '服饰美妆·宠物母婴' },
  { file: 'kb.industrial.json', key: 'industrial', name: '工业机械·新能源' },
  { file: 'kb.seed.json', key: 'seed', name: '通用常青品类' },
  { file: 'kb2.bakery-food.json', key: 'bakery', name: '烘焙与食品加工' },
  { file: 'kb2.2c.json', key: 'appliance', name: '家电与日用电子' },
  { file: 'kb2.3c-fashion.json', key: 'fashion2', name: '服饰鞋包·宠物补' },
  { file: 'kb2.industrial2.json', key: 'industrial2', name: '工业·新能源·汽配补' },
  { file: 'kb3.qa-gapfill.json', key: 'gapfill', name: 'QA 补漏新品' },
  { file: 'kb5.top01.json', key: 'top01', name: '高频外贸·家居厨房' },
  { file: 'kb5.top02.json', key: 'top02', name: '高频外贸·消费电子' },
  { file: 'kb5.top03.json', key: 'top03', name: '高频外贸·服装鞋包' },
  { file: 'kb5.top04.json', key: 'top04', name: '高频外贸·五金汽配' },
  { file: 'kb5.top05.json', key: 'top05', name: '高频外贸·美妆母婴' },
  { file: 'kb5.top06.json', key: 'top06', name: '高频外贸·宠物玩具户外' },
  { file: 'kb5.top07.json', key: 'top07', name: '高频外贸·工业机械' },
  { file: 'kb5.top08.json', key: 'top08', name: '高频外贸·包装农资园林' }
];
const out = { builtAt: new Date().toISOString().slice(0,10), version: 1, categories: [], regions: [] };
// 地区商品库：kb2.region-*.json / kb3.region-*.json
const regionFiles = fs.readdirSync(DATA).filter(f => /^kb\d?\.region-.+\.json$/.test(f)).sort();
for (const f of regionFiles) {
  try {
    const d = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    if (d && d.id && Array.isArray(d.products)) {
      out.regions.push({ id: d.id, region: d.region, markets: d.markets, summary: d.summary,
        products: d.products, sources: d.sources, confidence: d.confidence });
    } else problems.push('BAD-REGION ' + f);
  } catch (e) { problems.push('REGION-PARSE ' + f + ': ' + e.message.slice(0, 60)); }
}
let pool = { categories: [], regions: [] };
try { pool = JSON.parse(fs.readFileSync(path.join(DATA, 'kb.pool.json'), 'utf8')); } catch (e) { problems.push('POOL MISSING'); }
const problems = [];
const warnings = [];
const seenIds = new Set();
let total = 0;
for (const c of CATS) {
  const p = path.join(DATA, c.file);
  if (!fs.existsSync(p)) { warnings.push('MISSING ' + c.file); continue; }
  let arr;
  try { arr = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { problems.push('PARSE ' + c.file + ': ' + e.message.slice(0,80)); continue; }
  if (!Array.isArray(arr)) arr = arr.products || [];
  const clean = [];
  for (const x of arr) {
    if (!x || !x.id || !x.name || !Array.isArray(x.markets) || !x.markets.length) {
      problems.push('BAD ' + c.file + ':' + (x && (x.id || x.name))); continue;
    }
    if (seenIds.has(x.id)) { problems.push('DUP ' + x.id); continue; }
    // schema 兜底：补默认值而不是整条丢弃
    if (!Array.isArray(x.aliases)) x.aliases = [];
    if (!Array.isArray(x.tools) || !x.tools.length) {
      x.tools = [{ name: 'Alibaba.com', type: 'B2B', use: '询盘与批发', priority: 1 },
                 { name: 'Amazon', type: 'B2C', use: '零售承接', priority: 2 }];
    }
    if (!x.adStrategy) x.adStrategy = { verdict: '双轨并行', paid: ['先小预算测款'], organic: ['内容种草承接'], budget: '待评估', kpi: 'ACoS<30%' };
    if (!x.summary) x.summary = '';
    if (!x.category) x.category = c.name;
    if (!Array.isArray(x.sources)) x.sources = [];
    if (!x.confidence) x.confidence = 'medium';
    seenIds.add(x.id); clean.push(x); total++;
  }
  out.categories.push({ key: c.key, name: c.name, count: clean.length, products: clean });
}
// 省份外贸库：kb4.province-*.json（数组或单对象均可）
out.provinces = [];
const seenPv = new Set();
for (const f of fs.readdirSync(DATA).filter(f => /^kb4\.province-.*\.json$/.test(f)).sort()) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const pv of arr) {
      if (!pv || !pv.province || seenPv.has(pv.province)) continue;
      seenPv.add(pv.province);
      out.provinces.push(pv);
    }
  } catch (e) { problems.push('PROVINCE-PARSE ' + f + ': ' + e.message.slice(0, 50)); }
}
out.total = total;
out.pool = pool;
try { out.fit = JSON.parse(fs.readFileSync(path.join(DATA, 'kb.fit.json'), 'utf8')); } catch (e) { problems.push('FIT MISSING'); }
const body = 'window.KB_CATALOG = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(DATA, 'kb.bundle.js'), body, 'utf8');
if (fs.existsSync(path.join(DATA, 'kb.generated.js'))) fs.unlinkSync(path.join(DATA, 'kb.generated.js'));
console.log(JSON.stringify({ total, categories: out.categories.map(c => c.key + ':' + c.count),
  regions: out.regions.map(r => r.id + ':' + (r.products || []).length),
  regionProducts: out.regions.reduce((a, r) => a + (r.products || []).length, 0),
  provinces: out.provinces.map(p => p.province + ':' + ((p.exportTo || []).length)),
  provinceExports: out.provinces.reduce((a, p) => a + (p.exportTo || []).length, 0),
  bytes: body.length, problems: problems.slice(0, 12), warnings: warnings.slice(0, 8) }, null, 1));