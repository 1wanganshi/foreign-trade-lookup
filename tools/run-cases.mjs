
import fs from 'node:fs';
import vm from 'node:vm';
const R='D:/vibecoding/外贸数据查找/web/';
const win={performance};win.window=win;
const ctx=vm.createContext(win);
for(const f of ['js/synonyms.js','js/aliases.js','js/reference.js','js/rules.js','js/market-engine.js','data/kb.bundle.js']) vm.runInContext(fs.readFileSync(R+f,'utf8'),ctx,{filename:f});
ctx.Engine.init(ctx.KB_CATALOG);
const cases = JSON.parse(fs.readFileSync('D:/vibecoding/外贸数据查找/tools/cases.json','utf8'));
const out = [];
for (const c of cases) {
  const r = ctx.Engine.query(c.in);
  out.push({ id: c.id, grp: c.grp, input: c.in, expect: c.expect,
    ok: r.ok, src: r.source, conf: r.confidence, via: r.matchedBy || '-',
    name: r.ok ? (r.product.name||'') : null, pool: r.poolId || '-',
    mk: r.ok ? r.markets.length : 0, ms: r.tookMs, code: r.code, expectPool: c.expectPool, expectAny: c.expectAny });
}
fs.writeFileSync('D:/vibecoding/外贸数据查找/tools/cases.result.json', JSON.stringify(out, null, 1));
const bad = out.filter(o => {
  if (o.expect === '__ERR__') return o.ok;
  if (!o.ok) return true;
  if (!o.expect) return false;
  if (o.expect === o.pool || o.expect === o.name) return false;
  if (o.expectPool && o.expectPool === o.pool) return false;
  if (o.expectAny && (o.src === 'kb' || o.pool)) return false;
  if (o.expect === 'bakery-equipment' && /\/bakery/.test(o.grp || '')) return true;
  return true;
});
console.log('TOTAL', out.length, 'ISSUES', bad.length);
for (const b of bad) console.log(JSON.stringify(b));