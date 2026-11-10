import fs from 'node:fs';
const p = 'D:/vibecoding/外贸数据查找/web/data/kb.bundle.js';
const b = fs.readFileSync(p, 'utf8');
console.log('bundle size KB', (b.length / 1024).toFixed(0));
const m = b.match(/"key":"([a-z0-9]+)"/g) || [];
console.log('categories keys:', m.join(' '));
for (const n of ['压蒜器', '硅胶烘焙垫', '宠物慢食碗', '角磨机']) {
  console.log(n, '->', b.includes(n) ? 'IN' : 'MISSING');
}
// 统计产品总数
const cm = b.match(/"count":(\d+)/g) || [];
console.log('counts:', cm.join(' '));
