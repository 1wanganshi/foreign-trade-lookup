/**
 * 移动端结果页截图（用于极简性前后对比）
 * 用法：node tools/shot.mjs <输出前缀> [产品词...]
 */
import pw from 'file:///C:/Users/Lenovo/node_modules/playwright/index.js';
const { chromium, devices } = pw;
import fs from 'node:fs';

const prefix = process.argv[2] || 'before';
const queries = process.argv.slice(3);
const QS = queries.length ? queries : ['我是做饼干机器的', '空气炸锅', '宠物用品'];
const OUT = 'D:/vibecoding/_shots';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch({ channel: 'chrome' });
const ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'zh-CN' });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });

await page.goto('http://localhost:8787/', { waitUntil: 'networkidle' });

for (let i = 0; i < QS.length; i++) {
  await page.fill('#q', QS[i]);
  await page.click('#btnSearch');
  await page.waitForSelector('#result:not([hidden])', { timeout: 8000 });
  await page.waitForTimeout(700);

  // 首屏
  await page.screenshot({ path: `${OUT}/${prefix}-${i + 1}-a.png` });

  const info = await page.evaluate(() => ({
    h: document.body.scrollHeight,
    tabs: document.querySelectorAll('.tab').length,
    qa: document.querySelectorAll('.qa').length,
    markets: document.querySelectorAll('.mcard').length,
    tools: document.querySelectorAll('.tcard').length,
    // 首屏可见的三问答案文本
    answers: [...document.querySelectorAll('.qa .q-a')].map((n) => n.innerText.replace(/\s+/g, ' ').slice(0, 120)),
    viewportAnswers: (() => {
      const out = [];
      document.querySelectorAll('.qa').forEach((n) => {
        const r = n.getBoundingClientRect();
        out.push(r.bottom <= window.innerHeight ? '可见' : '需滚动');
      });
      return out;
    })(),
  }));
  console.log(`\n[${QS[i]}] 页高 ${info.h}px | tabs ${info.tabs} | 三问 ${info.qa} | 市场卡 ${info.markets} | 工具 ${info.tools}`);
  info.answers.forEach((a, k) => console.log(`   答${k + 1}(${info.viewportAnswers[k]}): ${a}`));

  // 整页
  await page.screenshot({ path: `${OUT}/${prefix}-${i + 1}-full.png`, fullPage: true });
}

console.log(`\n控制台错误: ${errors.length ? errors.join(' | ') : '无'}`);
await browser.close();
