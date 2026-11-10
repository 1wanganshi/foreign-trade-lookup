import fs from 'node:fs';
import path from 'node:path';
const DATA = 'D:/vibecoding/外贸数据查找/web/data';
const tmp = fs.readdirSync(DATA).filter(f => f.startsWith('tmp-kb4.') && f.endsWith('.json'));
const pool = [];
const NAMEFIX = { '湖北省': '湖北', '河南省': '河南', '吉林省': '吉林', '四川省': '四川', '辽宁省': '辽宁',
  '江苏省': '江苏', '浙江省': '浙江', '广东省': '广东', '福建省': '福建', '山东省': '山东',
  '河北省': '河北', '安徽省': '安徽', '湖南省': '湖南', '江西省': '江西', '陕西省': '陕西',
  '重庆市': '重庆', '天津市': '天津', '北京市': '北京', '上海市': '上海',
  '广西壮族自治区': '广西', '广西省': '广西', '云南省': '云南', '贵州省': '贵州', '甘肃省': '甘肃',
  '宁夏回族自治区': '宁夏', '宁夏省': '宁夏', '新疆维吾尔自治区': '新疆', '新疆省': '新疆',
  '内蒙古自治区': '内蒙古', '黑龙江省': '黑龙江', '山西省': '山西', '青海省': '青海',
  '西藏自治区': '西藏', '西藏省': '西藏', '海南省': '海南' };
for (const f of tmp) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
    const arr = Array.isArray(raw) ? raw : [raw];
    for (const pv of arr) {
      if (!pv || !pv.province) continue;
      pv.province = NAMEFIX[pv.province] || pv.province;
      pool.push(pv);
    }
  } catch (e) { console.log('PARSE FAIL', f, e.message.slice(0, 60)); }
}
const best = new Map();
for (const pv of pool) {
  const cur = best.get(pv.province);
  if (!cur || (pv.exportTo || []).length > (cur.exportTo || []).length) best.set(pv.province, pv);
}
const all = [...best.values()].sort((a, b) => (b.exportTo || []).length - (a.exportTo || []).length);
fs.writeFileSync(path.join(DATA, 'kb4.province-a.json'), JSON.stringify(all, null, 1), 'utf8');
const oldB = path.join(DATA, 'kb4.province-b.json');
if (fs.existsSync(oldB)) fs.unlinkSync(oldB);
console.log('merged', all.length, '省份:', all.map(p => p.province + '(' + (p.exportTo || []).length + ')').join(' '));
