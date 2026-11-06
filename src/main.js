import './style.css';
import { buildClassroom } from './classroom.js';
import * as THREE from 'three';
import { createCherryBlossomTree } from './tree.js';
import { startTitleOverlay } from './titleOverlay.js';
import { createDaylight } from './daylight.js';
import { startSections } from './sections.js';

// 운영체제의 ‘움직임 줄이기’ 설정: 켜져 있으면 나무 애니메이션을 생략합니다.
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
try {
  // Scene은 물체와 조명을 담고, renderer는 카메라 시점의 장면을 canvas에 그립니다.
  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#c4d5ee');
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
  // 고밀도 화면에서도 GPU 부하가 과도해지지 않도록 해상도 배율을 2로 제한합니다.
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  document.querySelector('#scene').appendChild(renderer.domElement);

  // 원근 카메라: 화각, 화면 비율, 가까운 표시 거리, 먼 표시 거리 순서입니다.
  // 실제 위치와 최종 화각은 classroom.js의 resize()에서 설정합니다.
  const camera = new THREE.PerspectiveCamera(40, 1, .1, 100);
  // 주변광을 낮춰 햇빛이 닿지 않는 실내는 어둡게 유지합니다.
  const hemisphere = new THREE.HemisphereLight('#dfeaff', '#777c91', .48);
  scene.add(hemisphere);
  const light = new THREE.DirectionalLight('#fff5f4', 3.4);
  light.position.set(-5, 10, 7);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, {left:-6,right:6,top:7,bottom:-7,near:.5,far:30});
  light.shadow.normalBias = .015;
  light.shadow.bias = -.0002;
  scene.add(light);
  const rim = new THREE.DirectionalLight('#e8e8ff', .18);
  rim.position.set(5, 6, -4);
  scene.add(rim);
  const indoorFill = new THREE.DirectionalLight('#e8efff',.12);
  indoorFill.position.set(0,4,9);scene.add(indoorFill);

  // 줄기·가지·꽃을 한 그룹에 담아 이동과 회전을 함께 적용합니다.
  const tree = createCherryBlossomTree();
  scene.add(tree);
  // 교실을 생성한 뒤 반환받은 화면 크기 대응 함수를 등록합니다.
  const { resize, update, setView, boardCorners, sky, lamps } = buildClassroom(scene, tree, renderer, camera, light);
  // 방문자 시각에 맞춰 해·하늘·조명을 바꿉니다(움직임 줄이기 설정과 상관없이 동작).
  const daylight = createDaylight({
    renderer, scene, sunlight: light, sky, hemisphere, rim, indoorFill, lamps,
    flowerMaterial: tree.userData.flowerMaterial,
  });
  resize(); addEventListener('resize', resize);
  const title = startTitleOverlay();
  const sections = startSections({ setView });
  // 매 프레임 나무 전체를 미세하게 흔듭니다. 가지별 물리 시뮬레이션은 아닙니다.
  let previousFrame = null;
  document.addEventListener('visibilitychange', () => { previousFrame = null; });
  renderer.setAnimationLoop(now => {
    const deltaSeconds = previousFrame === null ? 0 : Math.max((now - previousFrame) / 1000, 0);
    previousFrame = now;
    if (document.hidden) { previousFrame = null; return; }
    if (!reduced) update(deltaSeconds);
    daylight.update();
    if (!reduced) tree.rotation.z = Math.sin(now * .0006) * .006;
    // 메뉴 섹션에서는 장면을 드물게만 그려, 그 위 메뉴·내용 스크롤이 끊기지 않게 합니다(sections.js).
    if (!sections.shouldRender(now)) return;
    renderer.render(scene, camera);
    // 카메라가 움직이거나 창 크기가 바뀌어도 타이틀이 칠판 위에 붙어 있도록 매 프레임 위치를 맞춥니다.
    title.followBoard(camera, boardCorners);
    // 첫 프레임의 그림자를 재사용해 비용을 줄입니다. 나무가 흔들려도 그림자는 고정됩니다.
    renderer.shadowMap.autoUpdate = false;
  });
  // GPU 연결을 잃으면 안내 문구를 표시합니다. 별도 장면 재생성 로직은 없습니다.
  renderer.domElement.addEventListener('webglcontextlost', event => {
    event.preventDefault(); document.querySelector('#error').hidden = false;
  });
} catch (error) {
  console.error(error);
  document.querySelector('#error').hidden = false;
}
