
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
  { file: 'kb3.qa-gapfill.json', key: 'gapfill', name: 'QA 补漏新品' }
];
const out = { builtAt: new Date().toISOString().slice(0,10), version: 1, categories: [] };
let pool = { categories: [], regions: [] };
try { pool = JSON.parse(fs.readFileSync(path.join(DATA, 'kb.pool.json'), 'utf8')); } catch (e) { problems.push('POOL MISSING'); }
const problems = [];
const seenIds = new Set();
let total = 0;
for (const c of CATS) {
  const p = path.join(DATA, c.file);
  if (!fs.existsSync(p)) { problems.push('MISSING ' + c.file); continue; }
  let arr;
  try { arr = JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { problems.push('PARSE ' + c.file + ': ' + e.message.slice(0,80)); continue; }
  if (!Array.isArray(arr)) arr = arr.products || [];
  const clean = [];
  for (const x of arr) {
    if (!x || !x.id || !x.name || !Array.isArray(x.markets) || !x.markets.length) { problems.push('BAD ' + c.file + ':' + (x && (x.id || x.name))); continue; }
    if (seenIds.has(x.id)) { problems.push('DUP ' + x.id); continue; }
    seenIds.add(x.id); clean.push(x); total++;
  }
  out.categories.push({ key: c.key, name: c.name, count: clean.length, products: clean });
}
out.total = total;
out.pool = pool;
try { out.fit = JSON.parse(fs.readFileSync(path.join(DATA, 'kb.fit.json'), 'utf8')); } catch (e) { problems.push('FIT MISSING'); }
const body = 'window.KB_CATALOG = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(DATA, 'kb.bundle.js'), body, 'utf8');
if (fs.existsSync(path.join(DATA, 'kb.generated.js'))) fs.unlinkSync(path.join(DATA, 'kb.generated.js'));
console.log(JSON.stringify({ total, categories: out.categories.map(c => c.key + ':' + c.count), bytes: body.length, problems: problems.slice(0, 12) }, null, 1));