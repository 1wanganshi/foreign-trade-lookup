import fs from 'node:fs';
const p = 'D:/vibecoding/外贸数据查找/web/data/kb4.province-b.json';
const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
const FIX = { '湖北省': '湖北' };
let n = 0;
for (const pv of arr) { if (FIX[pv.province]) { pv.province = FIX[pv.province]; n++; } }
fs.writeFileSync(p, JSON.stringify(arr, null, 1), 'utf8');
console.log('fixed', n, arr.map(x => x.province).join('/'));
