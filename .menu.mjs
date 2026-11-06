import { chromium } from 'playwright';
const S = process.argv[2];
const b = await chromium.launch({ channel: 'chrome' });
const errs = [];
for (const [name, w, h] of [['desk', 1280, 800], ['mob', 390, 844]]) {
  const p = await b.newPage({ viewport: { width: w, height: h }, reducedMotion: 'reduce' });
  p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:5180/?time=12:00'); await p.waitForTimeout(1200);
  await p.mouse.click(w / 2, h / 2); await p.waitForTimeout(800);
  await p.screenshot({ path: `${S}/menu-${name}.png` });
  await p.close();
}
console.log({ errs });
await b.close();
