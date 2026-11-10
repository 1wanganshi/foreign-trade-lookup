import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
const files = fs.readdirSync(dir).filter(f => /^kb5\.top\d+\.json$/.test(f)).sort();
let total = 0;
const ids = new Set();
for (const f of files) {
  try {
    const arr = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    const list = Array.isArray(arr) ? arr : [];
    const bad = list.filter(p => !p.id || !p.name || !Array.isArray(p.markets) || p.markets.length < 3);
    list.forEach(p => p.id && ids.add(p.id));
    total += list.length;
    console.log(f, list.length, '条', bad.length ? '异常:' + bad.length : 'OK');
  } catch (e) { console.log(f, 'PARSE FAIL', e.message.slice(0, 60)); }
}
console.log('合计', total, '条，唯一 id', ids.size);
const tgt = 300;
console.log(total >= tgt ? '✅ 达标' : '⚠️ 还差 ' + (tgt - total) + ' 条');
