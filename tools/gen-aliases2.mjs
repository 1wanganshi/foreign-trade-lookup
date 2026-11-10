import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
const files = fs.readdirSync(dir).filter(f => /^kb5\.top\d+\.json$/.test(f)).sort();
const map = {};
const PREF = /^(宠物|猫用|狗用|儿童|婴儿|家用|商用|工业|户外|便携式?|折叠|硅胶|不锈钢|木质|汽车|电动车?|摩托车?|男式|女式|男士|女士|一次性|可重复使用|手动|电动|迷你|大容量|加厚|双层|防滑|防水|高频外贸|农用|园艺|厨房|仓储|物流|包装)/;
function add(k, id) { k = k.trim(); if (k.length >= 2 && !map[k]) map[k] = id; }
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  for (const p of arr) {
    if (!p.name || !p.id) continue;
    const bare = String(p.name).replace(/[（(][^）)]*[）)]/g, '').split('/')[0].trim();
    add(bare, p.id);
    // 反复剥前缀，产生更多口语说法
    let cur = bare;
    for (let i = 0; i < 3; i++) {
      const next = cur.replace(PREF, '').trim();
      if (next === cur || next.length < 2) break;
      add(next, p.id);
      cur = next;
    }
    // 别名里的顿号/斜杠拆分
    (p.aliases || []).forEach(a => String(a).split(/[、,，;；\/]/).forEach(x => add(x.replace(/[（(][^）)]*[）)]/g, ''), p.id)));
  }
}
fs.writeFileSync('D:/vibecoding/外贸数据查找/tools/generated-aliases.json', JSON.stringify(map), 'utf8');
let body = 'window.ALIAS_INDEX_EXT = ' + JSON.stringify(map) + ';\n';
fs.writeFileSync('D:/vibecoding/外贸数据查找/web/js/aliases-gen.js', body, 'utf8');
console.log('生成别名', Object.keys(map).length, '条');
