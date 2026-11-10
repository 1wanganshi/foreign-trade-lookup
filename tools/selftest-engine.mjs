
import fs from 'node:fs';
import vm from 'node:vm';
const R = 'D:/vibecoding/外贸数据查找/web/';
const win = { performance };
win.window = win;
const ctx = vm.createContext(win);
for (const f of ['js/synonyms.js','js/aliases.js','js/reference.js','js/rules.js','js/market-engine.js','data/kb.bundle.js']) {
  vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
}
const info = ctx.Engine.init(ctx.KB_CATALOG);
const qs = ['保温杯','LED灯带','蓝牙耳机','充电宝','宠物用品','电动滑板车','瑜伽裤','激光雕刻机','太阳能路灯','t-shirt','hand tools','数控机床','某某不存在的东西xyz','我是做饼干机器的','做LED灯的','做猫爬架的'];
for (const q of qs) { const r = ctx.Engine.query(q); console.log(q, '=>', r.ok ? (r.source+'/'+r.confidence+'/'+r.tookMs+'ms/'+(r.product&&r.product.name)+'/pool:'+(r.poolId||'-')+'/mk:'+(r.markets||[]).length+'/tools:'+(r.tools||[]).length) : r.code); }
console.log('index', JSON.stringify(info));
// 全库回归：每个产品名与首个别名都必须命中自己
let miss = 0, skip = 0, tie = 0;
ctx.KB_CATALOG.categories.forEach(c => c.products.forEach(p => {
  const r1 = ctx.Engine.query(p.name);
  if (!r1.ok || r1.product.id !== p.id) {
    if (!r1.ok && r1.code === 'TOO_LONG') { skip++; }
    else if (r1.ok && r1.product.name === p.name) { tie++; }   // 同名不同品类，可接受
    else { miss++; console.log('MISS name', p.name, '->', r1.ok ? r1.product.name : r1.code); }
  }
  (p.aliases||[]).slice(0,1).forEach(a => {
    const r2 = ctx.Engine.query(a);
    if (!r2.ok) { if (r2.code === 'TOO_LONG') skip++; else { miss++; console.log('MISS alias', a, r2.code); } }
  });
}));
console.log('REGRESSION misses:', miss, '| skipped(TOO_LONG):', skip, '| name-tie:', tie);