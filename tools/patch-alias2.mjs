import fs from 'node:fs';
const p = 'D:/vibecoding/外贸数据查找/tools/generated-aliases.json';
const map = JSON.parse(fs.readFileSync(p, 'utf8'));
const dataDir = 'D:/vibecoding/外贸数据查找/web/data';
// 建立 名称→id 索引，用于按关键词自动匹配
const all = [];
for (const f of fs.readdirSync(dataDir).filter(f => /^kb5\.top\d+\.json$/.test(f))) {
  all.push(...JSON.parse(fs.readFileSync(dataDir + '/' + f, 'utf8')));
}
const find = (kw) => { const hit = all.find(p => String(p.name).includes(kw)); return hit ? hit.id : null; };
const manual = {
  '砧板': '砧板', '菜板': '砧板', '保鲜盖': '保鲜', '喷油瓶': '喷油', '意面机': '意面',
  '刀具筒': '刀铲收纳', '收纳箱': '折叠布箱', '毛毯': '毛毯', '地垫': '地垫',
  '遮光帘': '遮光帘', '沙发套': '沙发套', '积木': '积木', '折叠桌': '折叠露营桌',
  '柴火炉': '柴火', '睡袋': '睡袋'
};
let added = 0;
for (const [alias, kw] of Object.entries(manual)) {
  if (map[alias]) continue;
  const id = find(kw);
  if (id) { map[alias] = id; added++; }
}
fs.writeFileSync(p, JSON.stringify(map), 'utf8');
fs.writeFileSync('D:/vibecoding/外贸数据查找/web/js/aliases-gen.js',
  'window.ALIAS_INDEX_EXT = ' + JSON.stringify(map) + ';\n', 'utf8');
console.log('补充', added, '条，总计', Object.keys(map).length);
