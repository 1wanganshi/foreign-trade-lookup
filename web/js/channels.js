/* 社媒/平台渠道布局表（来源：用户提供的《社媒渠道布局》图）
   ------------------------------------------------------------
   作用：把"品类 → 该上哪个平台"以及"这个平台主要走投流还是自然流"固化成一张表，
   与知识库的 adStrategy 并列展示，不替换原结论，只补"具体上哪"这一层。
   字段：id / name / abbr / desc(适用场景) / paid(平台上的付费产品) / organic(自然流打法) */
window.CHANNEL_PLAYBOOK = {
  version: "2026-02",
  source: "社媒渠道布局图（用户提供）",
  platforms: [
    { id: "facebook", name: "Facebook", abbr: "FB", scope: "全品类",
      desc: "全品类通吃，是唯一能覆盖 B2B + B2C 的通用社媒",
      paid: ["Meta 广告（Advantage+ 自动投放）", "再营销受众（Pixel/自定义受众）"],
      organic: ["主页+分组沉淀私域", "卖货帖子/直播（Marketplace + Shops）"] },
    { id: "linkedin", name: "LinkedIn", abbr: "LIN", scope: "重装备",
      desc: "重装备、工业品、机械设备的主战场，决策人在这里",
      paid: ["Ads（按职位/公司规模定向）", "InMail 直达采购与工程负责人"],
      organic: ["公司页+个人号干货内容", "按行业建群、展会前后定向加人"] },
    { id: "youtube", name: "YouTube", abbr: "YTB", scope: "产品教程",
      desc: "产品教程与实测内容，决策周期长的品类靠它建立信任",
      paid: ["Google Ads 视频广告", "信息流+发现页广告"],
      organic: ["安装/使用/对比教程视频", "长短视频组合做搜索长尾"] },
    { id: "yandex", name: "Yandex", abbr: "YDX", scope: "俄罗斯·中亚",
      desc: "俄罗斯、中亚与独联体市场的搜索引擎与广告平台",
      paid: ["Yandex Direct 搜索广告", "Yandex Market 站内推广"],
      organic: ["俄语 SEO 独立站", "Yandex Market / VK 生态内容"] },
    { id: "tiktok", name: "TikTok", abbr: "TK", scope: "快消品",
      desc: "快消品内容电商主战场，短视频带货效率最高",
      paid: ["Spark Ads（达人素材加热）", "TikTok Shop 商品广告"],
      organic: ["达人寄样+UGC 矩阵", "直播+短视频双跑"] },
    { id: "instagram", name: "Instagram", abbr: "INS", scope: "护肤美妆",
      desc: "护肤美妆、时尚配饰的视觉种草平台",
      paid: ["Meta Reels 广告", "品牌合作广告（达人挂车）"],
      organic: ["Reels 教程/前后对比", "KOL 联名与话题标签"] },
    { id: "x", name: "X (Twitter)", abbr: "TWI", scope: "新品发布",
      desc: "新品发布、行业话题与科技圈的即时传播",
      paid: ["X Ads 推广帖", "关键词与话题定向"],
      organic: ["发布会预告与实时跟帖", "行业 KOL 转发扩散"] },
    { id: "wechat-video", name: "视频号", abbr: "视", scope: "在华老外找工厂",
      desc: "在华采购、老外找工厂，国内私域与外贸老板圈层",
      paid: ["微信广告（朋友圈/视频号）", "视频号加热"],
      organic: ["工厂实拍+验厂内容", "客户案例与询盘私域承接"] }
  ],
  /* 品类 → 平台优先级（1 = 首推）。未列出的品类走"全品类"兜底 */
  byCategory: {
    "家居园艺": ["facebook", "instagram", "youtube", "tiktok"],
    "3C电子·汽配": ["tiktok", "youtube", "facebook", "instagram"],
    "服饰美妆·宠物母婴": ["instagram", "tiktok", "facebook", "youtube"],
    "工业机械·新能源": ["linkedin", "youtube", "yandex", "facebook"],
    "家电与日用电子": ["tiktok", "youtube", "facebook", "instagram"],
    "服饰鞋包·宠物补": ["instagram", "tiktok", "facebook"],
    "工业·新能源·汽配补": ["linkedin", "yandex", "youtube", "facebook"],
    "烘焙与食品加工": ["linkedin", "youtube", "yandex", "facebook"],
    "通用常青品类": ["facebook", "tiktok", "instagram", "youtube"]
  },
  /* 品类池 id → 平台优先级（未收录产品走这里） */
  byPool: {
    pet: ["tiktok", "instagram", "facebook", "youtube"],
    apparel: ["instagram", "tiktok", "facebook"],
    beauty: ["instagram", "tiktok", "youtube"],
    electronics: ["tiktok", "youtube", "facebook", "instagram"],
    home: ["facebook", "instagram", "youtube", "tiktok"],
    outdoor: ["youtube", "facebook", "instagram", "tiktok"],
    toy: ["tiktok", "facebook", "instagram"],
    auto: ["youtube", "facebook", "tiktok"],
    machinery: ["linkedin", "youtube", "yandex", "facebook"],
    "bakery-equipment": ["linkedin", "youtube", "yandex", "facebook"],
    "packaging-equipment": ["linkedin", "youtube", "yandex", "facebook"]
  },
  /* 平台在该品类下主要走哪种流量：paid 为主 / organic 为主 / 双轨 */
  mode: {
    facebook: "双轨", linkedin: "自然流为主", youtube: "自然流为主", yandex: "投流为主",
    tiktok: "投流为主", instagram: "投流为主", x: "自然流为主", "wechat-video": "自然流为主"
  }
};
