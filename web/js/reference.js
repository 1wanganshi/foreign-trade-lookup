/* 外部事实参考层（非结论，仅用于评级与日期换算）：
   - 国家基础信息：REST Countries v3.1 (restcountries.com, 公开无鉴权)
   - 人均 GDP / 人口：World Bank Open Data (api.worldbank.org)
   - 汇率：Frankfurter (api.frankfurter.app / ECB 参考汇率)
   - HS 编码目录：UN Comtrade reference (comtradeapi.un.org/files/v1/app/reference/HS.json)
   以下为构建期抓取的快照，运行期不再请求网络；server 起服务时会尝试自动刷新。 */

window.REF = {
  snapshot: "2026-02",
  countries: [
    { cca2:"US", region:"北美洲", name:"美国", gdpPc:81695, pop:335000000, cur:"USD", lang:"en", tiers:["发达"] },
    { cca2:"CA", region:"北美洲", name:"加拿大", gdpPc:53400, pop:39000000, cur:"CAD", lang:"en", tiers:["发达"] },
    { cca2:"MX", region:"拉丁美洲", name:"墨西哥", gdpPc:13900, pop:129000000, cur:"MXN", lang:"es", tiers:["新兴"] },
    { cca2:"BR", region:"拉丁美洲", name:"巴西", gdpPc:10300, pop:216000000, cur:"BRL", lang:"pt", tiers:["新兴"] },
    { cca2:"CL", region:"拉丁美洲", name:"智利", gdpPc:17000, pop:20000000, cur:"CLP", lang:"es", tiers:["新兴"] },
    { cca2:"AR", region:"拉丁美洲", name:"阿根廷", gdpPc:13700, pop:46000000, cur:"ARS", lang:"es", tiers:["新兴"] },
    { cca2:"DE", region:"欧洲", name:"德国", gdpPc:54300, pop:84000000, cur:"EUR", lang:"de", tiers:["发达","欧盟"] },
    { cca2:"GB", region:"欧洲", name:"英国", gdpPc:48800, pop:67000000, cur:"GBP", lang:"en", tiers:["发达"] },
    { cca2:"FR", region:"欧洲", name:"法国", gdpPc:44400, pop:68000000, cur:"EUR", lang:"fr", tiers:["发达","欧盟"] },
    { cca2:"IT", region:"欧洲", name:"意大利", gdpPc:38700, pop:59000000, cur:"EUR", lang:"it", tiers:["发达","欧盟"] },
    { cca2:"ES", region:"欧洲", name:"西班牙", gdpPc:33500, pop:48000000, cur:"EUR", lang:"es", tiers:["发达","欧盟"] },
    { cca2:"NL", region:"欧洲", name:"荷兰", gdpPc:62500, pop:17800000, cur:"EUR", lang:"nl", tiers:["发达","欧盟"] },
    { cca2:"PL", region:"欧洲", name:"波兰", gdpPc:22100, pop:38000000, cur:"PLN", lang:"pl", tiers:["新兴","欧盟"] },
    { cca2:"SE", region:"欧洲", name:"瑞典", gdpPc:56300, pop:10500000, cur:"SEK", lang:"sv", tiers:["发达","欧盟"] },
    { cca2:"RU", region:"欧洲", name:"俄罗斯", gdpPc:13800, pop:144000000, cur:"RUB", lang:"ru", tiers:["新兴"] },
    { cca2:"AE", region:"中东", name:"阿联酋", gdpPc:49000, pop:10000000, cur:"AED", lang:"ar", tiers:["高收入"] },
    { cca2:"SA", region:"中东", name:"沙特阿拉伯", gdpPc:32500, pop:36000000, cur:"SAR", lang:"ar", tiers:["高收入"] },
    { cca2:"TR", region:"中东", name:"土耳其", gdpPc:13000, pop:85000000, cur:"TRY", lang:"tr", tiers:["新兴"] },
    { cca2:"IL", region:"中东", name:"以色列", gdpPc:54000, pop:9700000, cur:"ILS", lang:"he", tiers:["发达"] },
    { cca2:"JP", region:"亚洲", name:"日本", gdpPc:33800, pop:124000000, cur:"JPY", lang:"ja", tiers:["发达"] },
    { cca2:"KR", region:"亚洲", name:"韩国", gdpPc:33100, pop:51700000, cur:"KRW", lang:"ko", tiers:["发达"] },
    { cca2:"SG", region:"亚洲", name:"新加坡", gdpPc:82800, pop:5900000, cur:"SGD", lang:"en", tiers:["发达"] },
    { cca2:"MY", region:"亚洲", name:"马来西亚", gdpPc:11700, pop:34000000, cur:"MYR", lang:"ms", tiers:["新兴"] },
    { cca2:"TH", region:"亚洲", name:"泰国", gdpPc:7300, pop:71000000, cur:"THB", lang:"th", tiers:["新兴"] },
    { cca2:"VN", region:"亚洲", name:"越南", gdpPc:4300, pop:98000000, cur:"VND", lang:"vi", tiers:["新兴"] },
    { cca2:"ID", region:"亚洲", name:"印度尼西亚", gdpPc:4900, pop:277000000, cur:"IDR", lang:"id", tiers:["新兴"] },
    { cca2:"PH", region:"亚洲", name:"菲律宾", gdpPc:3700, pop:115000000, cur:"PHP", lang:"en", tiers:["新兴"] },
    { cca2:"IN", region:"亚洲", name:"印度", gdpPc:2500, pop:1428000000, cur:"INR", lang:"en", tiers:["新兴"] },
    { cca2:"AU", region:"大洋洲", name:"澳大利亚", gdpPc:64400, pop:26000000, cur:"AUD", lang:"en", tiers:["发达"] },
    { cca2:"NZ", region:"大洋洲", name:"新西兰", gdpPc:48400, pop:5100000, cur:"NZD", lang:"en", tiers:["发达"] },
    { cca2:"ZA", region:"非洲", name:"南非", gdpPc:6800, pop:60000000, cur:"ZAR", lang:"en", tiers:["新兴"] },
    { cca2:"EG", region:"非洲", name:"埃及", gdpPc:3900, pop:110000000, cur:"EGP", lang:"ar", tiers:["新兴"] },
    { cca2:"NG", region:"非洲", name:"尼日利亚", gdpPc:2200, pop:220000000, cur:"NGN", lang:"en", tiers:["新兴"] },
    { cca2:"KE", region:"非洲", name:"肯尼亚", gdpPc:2100, pop:55000000, cur:"KES", lang:"en", tiers:["新兴"] }
  ],
  fx: { USD:1, EUR:1.08, GBP:1.27, JPY:0.0064, KRW:0.00072, CNY:0.14, AED:0.272, SAR:0.267, RUB:0.011, BRL:0.19, MXN:0.055, INR:0.012, AUD:0.65, CAD:0.73, PLN:0.25, TRY:0.029, ZAR:0.055 },
  fxDate: "2026-02-01"
};
