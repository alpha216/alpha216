// 섹션 전환과 메뉴 페이지 스크롤
//
// 첫 화면 → 메뉴 섹션: 클릭·아래로 스크롤·아래 방향키·위로 스와이프.
//   파란 박스가 왼쪽에서 들어와 화면을 다 덮고 → 그 사이 섹션과 카메라 시점을 바꾸고 → 박스가 오른쪽으로 빠집니다.
//   돌아갈 때는 반대로 오른쪽에서 들어와 왼쪽으로 빠집니다.
// 메뉴 섹션: 모든 페이지(ABOUT, PROJECTS의 프로젝트 하나하나, EXPERIENCES …)가 세로로 이어진 하나의 트랙입니다.
//   데스크톱: 한 번 스크롤(트랙패드 한 번 쓸기, 휠 한 칸, 방향키)하면 다음 칸까지 이어서 부드럽게 내려갑니다.
//   휴대폰: 손가락으로 자유롭게 스크롤합니다.
//   어느 쪽이든 지금 보이는 페이지가 왼쪽 메뉴에 선택 표시되고, 맨 위에서 위로 올리면 첫 화면으로 돌아갑니다.

// coverIn: 파란 박스가 다 덮을 때까지, hold: 다 덮인 채 머무는 시간, coverOut: 빠지는 시간
// step: 한 칸 스크롤 시간, jumpMax: 메뉴를 눌러 여러 칸을 건너뛸 때 최대 시간
const timing = { coverIn: 450, hold: 120, coverOut: 450, step: 700, jumpMax: 1100 };
const clip = {
  fromLeft: 'inset(0 100% 0 0)',
  fromRight: 'inset(0 0 0 100%)',
  full: 'inset(0 0 0 0)',
};
// 천천히 출발해 가운데서 빠르고 부드럽게 멈추는 곡선
const ease = t => (t < .5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);

