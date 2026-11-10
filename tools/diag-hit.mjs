import fs from 'node:fs';
import vm from 'node:vm';
const R = 'D:/vibecoding/外贸数据查找/web/';
const win = { performance }; win.window = win;
const ctx = vm.createContext(win);
for (const f of ['js/synonyms.js','js/aliases.js','js/reference.js','js/rules.js','js/channels.js','js/regions.js','js/provinces.js','js/market-engine.js','data/kb.bundle.js'])
  vm.runInContext(fs.readFileSync(R + f, 'utf8'), ctx, { filename: f });
ctx.Engine.init(ctx.KB_CATALOG);
for (const q of ['慢食碗', '吊床', '角磨机', '刹车片', '木质积木']) {
  const r = ctx.Engine.query(q);
  console.log(q, '=> src=', r.source, 'via=', r.matchedBy, 'name=', r.product && r.product.name, 'pool=', r.poolId);
}
