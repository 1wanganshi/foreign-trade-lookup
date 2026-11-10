import fs from 'node:fs';
import path from 'node:path';
const DATA = 'D:/vibecoding/外贸数据查找/web/data';
const tmp = fs.readdirSync(DATA).filter(f => f.startsWith('tmp-kb4.') && f.endsWith('.json'));
const groups = { a: [], b: [] };
const all = [];
for (const f of tmp) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const pv of arr) {
      if (!pv || !pv.province) continue;
      all.push({ pv, file: f });
      if (f.includes('province-a')) groups.a.push(pv);
      else groups.b.push(pv);
    }
  } catch (e) { console.log('PARSE FAIL', f, e.message.slice(0, 60)); }
}
const dedupe = (arr) => {
  const seen = new Set();
  return arr.filter(p => { if (seen.has(p.province)) return false; seen.add(p.province); return true; });
};
const a = dedupe(groups.a), b = dedupe(groups.b);
if (a.length) fs.writeFileSync(path.join(DATA, 'kb4.province-a.json'), JSON.stringify(a, null, 1), 'utf8');
if (b.length) fs.writeFileSync(path.join(DATA, 'kb4.province-b.json'), JSON.stringify(b, null, 1), 'utf8');
console.log('A:', a.map(p => p.province + '(' + (p.exportTo||[]).length + ')').join(' '));
console.log('B:', b.map(p => p.province + '(' + (p.exportTo||[]).length + ')').join(' '));
