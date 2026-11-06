// 첫 화면에서 클릭·아래로 스크롤·아래 방향키·위로 스와이프하면 다음 섹션(메뉴)으로 넘어갑니다.
// 메뉴 섹션에서는 내용 끝에서 아래로 스크롤하면 다음 메뉴 항목, 내용 시작에서 위로 스크롤하면 이전 항목으로 가고,
// 첫 항목(ABOUT)에서 위로 스크롤하면 첫 화면으로 돌아갑니다.
// 전환: 파란 박스가 왼쪽에서 들어와 화면을 다 덮고 → 그 사이 섹션과 카메라 시점을 바꾸고 → 박스가 오른쪽으로 빠집니다.
// 돌아갈 때는 반대로 오른쪽에서 들어와 왼쪽으로 빠집니다.
// coverIn: 다 덮을 때까지, hold: 다 덮인 채 머무는 시간, coverOut: 빠지는 시간
const timing = { coverIn: 450, hold: 120, coverOut: 450 };
const clip = {
  fromLeft: 'inset(0 100% 0 0)',
  fromRight: 'inset(0 0 0 100%)',
  full: 'inset(0 0 0 0)',
};

// setView: 카메라 시점을 'home' 또는 'menu'로 바꾸는 함수(classroom.js)
export function startSections({ setView }) {
  const home = document.querySelector('#home');
  const next = document.querySelector('#next');
  const cover = document.querySelector('#cover');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let onNext = false;
  let busy = false;
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const move = (from, to, duration) => cover.animate(
    [{ clipPath: from }, { clipPath: to }],
    { duration, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' },
  ).finished;
  const swap = toNext => {
    onNext = toNext;
    home.hidden = toNext;
    next.hidden = !toNext;
    setView(toNext ? 'menu' : 'home');
  };

  const go = async toNext => {
    if (busy || toNext === onNext) return;
    busy = true;
    if (!reduced) await move(toNext ? clip.fromLeft : clip.fromRight, clip.full, timing.coverIn);
    // 박스가 화면을 다 덮은 동안 섹션과 시점을 바꿉니다.
    swap(toNext);
    if (!reduced) {
      await wait(timing.hold);
      await move(clip.full, toNext ? clip.fromRight : clip.fromLeft, timing.coverOut);
    }
    busy = false;
  };

  // 메뉴: 누른 항목(또는 스크롤로 넘어간 항목)을 선택 표시하고 그 내용만 보여줍니다.
  const panel = next.querySelector('.panel');
  const buttons = [...next.querySelectorAll('.menu button')];
  const pages = [...next.querySelectorAll('.page')];
  let current = 0;
  const showPage = (index, direction = 1) => {
    if (index === current) return;
    current = index;
    buttons.forEach((button, i) => {
      if (i === index) button.setAttribute('aria-current', 'true');
      else button.removeAttribute('aria-current');
    });
    pages.forEach((page, i) => { page.hidden = i !== index; });
    // 아래로 넘어가면 맨 위부터, 위로 넘어가면 맨 아래부터 보여줍니다.
    panel.scrollTop = direction > 0 ? 0 : panel.scrollHeight;
    if (!reduced) {
      pages[index].animate(
        [{ opacity: 0, transform: `translateY(${direction * 24}px)` }, { opacity: 1, transform: 'none' }],
        { duration: 320, easing: 'cubic-bezier(.2,.7,.3,1)' },
      );
    }
  };
  buttons.forEach((button, i) => button.addEventListener('click', () => showPage(i, i > current ? 1 : -1)));

  // 한 번 스크롤(트랙패드 관성 포함)에 한 칸만 넘어가도록, 넘어간 뒤 잠깐 입력을 무시합니다.
  let lockedUntil = 0;
  const atTop = () => panel.scrollTop <= 1;
  const atBottom = () => panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 1;
  // direction: 1 = 아래로, -1 = 위로. 내용 끝(또는 시작)에 닿아 있을 때만 다음(이전) 칸으로 넘어갑니다.
  const step = direction => {
    if (busy || performance.now() < lockedUntil) return;
    if (!onNext) {
      if (direction > 0) { lockedUntil = performance.now() + 900; go(true); }
      return;
    }
    if (direction > 0 ? !atBottom() : !atTop()) return;
    lockedUntil = performance.now() + 700;
    const target = current + direction;
    if (target < 0) go(false);
    else if (target < pages.length) showPage(target, direction);
  };

  home.addEventListener('click', () => go(true));
  addEventListener('wheel', event => {
    // 스크롤이 계속 들어오는 동안(관성) 잠금을 연장해, 한 번 쓸어내린 것이 두 칸을 넘기지 않게 합니다.
    if (performance.now() < lockedUntil) { lockedUntil = Math.max(lockedUntil, performance.now() + 200); return; }
    if (Math.abs(event.deltaY) > 10) step(Math.sign(event.deltaY));
  }, { passive: true });
  addEventListener('keydown', event => {
    // 메뉴 버튼에 포커스가 있을 때 Space는 버튼 누르기로 둡니다.
    if (event.key === ' ' && event.target.closest?.('button')) return;
    if (['ArrowDown', 'PageDown', ' '].includes(event.key)) { event.preventDefault(); step(1); }
    if (['ArrowUp', 'PageUp'].includes(event.key)) { event.preventDefault(); step(-1); }
  });
  let touchY = null;
  addEventListener('touchstart', event => { touchY = event.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', event => {
    if (touchY === null) return;
    const moved = touchY - event.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(moved) > 40) step(Math.sign(moved));
  }, { passive: true });
}
