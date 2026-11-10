import fs from 'node:fs';
const p = 'D:/vibecoding/外贸数据查找/tools/generated-aliases.json';
const map = JSON.parse(fs.readFileSync(p, 'utf8'));
// 手工补齐：口语说法 → 实际产品 id
const manual = {
  '打包餐盒': 'pack-food-container-tray',
  '一次性餐盒': 'pack-food-container-tray',
  '外卖餐盒': 'pack-food-container-tray',
  '食品托盘': 'pack-food-container-tray',
  '牛皮纸袋': 'pack-kraft-paper-bag',
  '外卖纸袋': 'pack-kraft-paper-bag',
  '自粘袋': 'pack-bopp-adhesive-bag',
  'opp袋': 'pack-bopp-adhesive-bag',
  '快递箱': 'pack-corrugated-box',
  '纸箱': 'pack-corrugated-box',
  '缠绕膜': 'pack-stretch-film',
  '气泡袋': 'pack-bubble-mailer',
  '真空袋': 'pack-vacuum-bag-roll',
  '灌肠机': 'food-sausage-stuffer',
  '绞肉机': 'food-meat-grinder',
  '压面机': 'food-noodle-press',
  '榨汁机': 'food-sugarcane-juicer',
  '切菜机': 'food-vegetable-cutter',
  '烘干机': 'food-dryer-multi-layer',
  '冰淇淋机': 'food-ice-cream-maker-desktop',
  '链锯链条': 'garden-chainsaw-chain',
  '喷雾器': 'garden-knapsack-sprayer',
  '水溶肥': 'agri-water-soluble-fertilizer',
  '地膜': 'agri-mulch-film',
  '杀草布': 'agri-weed-barrier-fabric',
  '椰糠': 'agri-coco-coir-brick',
  '蜂箱': 'agri-beehive',
  '防鸟网': 'agri-bird-net',
  '割草机器人': 'garden-robot-mower',
  '泳池清洁': 'garden-pool-cleaner-robot',
  '水管车': 'garden-hose-reel-cart',
  '园艺工具': 'garden-tool-set',
  '花盆': 'garden-resin-flower-pot',
  '修枝剪': 'garden-pole-pruner',
  '栅栏': 'garden-plastic-fence'
};
let added = 0;
for (const [k, v] of Object.entries(manual)) { if (!map[k]) { map[k] = v; added++; } }
fs.writeFileSync(p, JSON.stringify(map), 'utf8');
fs.writeFileSync('D:/vibecoding/外贸数据查找/web/js/aliases-gen.js',
  'window.ALIAS_INDEX_EXT = ' + JSON.stringify(map) + ';\n', 'utf8');
console.log('补充别名', added, '条，总计', Object.keys(map).length);
