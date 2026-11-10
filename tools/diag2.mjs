import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
for (const f of ['kb5.top06.json', 'kb5.top04.json', 'kb5.top01.json']) {
  const arr = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  const hit = arr.find(p => ['慢食碗', '吊床', '角磨机', '刹车片'].includes(p.name));
  console.log(f, '产品数', arr.length, '样例名', arr.slice(0, 3).map(p => p.name).join('/'));
  console.log('  找慢食碗:', !!arr.find(p => p.name.includes('慢食')));
}
// 检查 bundle 里有没有
const bundle = fs.readFileSync(dir + '/kb.bundle.js', 'utf8');
for (const n of ['慢食碗', '吊床', '角磨机', '刹车片']) {
  console.log(n, '在 bundle 中:', bundle.includes('"' + n + '"'));
}
