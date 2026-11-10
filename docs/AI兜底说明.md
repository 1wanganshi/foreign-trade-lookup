
## AI 兜底（未收录产品）

知识库没命中时，服务端先做**联网检索**，再调用**大模型**把检索结果整理成四块结论
（国家 / 原因 / 平台 / 自然流 vs 投流）。配置方式（OpenAI 兼容接口均可）：

```powershell
$env:AI_API_KEY  = "sk-..."                       # 必填，不填则只用本地规则
$env:AI_BASE_URL = "https://api.deepseek.com/v1"  # 可选，默认 OpenAI
$env:AI_MODEL    = "deepseek-chat"                # 可选，默认 gpt-4o-mini
node server.mjs
```

行为约定：
1. 未收录产品先显示「AI 正在查…」占位，**不提前下"查不到"结论**；
2. 检索 + AI 成功 → 四块内容正常展示，顶部标注「AI 已补全 · 推断非官方数据」；
3. 检索失败或未配 Key → 明确标注「本地估算 / AI 未启用」，不编造；
4. 结果缓存 10 分钟，避免重复调用。
