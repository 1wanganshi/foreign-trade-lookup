import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
const files = fs.readdirSync(dir).filter(f => /^kb5\.top\d+\.json$/.test(f)).sort();
const map = {};
let n = 0;
for (const f of files) {
  const arr = JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8'));
  for (const p of arr) {
    if (!p.name || !p.id) continue;
    const bare = String(p.name).replace(/[（(][^）)]*[）)]/g, '').trim();
    // 口语说法：做XX的 / XX / XX厂
    const keys = new Set();
    keys.add(bare);
    // 去掉品类前缀，得到更口语的短名
    const short = bare.replace(/^(宠物|猫用|狗用|儿童|婴儿|家用|商用|工业|户外|便携式?|折叠|硅胶|不锈钢|木质|汽车|电动车?|摩托车?|男式|女式|男士|女士|高频外贸)/, '');
    if (short.length >= 2 && short !== bare) keys.add(short);
    keys.forEach(k => { if (k.length >= 2 && !map[k]) { map[k] = p.id; n++; } });
  }
}
fs.writeFileSync('D:/vibecoding/外贸数据查找/tools/generated-aliases.json', JSON.stringify(map, null, 0), 'utf8');
console.log('生成别名', n, '条');
console.log('样例:', Object.entries(map).slice(0, 8).map(([k, v]) => k + '→' + v).join(' '));
