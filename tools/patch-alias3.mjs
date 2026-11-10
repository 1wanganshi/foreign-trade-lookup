import fs from 'node:fs';
const p = 'D:/vibecoding/外贸数据查找/tools/generated-aliases.json';
const map = JSON.parse(fs.readFileSync(p, 'utf8'));
const dataDir = 'D:/vibecoding/外贸数据查找/web/data';
const all = [];
for (const f of fs.readdirSync(dataDir).filter(f => /^kb5\.top\d+\.json$/.test(f))) all.push(...JSON.parse(fs.readFileSync(dataDir + '/' + f, 'utf8')));
const find = (kw) => { const h = all.find(p => String(p.name).includes(kw)); return h ? h.id : null; };
const manual = { '收纳箱': '布艺折叠收纳箱', '毛毯': '羊羔绒法兰绒毯', '遮光帘': '遮光窗帘', '柴火炉': '便携露营炉头', '睡袋': '户外套锅' };
let added = 0;
for (const [a, kw] of Object.entries(manual)) {
  if (map[a]) continue;
  const id = find(kw);
  if (id) { map[a] = id; added++; } else console.log('未找到', kw);
}
fs.writeFileSync(p, JSON.stringify(map), 'utf8');
fs.writeFileSync('D:/vibecoding/外贸数据查找/web/js/aliases-gen.js', 'window.ALIAS_INDEX_EXT = ' + JSON.stringify(map) + ';\n', 'utf8');
console.log('补充', added, '总计', Object.keys(map).length);
