import * as THREE from 'three';

// three.js 캔버스 위에 HTML로 띄우는 타이틀입니다.
// 처음 한 번: 파란 상자가 화면 오른쪽 밖에서 들어와 글자를 덮고, 왼쪽 막대로 줄어들며 첫 글자를 보여줍니다.
// 그 뒤로는: 글자 채움이 대각선으로 사라져 외곽선만 남았다가, 글자가 바뀌고 다시 대각선으로 채워집니다.
const messages = [
  ['MINSUNG', 'KIM'],
  ['CLICK TO', 'CONTINUE'],
];
// sweep: 파란 상자가 왼쪽 끝까지 늘어났다가 왼쪽 막대로 줄어들기까지 걸리는 시간,
// coverAt: 그중 왼쪽 끝까지 다 늘어나 글자를 덮는 순간(0~1). 늘어나는 거리와 줄어드는 거리가 거의 같아 가운데(0.5)입니다.
// fillOut/fillIn: 대각선으로 채움이 사라지는/채워지는 시간, outlineHold: 외곽선만 보이는 시간
// hold: 처음 한 바퀴(이름 → 클릭 → 이름) 동안 문구가 머무는 시간, longHold: 그 뒤로 머무는 시간
const timing = { delay: 4200, sweep: 700, coverAt: 0.5, hold: 3000, longHold: 6000, fillOut: 450, outlineHold: 120, fillIn: 500 };
// 대각선 기울기(요소 너비 대비 %). 위쪽이 아래쪽보다 이만큼 오른쪽으로 기울어집니다.
const slant = 12;
const hidden = 'inset(0 0 0 100%)';
const covered = 'inset(0 0 0 0)';
const barOnly = 'inset(0 calc(100% - var(--bar-width)) 0 0)';

