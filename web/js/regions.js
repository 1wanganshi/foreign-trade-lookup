/* 地区索引：用户输入国家名/地区名/口语说法 → 命中地区知识库
   命中后走"地区模式"：该地区适销商品 → 商品适配国家 → 原因 → 平台 → 流量 */
window.REGIONS = {
  version: '2026-02',
  list: [
    { id: 'europe', name: '欧洲', file: 'kb2.region-europe.json',
      keys: ['欧洲', '欧盟', '欧州', 'europe', 'eu', '西欧', '北欧', '中东欧',
        '德国', '英国', '法国', '意大利', '西班牙', '荷兰', '波兰', '瑞典', '比利时', '奥地利', '葡萄牙', '希腊',
        'germany', 'uk', 'france', 'italy', 'spain', 'netherlands', 'poland', 'sweden'] },
    { id: 'north-america', name: '北美', file: 'kb3.region-namerica.json',
      keys: ['北美', '美国', '加拿大', '墨西哥', 'north america', 'usa', 'us', 'america', 'canada', 'mexico',
        '美区', '美站'] },
    { id: 'middle-east', name: '中东', file: 'kb3.region-mideast.json',
      keys: ['中东', '海湾', 'gcc', 'middle east', '阿联酋', '迪拜', '沙特', '土耳其', '以色列', '卡塔尔', '科威特', '阿曼',
        'uae', 'dubai', 'saudi', 'turkey', 'israel', 'qatar', 'kuwait'] },
    { id: 'southeast-asia', name: '东南亚', file: 'kb3.region-seasia.json',
      keys: ['东南亚', 'southeast asia', 'sea', '印尼', '印度尼西亚', '越南', '泰国', '马来西亚', '菲律宾', '新加坡',
        'indonesia', 'vietnam', 'thailand', 'malaysia', 'philippines', 'singapore', '新马泰'] },
    { id: 'latin-america', name: '拉丁美洲', file: 'kb3.region-latam.json',
      keys: ['拉美', '拉丁美洲', '南美', 'latin america', 'latam', 'south america', '巴西', '智利', '哥伦比亚', '秘鲁', '阿根廷',
        'brazil', 'chile', 'colombia', 'peru', 'argentina'] },
    { id: 'northeast-asia', name: '日韩东亚', file: 'kb3.region-neasia.json',
      keys: ['日韩', '东亚', '日本', '韩国', '台湾', '香港', 'japan', 'korea', 'taiwan', 'hong kong', 'jp', 'kr'] },
    { id: 'africa', name: '非洲', file: 'kb3.region-africa.json',
      keys: ['非洲', 'africa', '尼日利亚', '南非', '肯尼亚', '埃及', '摩洛哥', '加纳',
        'nigeria', 'south africa', 'kenya', 'egypt', 'morocco', 'ghana'] },
    { id: 'oceania', name: '大洋洲', file: 'kb3.region-oceania.json',
      keys: ['大洋洲', '澳洲', '澳大利亚', '新西兰', 'oceania', 'australia', 'nz', 'new zealand'] }
  ]
};
