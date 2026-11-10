import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
// 现有产品名
const files = fs.readdirSync(dir).filter(f => /^kb.*\.json$/.test(f) && !f.includes('pool') && !f.includes('fit') && !f.includes('region') && !f.includes('province'));
const have = new Set();
for (const f of files) {
  try {
    const raw = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
    const arr = Array.isArray(raw) ? raw : (raw.products || []);
    arr.forEach(p => p && p.name && have.add(String(p.name).replace(/[\s（）()]/g, '')));
  } catch (e) {}
}
// 省份高频出口品
const prov = JSON.parse(fs.readFileSync(dir + '/kb4.province-a.json', 'utf8'));
const freq = {};
prov.forEach(p => (p.exportTo || []).forEach(e => { const n = String(e.name || '').replace(/[\s（）()]/g, ''); if (n) freq[n] = (freq[n] || 0) + 1; }));
const sorted = Object.entries(freq).sort((a, b) => b[1] - a[1]);
console.log('现有产品条目:', have.size);
console.log('省份提到的出口品数:', sorted.length);
console.log('\n省份高频出口品（前40，标注是否已收录）:');
sorted.slice(0, 40).forEach(([n, c]) => console.log(' ', have.has(n) ? '✅' : '❌', n, c));
