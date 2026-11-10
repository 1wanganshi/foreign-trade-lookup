import fs from 'node:fs';
import vm from 'node:vm';
const R = 'D:/vibecoding/外贸数据查找/web/';
const win = { performance }; win.window = win;
const ctx = vm.createContext(win);
for (const f of ['js/synonyms.js','js/aliases.js','js/reference.js','js/rules.js','js/channels.js','js/regions.js','js/provinces.js','js/market-engine.js','data/kb.bundle.js'])
  vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
const cat = ctx.KB_CATALOG;
const all = (cat.categories || []).flatMap(c => (c.products || []).map(p => ({ name: p.name, cat: c.key })));
console.log('bundle 内产品总数', all.length);
console.log('样例', all.slice(-3).map(p => p.name + '@' + p.cat).join(' | '));
const info = ctx.Engine.init(cat);
console.log('engine init', JSON.stringify(info));
const r = ctx.Engine.query('压蒜器');
console.log('压蒜器 ->', r.source, r.matchedBy, r.product && r.product.name);
const r2 = ctx.Engine.query('角磨机');
console.log('角磨机 ->', r2.source, r2.matchedBy, r2.product && r2.product.name);
