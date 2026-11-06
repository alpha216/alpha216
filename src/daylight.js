import * as THREE from 'three';

// 방문자의 현재 시각으로 해의 위치를 계산하고, 햇빛·하늘·실내 조명을 그 시각에 맞춥니다.
// 위치 권한을 묻지 않도록 위도는 Auburn, AL(32.6°N)로 고정합니다.
// 미리보기: 주소 뒤에 ?time=18:45 (원하는 시각), ?date=2026-06-21 (원하는 날짜), ?speed=600 (600배 빠르게) 를 붙입니다.
const LATITUDE = 32.61 * Math.PI / 180;
const deg = Math.PI / 180;

// 방문자 시각(또는 미리보기 시각)을 돌려줍니다.
function createClock() {
  const params = new URLSearchParams(location.search);
  const base = new Date();
  const date = params.get('date')?.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (date) base.setFullYear(+date[1], +date[2] - 1, +date[3]);
  const time = params.get('time')?.match(/^(\d{1,2}):(\d{2})$/);
  if (time) base.setHours(+time[1], +time[2], 0, 0);
  const speed = Math.max(Number(params.get('speed')) || 1, 0);
  const startedAt = performance.now();
  return () => new Date(base.getTime() + (performance.now() - startedAt) * speed);
}

// 해의 고도(지평선 위 각도)와 방위(남쪽 0, 서쪽 +, 동쪽 −)를 라디안으로 계산합니다.
// 방문자 시계의 12시(서머타임이면 13시)를 태양이 가장 높은 정오로 봅니다.
export function sunPosition(date) {
  const startOfYear = new Date(date.getFullYear(), 0, 1);
  const dayOfYear = Math.floor((date - startOfYear) / 86400000) + 1;
  // 서머타임 중이면 1월보다 시차가 줄어듭니다. 그만큼 태양 시각을 빼 줍니다.
  const daylightSaving = (startOfYear.getTimezoneOffset() - date.getTimezoneOffset()) / 60;
  const solarHours = date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600 - daylightSaving;
  const hourAngle = (solarHours - 12) * 15 * deg;
  // 계절에 따른 태양의 남북 위치(적위)
  const declination = -23.44 * deg * Math.cos(2 * Math.PI / 365 * (dayOfYear + 10));
  const elevation = Math.asin(Math.sin(LATITUDE) * Math.sin(declination)
    + Math.cos(LATITUDE) * Math.cos(declination) * Math.cos(hourAngle));
  const azimuth = Math.atan2(Math.sin(hourAngle),
    Math.cos(hourAngle) * Math.sin(LATITUDE) - Math.tan(declination) * Math.cos(LATITUDE));
  return { elevation, azimuth };
}

// 실제 방위를 장면 방향으로 바꿉니다. 창밖(+X)이 대략 남쪽입니다.
// 해는 오른쪽(+Z, 카메라 뒤쪽)에서 떠서, 한낮에는 창 오른쪽 위에서 칠판 쪽으로 비스듬히 비추고,
// 저녁에는 창 너머 정면 쪽(카메라에서 보이는 하늘)으로 집니다.
function sceneDirection({ elevation, azimuth }, target = new THREE.Vector3()) {
  const sceneAzimuth = (35 - azimuth / deg * 45 / 90) * deg; // 동(−90°) → +80°, 남(0°) → +35°, 서(+90°) → −10°
  return target.set(
    Math.cos(elevation) * Math.cos(sceneAzimuth),
    Math.sin(elevation),
    Math.cos(elevation) * Math.sin(sceneAzimuth),
  ).normalize();
}

const smooth = (edge0, edge1, x) => THREE.MathUtils.smoothstep(x, edge0, edge1);

export function createDaylight({ renderer, scene, sunlight, sky, hemisphere, rim, indoorFill, lamps, flowerMaterial }) {
  const now = createClock();
  const sunDirection = new THREE.Vector3();
  const lastShadowDirection = new THREE.Vector3();
  // 달빛: 해가 진 뒤 창밖에서 들어오는 약한 푸른빛(그림자 없음)
  const moon = new THREE.DirectionalLight('#9fb4ff', 0);
  moon.position.set(10, 12, 3);
  scene.add(moon);

  const colors = {
    sunWarm: new THREE.Color('#ff9a5c'), sunWhite: new THREE.Color('#fff5f4'),
    skyDay: new THREE.Color('#dfeaff'), skyDusk: new THREE.Color('#f2b8a6'), skyNight: new THREE.Color('#2a3558'),
    groundDay: new THREE.Color('#777c91'), groundNight: new THREE.Color('#1c1f2b'),
  };

  function update() {
    const sun = sunPosition(now());
    const elevation = sun.elevation / deg;
    sceneDirection(sun, sunDirection);

    // 0~1 값들: day(낮), twilight(해 뜨고 질 무렵), night(밤), lampsOn(실내 조명)
    const day = smooth(-4, 8, elevation);
    const twilight = THREE.MathUtils.clamp(1 - Math.abs(elevation - 2) / 12, 0, 1); // 고도 -10°~14° 사이, 2°에서 가장 진함
    const night = 1 - smooth(-10, -3, elevation);
    const lampsOn = 1 - smooth(-4, 3, elevation); // 해 지기 직전부터 서서히 켜집니다.

    // 햇빛: 해가 지평선에 가까울수록 약하고 주황색, 높을수록 강하고 흰색
    sunlight.position.copy(sunlight.target.position).addScaledVector(sunDirection, 25);
    sunlight.intensity = 15 * smooth(-1, 6, elevation);
    sunlight.color.copy(colors.sunWarm).lerp(colors.sunWhite, smooth(2, 25, elevation));

    // 하늘 셰이더
    const uniforms = sky.material.uniforms;
    uniforms.uSunDir.value.copy(sunDirection);
    uniforms.uDay.value = day;
    uniforms.uTwilight.value = twilight * twilight * (3 - 2 * twilight);
    uniforms.uNight.value = night;

    // 실내 주변광: 낮에는 밝은 하늘빛, 해질녘엔 분홍빛, 밤엔 어두운 남색
    hemisphere.intensity = THREE.MathUtils.lerp(.1, .48, day);
    hemisphere.color.copy(colors.skyNight).lerp(colors.skyDay, day).lerp(colors.skyDusk, twilight * .5);
    hemisphere.groundColor.copy(colors.groundNight).lerp(colors.groundDay, day);
    rim.intensity = .18 * day;
    indoorFill.intensity = .12 * day;
    moon.intensity = .45 * night;

    // 천장 형광등: 해가 지면 켜집니다.
    lamps.material.emissiveIntensity = .14 + 2.6 * lampsOn;
    for (const lamp of lamps.lights) lamp.intensity = 14 * lampsOn;

    // 벚꽃은 낮에만 은은하게 빛나고, 밤에는 거의 어둡게
    flowerMaterial.emissiveIntensity = .04 + .26 * day;
    renderer.toneMappingExposure = THREE.MathUtils.lerp(1.15, 1.3, day);

    // 그림자는 매 프레임 다시 그리지 않고, 해가 0.2° 이상 움직였을 때만 다시 그립니다.
    if (lastShadowDirection.angleTo(sunDirection) > .2 * deg || lastShadowDirection.lengthSq() === 0) {
      lastShadowDirection.copy(sunDirection);
      renderer.shadowMap.needsUpdate = true;
    }
  }
  update();
  return { update };
}
