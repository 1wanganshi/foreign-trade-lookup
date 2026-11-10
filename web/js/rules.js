/* 规则库（推断层）：当产品走"未收录 / 兜底"路径时，用确定性规则生成可解释的判断。
   每条规则都带 rationale，UI 会以"规则推断（非知识库结论）"标注，避免与知识库结论混淆。 */

window.RULES = {
  // 需求 × 供给 的能力标签：一个区域"喜欢"某类产品，通常落在其中 2-3 项
  demandDrivers: {
    purchasing_power: "人均可支配收入高，愿为品质/设计付溢价",
    housing_small: "居住面积小（公寓/租房多），收纳与免安装需求强",
    aging: "老龄化与家庭护理支出上升",
    outdoor: "户外/露营/庭院文化强，季节性与配件复购高",
    winter: "寒冷气候，户外与供暖类刚需",
    summer: "炎热气候，降温、防晒、户外遮阳需求强",
    car_culture: "汽车保有量与改装文化（含轮胎、配件、车品）",
    diy: "DIY/自修文化，工具与配件零售渠道成熟",
    ecom_mature: "电商渗透率高，平台物流与退货体系成熟",
    price_sensitive: "价格敏感，性价比与铺货型 SKU 主导",
    mobile_first: "移动端先上网，社媒电商与货到付款为主",
    import_dependent: "本地制造弱，几乎全依赖进口",
    regulation: "准入合规门槛高（CE/REACH/EPR/GPSR/UL 等）",
    b2b_project: "工程/基建/产业投资驱动，B2B 询盘为主",
    language_barrier: "本地方言为主，需本地化 listing 与服务",
    holiday_gift: "节庆送礼文化强，Q4 峰值明显",
    sports: "运动健身体育消费强",
    beauty_heat: "美妆个护渗透高，KOL/短视频驱动",
    pets: "宠物家庭渗透率高",
    labor_cost: "人工成本高，自动化与省力工具需求强"
  },

  productSignals: [
    { re:/电池|充电|电子|蓝牙|无线|充电宝|耳机|电源|储能|逆变/, tags:["ecom_mature","regulation","purchasing_power"], cat:"电子产品" },
    { re:/收纳|置物|挂|厨房|家居|清洁|家具/, tags:["housing_small","purchasing_power"], cat:"家居用品" },
    { re:/户外|露营|烧烤|花园|园艺|运动|健身|骑行|帐篷/, tags:["outdoor","sports"], cat:"户外运动" },
    { re:/取暖|保暖|加热|羽绒|帽|手套/, tags:["winter"], cat:"季节性保暖" },
    { re:/降温|风扇|遮阳|冰|冷/, tags:["summer"], cat:"季节性降温" },
    { re:/车|汽配|轮胎|改装|摩托|电动滑板/, tags:["car_culture","diy"], cat:"汽车相关" },
    { re:/宠物|猫|狗/, tags:["pets","purchasing_power"], cat:"宠物用品" },
    { re:/美妆|化妆|护肤|睫毛|假发|口红|美甲/, tags:["beauty_heat","mobile_first"], cat:"美妆个护" },
    { re:/服|衣|裤|裙|鞋|袜|帽|包|首饰|饰/, tags:["holiday_gift","mobile_first"], cat:"服饰" },
    { re:/机械|机床|设备|泵|阀|电机|发电|工业|五金|工具|轴承|注塑/, tags:["b2b_project","labor_cost"], cat:"工业设备" },
    { re:/监测|传感|仪器|检测|医疗|监护|制氧/, tags:["regulation","b2b_project"], cat:"仪器医疗" },
    { re:/玩具|积木|婴儿|儿童|母婴/, tags:["regulation","holiday_gift"], cat:"母婴玩具" },
    { re:/太阳能|光储|光伏|路灯|新能源|充电桩/, tags:["b2b_project","regulation"], cat:"新能源" }
  ],

  regionProfiles: {
    "欧洲":     { drivers:["regulation","housing_small","outdoor","aging","purchasing_power"], note:"统一 CE/GPSR/EPR 合规，VAT 与包装法强制，客单中高但退货率与合规成本也高" },
    "北美洲":   { drivers:["purchasing_power","ecom_mature","diy","car_culture"], note:"Amazon/Walmart 主导，单品爆款逻辑强，合规看 FDA/UL/FCC" },
    "亚洲":     { drivers:["mobile_first","price_sensitive","aging","housing_small"], note:"日韩重品质与授权，东南亚价格敏感、COD 与本地仓是关键" },
    "中东":     { drivers:["import_dependent","purchasing_power","mobile_first","summer"], note:"GCC 高客单、进口依赖，SASO/Saber 认证与斋月节奏影响明显" },
    "拉丁美洲": { drivers:["import_dependent","price_sensitive","mobile_first","summer"], note:"清关与税制复杂，本地仓/墨西哥转口常见" },
    "大洋洲":   { drivers:["outdoor","purchasing_power","ecom_mature"], note:"体量小但客单高，GST 与澳新双仓" },
    "非洲":     { drivers:["price_sensitive","import_dependent","mobile_first"], note:"基建与电力相关刚需强，支付与物流是瓶颈" }
  },

  adRule(price, cat) {
    const lowPrice = price > 0 && price < 15;
    const b2b = /工业|机械|仪器|设备|新能源/.test(cat || "");
    if (b2b) return { verdict:"自然流为主（B2B 信任驱动）", why:"B2B 决策链长、询盘靠信任与资质，先做站点 SEO+展会+领英触达，投流仅用于精准关键词与再营销。" };
    if (lowPrice) return { verdict:"投流破冰 → 自然流沉淀", why:"低单价 SKU 毛利薄，先用小额投流测出爆款素材，再把验证过的词做成 SEO/内容承接，否则纯投流容易亏 ACoS。" };
    return { verdict:"双轨并行（投流测款 + 内容承接）", why:"中等客单既要短期订单验证选品，也要长期降低获客成本：投流负责验证，自然流负责放大。" };
  }
};
