import fs from 'node:fs';
const dir = 'D:/vibecoding/外贸数据查找/web/data';
const all = [];
for (const f of fs.readdirSync(dir).filter(f => /^kb5\.top\d+\.json$/.test(f))) {
  all.push(...JSON.parse(fs.readFileSync(dir + '/' + f, 'utf8')));
}
console.log('top01-08 全部产品名:');
all.forEach(p => process.stdout.write(p.name + ' | '));
console.log('');
