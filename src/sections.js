// 첫 화면에서 클릭·아래로 스크롤·아래 방향키·위로 스와이프하면 다음 섹션(메뉴)으로,
// 다음 섹션에서 위로 스크롤·위 방향키·아래로 스와이프하면 첫 화면으로 돌아갑니다.
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

  // 메뉴: 누른 항목을 선택 표시하고 그 내용만 보여줍니다.
  const buttons = [...next.querySelectorAll('.menu button')];
  const pages = [...next.querySelectorAll('.page')];
  for (const button of buttons) {
    button.addEventListener('click', () => {
      for (const other of buttons) other.removeAttribute('aria-current');
      button.setAttribute('aria-current', 'true');
      for (const page of pages) page.hidden = page.dataset.page !== button.dataset.page;
    });
  }

  home.addEventListener('click', () => go(true));
  addEventListener('wheel', event => {
    // 내용이 길어 스크롤 중이면(맨 위가 아니면) 첫 화면으로 돌아가지 않습니다.
    if (onNext && event.deltaY < 0 && event.target.closest?.('.panel')?.scrollTop > 0) return;
    if (Math.abs(event.deltaY) > 10) go(event.deltaY > 0);
  }, { passive: true });
  addEventListener('keydown', event => {
    if (event.target.closest?.('button')) return;
    if (['ArrowDown', 'PageDown', ' '].includes(event.key)) go(true);
    if (['ArrowUp', 'PageUp'].includes(event.key)) go(false);
  });
  let touchY = null;
  addEventListener('touchstart', event => { touchY = event.touches[0].clientY; }, { passive: true });
  addEventListener('touchend', event => {
    if (touchY === null) return;
    const moved = touchY - event.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(moved) > 40) go(moved > 0);
  }, { passive: true });
}
