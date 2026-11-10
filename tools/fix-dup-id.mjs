import fs from 'node:fs';
const p = 'D:/vibecoding/外贸数据查找/web/data/kb5.top04.json';
const arr = JSON.parse(fs.readFileSync(p, 'utf8'));
let n = 0;
for (const x of arr) {
  if (x.id === 'motorcycle-phone-holder') { x.id = 'moto-phone-mount-clamp'; n++; }
}
fs.writeFileSync(p, JSON.stringify(arr, null, 1), 'utf8');
console.log('renamed', n);