export function startTitleOverlay() {
  const root = document.querySelector('#title');
  const wipe = root.querySelector('.title-wipe');
  const outline = root.querySelector('.title-outline');
  const fill = root.querySelector('.title-fill');
  const bar = root.querySelector('.title-bar');
  // 외곽선 층과 채움 층에 같은 글자를 넣습니다. 채움 층만 대각선으로 잘라 보이게 합니다.
  const setText = lines => {
    for (const layer of [outline, fill]) {
      layer.replaceChildren(...lines.map(line => {
        const span = document.createElement('span');
        span.textContent = line;
        return span;
      }));
    }
  };

  // 모든 문구 중 가장 긴 줄의 너비(글자 크기 1em 기준)를 재서 칠판 너비를 넘지 않게 합니다.
  let widestEm = 3.9;
  const measureWidest = () => {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.font = `100px ${getComputedStyle(fill).fontFamily}`;
    widestEm = Math.max(...messages.flat().map(line => ctx.measureText(line).width / 100 + line.length * 0.01));
    lastLayout = '';
  };
  document.fonts.load('100px Anton').then(measureWidest, measureWidest);

  // 칠판 면의 네 모서리를 화면 픽셀로 바꿔, 타이틀이 칠판 안에 들어가도록 위치·크기를 정합니다.
  // 칠판은 비스듬히 보이므로 네 모서리 중 안쪽 값만 써서 항상 칠판 안에 들어가게 합니다.
  const point = new THREE.Vector3();
  let lastLayout = '';
  function followBoard(camera, corners) {
    const screen = {};
    for (const [name, corner] of Object.entries(corners)) {
      point.copy(corner).project(camera);
      // 카메라 뒤쪽(도입부에서 천장을 볼 때)이면 위치를 갱신하지 않습니다.
      if (point.z < -1 || point.z > 1) return;
      screen[name] = { x: (point.x + 1) / 2 * innerWidth, y: (1 - point.y) / 2 * innerHeight };
    }
    const boardLeft = Math.max(screen.topLeft.x, screen.bottomLeft.x);
    const boardRight = Math.min(screen.topRight.x, screen.bottomRight.x);
    const boardTop = Math.max(screen.topLeft.y, screen.topRight.y);
    const boardBottom = Math.min(screen.bottomLeft.y, screen.bottomRight.y);
    // 칠판 왼쪽이 화면 밖이면 막대를 화면 왼쪽 끝에 붙입니다.
    const left = Math.max(boardLeft, 0);
    const width = (boardRight - left) * 0.96;
    const height = boardBottom - boardTop;
    if (width <= 0 || height <= 0) return;
    // 글자 크기: 두 줄이 칠판 높이의 약 80%가 되게 하되, 가장 긴 줄이 너비를 넘지 않게 합니다.
    // (막대+간격 0.36em, 여유 5%)
    const font = Math.min(height * 0.8 / 1.94, width * 0.95 / (widestEm + 0.36));
    const top = boardTop + (height - font * 1.94) / 2;
    const layout = [left, top, width, font].map(Math.round).join();
    if (layout === lastLayout) return;
    lastLayout = layout;
    root.style.left = `${Math.round(left)}px`;
    root.style.top = `${Math.round(top)}px`;
    root.style.width = `${Math.round(width)}px`;
    root.style.setProperty('--font', `${Math.round(font)}px`);
    // 파란 상자는 타이틀 왼쪽 끝에서 화면 오른쪽 끝까지 이어집니다.
    root.style.setProperty('--wipe-width', `${Math.round(innerWidth - left)}px`);
  }

  // 움직임 줄이기 설정이면 이름과 막대만 고정으로 보여줍니다.
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    setText(messages[0]);
    measureWidest();
    bar.classList.add('shown');
    return { followBoard };
  }

  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  // 파란 상자: 화면 오른쪽 끝에서 왼쪽 끝까지 늘어났다가(왼쪽 가장자리 이동),
  // 오른쪽 가장자리가 왼쪽으로 줄어들어 막대만 남습니다(오른쪽 가장자리 이동).
  // 하나의 애니메이션으로 이어 붙이고, 앞은 가속·뒤는 감속이라 다 늘어나는 순간에 가장 빠르고 멈추지 않습니다.
  const sweep = () => wipe.animate([
    { clipPath: hidden, easing: 'cubic-bezier(.5,0,1,1)' },
    { clipPath: covered, offset: timing.coverAt, easing: 'cubic-bezier(0,0,.4,1)' },
    { clipPath: barOnly },
  ], { duration: timing.sweep, fill: 'forwards' }).finished;

  // 대각선(/) 경계를 왼쪽 → 오른쪽으로 옮깁니다. at은 경계의 가로 위치(%)입니다.
  const rightOf = at => `polygon(${at + slant}% 0, 100% 0, 100% 100%, ${at - slant}% 100%)`;
  const leftOf = at => `polygon(0 0, ${at + slant}% 0, ${at - slant}% 100%, 0 100%)`;
  const start = -slant, end = 100 + slant;
  const diagonal = (from, to, duration) => fill.animate(
    [{ clipPath: from }, { clipPath: to }],
    { duration, easing: 'cubic-bezier(.6,0,.3,1)', fill: 'forwards' },
  ).finished;

  (async () => {
    await wait(timing.delay);
    // 처음 한 번만 파란 상자가 지나가며 첫 문구를 보여줍니다.
    const done = sweep();
    await wait(timing.sweep * timing.coverAt);
    setText(messages[0]);
    await done;
    bar.classList.add('shown');
    // 첫 바퀴에서 문구가 바뀐 횟수(이름 → 클릭 → 이름이면 messages.length번)를 세어,
    // 한 바퀴가 끝나면 머무는 시간을 longHold로 늘립니다.
    let changes = 0;
    for (let i = 1; ; i = (i + 1) % messages.length) {
      await wait(changes < messages.length ? timing.hold : timing.longHold);
      changes++;
      // 채움이 왼쪽부터 대각선으로 사라져 외곽선만 남습니다.
      await diagonal(rightOf(start), rightOf(end), timing.fillOut);
      await wait(timing.outlineHold);
      // 외곽선만 보이는 상태에서 글자를 바꾸고, 새 글자가 왼쪽부터 대각선으로 채워집니다.
      setText(messages[i]);
      await diagonal(leftOf(start), leftOf(end), timing.fillIn);
    }
  })();
  return { followBoard };
}
