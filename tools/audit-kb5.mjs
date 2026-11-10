import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
// 库内已有 id
const existing = new Set();
for (const f of fs.readdirSync(dir).filter(f => /^kb.*\.json$/.test(f) && !/^kb5/.test(f) && !f.includes('pool') && !f.includes('fit') && !f.includes('region') && !f.includes('province'))) {
  try {
    const raw = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    (Array.isArray(raw) ? raw : (raw.products || [])).forEach(p => p && p.id && existing.add(p.id));
  } catch (e) {}
}
const problems = [];
const ids = new Set();
let total = 0;
const regionCount = {};
for (const f of fs.readdirSync(dir).filter(f => /^kb5\.top\d+\.json$/.test(f)).sort()) {
  const arr = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  arr.forEach(p => {
    total++;
    if (!p.id || !/^[a-z0-9-]+$/.test(p.id)) problems.push('BAD-ID ' + f + ':' + p.id);
    if (ids.has(p.id)) problems.push('DUP ' + p.id);
    if (existing.has(p.id)) problems.push('CONFLICT ' + p.id);
    ids.add(p.id);
    if (!p.name) problems.push('NO-NAME ' + p.id);
    if (!Array.isArray(p.markets) || p.markets.length < 3) problems.push('FEW-MARKETS ' + p.id);
    if (!Array.isArray(p.aliases) || !p.aliases.length) problems.push('NO-ALIAS ' + p.id);
    if (!Array.isArray(p.tools) || !p.tools.length) problems.push('NO-TOOLS ' + p.id);
    if (!p.adStrategy || !p.adStrategy.verdict) problems.push('NO-AD ' + p.id);
    (p.markets || []).forEach(m => { regionCount[m.region] = (regionCount[m.region] || 0) + 1; });
  });
}
console.log('新增产品', total, '| id 唯一', ids.size);
console.log('区域分布', JSON.stringify(regionCount));
console.log('问题数', problems.length);
problems.slice(0, 15).forEach(p => console.log(' -', p));
