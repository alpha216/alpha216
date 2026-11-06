// 사용법: node shot.mjs <출력.png> [폭] [높이]  — 움직임 줄이기 모드로 도입부 없이 바로 찍습니다.
import { chromium } from '@playwright/test';
const [out, w = 1440, h = 900] = process.argv.slice(2);
const b = await chromium.launch({ channel: 'chrome' });
const p = await b.newPage({ viewport: { width: +w, height: +h }, reducedMotion: 'reduce' });
p.on('pageerror', e => console.log('ERR', e.message));
await p.goto('http://127.0.0.1:5180');
await p.waitForFunction(() => document.querySelector('.title-bar').classList.contains('shown'), null, { timeout: 90000 });
await p.waitForTimeout(2500);
await p.screenshot({ path: out });
await b.close();