// setView: 카메라 시점을 'home' 또는 'menu'로 바꾸는 함수(classroom.js)
export function startSections({ setView }) {
  const home = document.querySelector('#home');
  const next = document.querySelector('#next');
  const cover = document.querySelector('#cover');
  const panel = next.querySelector('.panel');
  const buttons = [...next.querySelectorAll('.menu button')];
  const pages = [...next.querySelectorAll('.page')];
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const desktop = matchMedia('(min-width: 761px)');
  let onNext = false;
  let covering = false; // 파란 박스 전환 중
  let scrolling = false; // 한 칸 스크롤 애니메이션 중

  // ── 첫 화면 ↔ 메뉴 섹션 (파란 박스) ──
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const move = (from, to, duration) => cover.animate(
    [{ clipPath: from }, { clipPath: to }],
    { duration, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' },
  ).finished;
  const go = async toNext => {
    if (covering || toNext === onNext) return;
    covering = true;
    if (!reduced) await move(toNext ? clip.fromLeft : clip.fromRight, clip.full, timing.coverIn);
    // 박스가 화면을 다 덮은 동안 섹션과 시점을 바꿉니다.
    onNext = toNext;
    home.hidden = toNext;
    next.hidden = !toNext;
    setView(toNext ? 'menu' : 'home');
    if (toNext) highlight();
    if (!reduced) {
      await wait(timing.hold);
      await move(clip.full, toNext ? clip.fromRight : clip.fromLeft, timing.coverOut);
    }
    covering = false;
  };

  // ── 메뉴 트랙: 멈출 자리(stops) ──
  // 페이지 시작점마다 한 자리. 화면보다 긴 페이지(PROJECTS 등)는 화면 한 장마다 한 자리씩 더 둡니다.
  const stops = () => {
    const height = panel.clientHeight;
    const max = panel.scrollHeight - height;
    const list = [];
    for (const page of pages) {
      for (let y = page.offsetTop; y < page.offsetTop + page.offsetHeight - height / 2; y += height) {
        list.push(Math.min(Math.round(y), max));
      }
      if (page.offsetHeight < height / 2) list.push(Math.min(page.offsetTop, max));
    }
    return [...new Set(list)].sort((a, b) => a - b);
  };
  // scrollTop을 직접 움직이는 애니메이션(브라우저 smooth 스크롤보다 속도·곡선을 일정하게 맞출 수 있습니다).
  let animation = 0;
  const scrollToY = (target, duration = timing.step) => new Promise(resolve => {
    cancelAnimationFrame(animation);
    const start = panel.scrollTop;
    const distance = target - start;
    if (reduced || Math.abs(distance) < 1) { panel.scrollTop = target; resolve(); return; }
    scrolling = true;
    const began = performance.now();
    const frame = now => {
      const t = Math.min((now - began) / duration, 1);
      panel.scrollTop = start + distance * ease(t);
      if (t < 1) animation = requestAnimationFrame(frame);
      else { scrolling = false; resolve(); }
    };
    animation = requestAnimationFrame(frame);
  });

  // 한 칸 위·아래로. 맨 위에서 위로 가면 첫 화면으로 돌아갑니다.
  const step = direction => {
    if (covering || scrolling) return;
    if (!onNext) { if (direction > 0) go(true); return; }
    if (!desktop.matches) return; // 휴대폰은 브라우저가 직접 스크롤
    const list = stops();
    const y = panel.scrollTop;
    // 지금 위치에서 가장 가까운 자리 기준으로 다음(이전) 자리
    let here = 0;
    list.forEach((stop, i) => { if (Math.abs(stop - y) < Math.abs(list[here] - y)) here = i; });
    const target = here + direction;
    if (target < 0) { go(false); return; }
    if (target >= list.length) return;
    scrollToY(list[target]);
  };

  // 판의 위쪽 여백(휴대폰은 메뉴가 위 36%를 차지해 그만큼 내용이 아래에서 시작합니다. 데스크톱은 0)
  const topInset = () => parseFloat(getComputedStyle(panel).paddingTop) || 0;
  // 페이지가 내용 영역 맨 위에 오게 하는 스크롤 위치
  const pageTop = page => Math.min(Math.max(page.offsetTop - topInset(), 0), panel.scrollHeight - panel.clientHeight);

  // ── 왼쪽 메뉴 선택 표시: 지금 보이는 페이지 ──
  let current = -1;
  const highlight = () => {
    // 데스크톱은 화면 가운데, 휴대폰은 내용 영역 위쪽에서 조금 아래 지점에 걸린 페이지
    const probe = panel.scrollTop + (desktop.matches ? panel.clientHeight / 2 : topInset() + panel.clientHeight * .15);
    let index = 0;
    pages.forEach((page, i) => { if (page.offsetTop <= probe) index = i; });
    if (index === current) return;
    current = index;
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
  };
  let highlightQueued = false;
  panel.addEventListener('scroll', () => {
    if (highlightQueued) return;
    highlightQueued = true;
    requestAnimationFrame(() => { highlightQueued = false; highlight(); });
  }, { passive: true });
  // 메뉴를 누르면 그 페이지로 이어서 스크롤합니다(멀수록 조금 더 길게).
  buttons.forEach((button, i) => button.addEventListener('click', () => {
    const target = pageTop(pages[i]);
    const screens = Math.abs(target - panel.scrollTop) / panel.clientHeight;
    scrollToY(target, Math.min(timing.step + screens * 120, timing.jumpMax));
  }));
  addEventListener('resize', () => { if (onNext) highlight(); });

  // ── 입력 ──
  // 트랙패드는 한 번 쓸면 관성 때문에 1초 넘게 휠 이벤트가 이어집니다.
  // 새 동작의 시작(잠시 쉬었다가 오거나, 줄어들던 값이 갑자기 커질 때)에서만 한 칸 넘깁니다.
  let lastWheel = 0;
  let lastDelta = 0;
  let gestureUsed = false;
  addEventListener('wheel', event => {
    // 메뉴 섹션 데스크톱에서는 브라우저 기본 스크롤 대신 한 칸씩 넘깁니다.
    if (onNext && desktop.matches) event.preventDefault();
    const now = performance.now();
    const delta = Math.abs(event.deltaY) * (event.deltaMode === 1 ? 16 : 1);
    const fresh = now - lastWheel > 180 || (delta > lastDelta * 1.6 + 4 && delta > 20);
    lastWheel = now;
    lastDelta = delta;
    if (fresh) gestureUsed = false;
    if (gestureUsed || delta < 4) return;
    if (!onNext || desktop.matches) {
      gestureUsed = true;
      step(Math.sign(event.deltaY));
    } else if (event.deltaY < 0 && panel.scrollTop <= 0) {
      // 휴대폰 크기 창에서 휠을 쓴 경우: 맨 위에서 위로 올리면 첫 화면으로
      gestureUsed = true;
      go(false);
    }
  }, { passive: false });

  addEventListener('keydown', event => {
    // 메뉴 버튼에 포커스가 있을 때 Space는 버튼 누르기로 둡니다.
    if (event.key === ' ' && event.target.closest?.('button')) return;
    const direction = ['ArrowDown', 'PageDown', ' '].includes(event.key) ? 1
      : ['ArrowUp', 'PageUp'].includes(event.key) ? -1 : 0;
    if (!direction) return;
    event.preventDefault();
    if (onNext && !desktop.matches) {
      if (direction < 0 && panel.scrollTop <= 0) go(false);
      else panel.scrollBy({ top: direction * panel.clientHeight * .6, behavior: reduced ? 'auto' : 'smooth' });
      return;
    }
    step(direction);
  });

  // 터치: 첫 화면에서 위로 쓸면 메뉴 섹션으로, 메뉴 섹션 맨 위에서 아래로 쓸면 첫 화면으로.
  // 그 밖에는 브라우저가 직접 스크롤합니다(휴대폰).
  let touchY = null;
  let touchStartTop = 0;
  addEventListener('touchstart', event => {
    touchY = event.touches[0].clientY;
    touchStartTop = panel.scrollTop;
  }, { passive: true });
  addEventListener('touchend', event => {
    if (touchY === null) return;
    const moved = touchY - event.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(moved) < 40) return;
    if (!onNext) { if (moved > 0) go(true); return; }
    if (moved < 0 && touchStartTop <= 0 && panel.scrollTop <= 0) go(false);
    else if (desktop.matches) step(Math.sign(moved));
  }, { passive: true });
  // 데스크톱 터치스크린에서는 손가락 스크롤 대신 한 칸씩 넘깁니다.
  panel.addEventListener('touchmove', event => { if (desktop.matches) event.preventDefault(); }, { passive: false });

  home.addEventListener('click', () => go(true));

  // 3D 장면을 이번 프레임에 그릴지. 메뉴 섹션에서는 카메라가 멈춰 있고 장면 대부분이 판에 가려지므로
  // 스크롤 중에는 그리지 않고, 그 밖에는 초당 약 6번만 그려 스크롤이 끊기지 않게 합니다.
  let lastRender = 0;
  const shouldRender = now => {
    if (!onNext || covering) { lastRender = now; return true; }
    if (scrolling) return false;
    if (now - lastRender < 160) return false;
    lastRender = now;
    return true;
  };
  return { shouldRender };
}
