import fs from 'node:fs';
const map = JSON.parse(fs.readFileSync('D:/vibecoding/外贸数据查找/tools/generated-aliases.json', 'utf8'));
const body = 'window.ALIAS_INDEX_EXT = ' + JSON.stringify(map) + ';\n';
fs.writeFileSync('D:/vibecoding/外贸数据查找/web/js/aliases-gen.js', body, 'utf8');
console.log('written', Object.keys(map).length, 'keys,', (body.length / 1024).toFixed(0) + 'KB');
