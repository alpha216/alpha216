import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 독립적인 벚꽃나무를 생성합니다. 장면 배치와 조명은 호출하는 쪽에서 관리합니다.
// 줄기 → 큰 가지 몇 개 → 계속 갈라지는 잔가지 순서로 자라고,
// 꽃은 바깥쪽 잔가지를 따라 작은 송이로 달려 사이사이로 하늘이 보이게 합니다.
export function createCherryBlossomTree() {
  const tree = new THREE.Group();
  // 역광이라 그늘진 쪽이 보이므로, 아주 약하게 자체 발광을 줘서 완전히 검게 죽지 않게 합니다.
  const bark = new THREE.MeshStandardMaterial({ color: '#6e5a5a', emissive: '#2a1f22', roughness: .93 });
  // 고정 시드 난수: 새로고침해도 동일한 나무가 생성됩니다.
  let seed = 51;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const spread = amount => (random() - .5) * 2 * amount;
  // 꽃 전용 난수: 꽃 설정을 바꿔도 가지 모양(위의 random 순서)이 바뀌지 않게 따로 씁니다.
  let bloomSeed = 977;
  const bloom = () => { bloomSeed = (bloomSeed * 1664525 + 1013904223) >>> 0; return bloomSeed / 4294967296; };
  const bloomSpread = amount => (bloom() - .5) * 2 * amount;

  // 모양 조절값
  const shape = {
    trunkHeight: 2.4,   // 첫 갈래가 나뉘는 높이
    limbs: 6,           // 줄기에서 나오는 큰 가지 수
    limbLength: 2.5,   // 큰 가지 길이
    depth: 5,           // 큰 가지가 몇 단계까지 갈라지는지
    shrink: .72,        // 단계마다 가지 길이 비율
    thin: .55,          // 단계마다 가지 굵기 비율
    // 바깥쪽 가지들에서 짧고 가는 꽃가지가 나오고, 꽃은 꽃가지 끝과 중간에 조금씩만 달립니다.
    twigLevels: 2,       // 바깥에서 몇 단계 가지까지 꽃가지를 낼지
    twigGap: .13,        // 꽃가지 간격(가지를 따라). 작을수록 꽃가지가 많아집니다.
    twigLength: .32,     // 꽃가지 길이
    flowerChance: .85,   // 꽃가지 하나에 꽃이 달릴 확률. 낮을수록 듬성듬성해집니다.
    flowersPerTwig: 2,   // 꽃가지 끝에 달리는 꽃 수(이 값 ±1)
    midFlowerChance: .5, // 꽃가지 중간에 한 송이가 더 달릴 확률
    // 건물(교실) 쪽 방향(나무 기준 +Z). 이 방향으로는 가지가 거의 뻗지 않게 해서 벽을 뚫지 않게 합니다.
    wallSide: .2,
  };

  const branchGeometries = [];
  const thickPoints = [];
  const up = new THREE.Vector3(0, 1, 0);
  // 제어점을 지나는 곡선을 따라 하나의 매끈한 관(tube)을 만들고, 끝으로 갈수록 가늘게 줄입니다.
  // 짧은 원기둥을 이어 붙이면 마디마다 줄무늬가 보여서 관 하나로 만듭니다.
  function curvedBranch(points, base, tip) {
    const curve = new THREE.CatmullRomCurve3(points);
    const steps = base > .1 ? 16 : base > .03 ? 6 : 3;
    const sides = base > .1 ? 12 : base > .03 ? 7 : 5;
    const geometry = new THREE.TubeGeometry(curve, steps, 1, sides, false);
    // TubeGeometry는 반지름 1로 만들어지므로, 고리(ring)마다 중심에서의 거리를 원하는 굵기로 줄입니다.
    const position = geometry.attributes.position;
    const center = new THREE.Vector3(), vertex = new THREE.Vector3();
    for (let i = 0; i <= steps; i++) {
      curve.getPointAt(i / steps, center);
      const radius = THREE.MathUtils.lerp(base, tip, i / steps);
      for (let j = 0; j <= sides; j++) {
        const index = i * (sides + 1) + j;
        vertex.fromBufferAttribute(position, index).sub(center).multiplyScalar(radius).add(center);
        position.setXYZ(index, vertex.x, vertex.y, vertex.z);
      }
    }
    branchGeometries.push(geometry);
    // 굵은 가지(반지름 4cm 이상)는 위치를 몇 군데 기록해 둡니다. 창에서 보이는지 확인할 때 씁니다.
    if (base >= .04) for (let i = 0; i <= 4; i++) thickPoints.push(curve.getPoint(i / 4));
    return curve;
  }

  // 방향 벡터를 임의의 수직 축으로 angle만큼 기울입니다.
  function tilt(direction, angle) {
    const side = new THREE.Vector3().crossVectors(direction, Math.abs(direction.y) > .9 ? new THREE.Vector3(1, 0, 0) : up).normalize();
    side.applyAxisAngle(direction, random() * Math.PI * 2);
    return direction.clone().applyAxisAngle(side, angle).normalize();
  }

  const flowersAt = [];
  // 잔가지를 따라 일정 간격으로 작은 꽃송이(3~5송이)를 답니다.
  // 가지를 따라 짧고 가는 꽃가지를 여러 개 내고, 꽃가지 끝에 꽃 1~3송이를 답니다.
  function addTwigs(curve, length, radius) {
    const count = Math.max(2, Math.round(length / shape.twigGap));
    for (let i = 0; i < count; i++) {
      // 가지 시작 부분은 비워 두어 가지 선이 보이게 합니다.
      const along = Math.min(.2 + .8 * (i + random()) / count, 1);
      const base = curve.getPoint(along);
      const direction = tilt(curve.getTangent(along), .7 + random() * .6);
      direction.y += .35; // 꽃가지는 대체로 위로 향합니다.
      direction.z = Math.min(direction.z, shape.wallSide);
      direction.normalize();
      const twigLength = shape.twigLength * (.55 + random() * .8);
      const tip = base.clone().addScaledVector(direction, twigLength);
      const middle = base.clone().lerp(tip, .5).add(new THREE.Vector3(spread(.04), .02, spread(.04)));
      curvedBranch([base, middle, tip], THREE.MathUtils.clamp(radius * .35, .007, .018), .003);
      if (bloom() > shape.flowerChance) continue;
      const flowers = shape.flowersPerTwig - 1 + Math.floor(bloom() * 3);
      for (let k = 0; k < flowers; k++) {
        flowersAt.push(tip.clone().add(new THREE.Vector3(bloomSpread(.06), bloomSpread(.05), bloomSpread(.06))));
      }
      // 꽃가지 중간에도 한 송이씩 달아, 꽃이 가는 가지를 따라 붙어 있는 것처럼 보이게 합니다.
      if (bloom() < shape.midFlowerChance) flowersAt.push(base.clone().lerp(tip, .4 + bloom() * .3).add(new THREE.Vector3(bloomSpread(.03), .02, bloomSpread(.03))));
    }
  }

  // 가지 하나를 그리고, 끝과 옆에서 더 가는 가지를 재귀적으로 뻗습니다.
  // level: 남은 갈래 단계(0이면 가장 바깥 잔가지)
  function grow(start, direction, length, radius, level) {
    // 가지가 살짝 휘도록 중간점을 옆으로, 바깥 가지일수록 아래로 처지게 합니다.
    const droop = (1 - level / shape.depth) * .18 * length;
    const end = start.clone().addScaledVector(direction, length).add(new THREE.Vector3(0, -droop, 0));
    const middle = start.clone().lerp(end, .5).add(new THREE.Vector3(spread(.12), .06, spread(.12)).multiplyScalar(length));
    const curve = curvedBranch([start, middle, end], radius, radius * (level === 0 ? .25 : .72));
    if (level < shape.twigLevels) addTwigs(curve, length, radius);
    if (level === 0) return;

    const tipDirection = curve.getTangent(1);
    // 끝에서 2갈래(가끔 3갈래)로 나뉩니다. 갈래가 많으면 잔가지끼리 겹쳐 보입니다.
    const forks = 2 + (random() < .2 ? 1 : 0);
    for (let i = 0; i < forks; i++) {
      let next = tilt(tipDirection, .35 + random() * .4);
      // 바깥쪽으로 펼쳐지고, 위로 너무 솟지 않게 수평 쪽으로 눕힙니다.
      next.y = THREE.MathUtils.lerp(next.y, .5, .3);
      next.z = Math.min(next.z, shape.wallSide);
      next.normalize();
      grow(end, next, length * (shape.shrink + spread(.08)), radius * shape.thin, level - 1);
    }
    // 가지 중간에서 옆으로 짧은 곁가지를 냅니다.
    if (level >= 2) {
      const sides = random() < .5 ? 1 : 0;
      for (let i = 0; i < sides; i++) {
        const t = .35 + random() * .4;
        const next = tilt(curve.getTangent(t), .7 + random() * .4);
        next.z = Math.min(next.z, shape.wallSide);
        next.normalize();
        grow(curve.getPoint(t), next, length * .5, radius * .45, level - 2);
      }
    }
  }

  // 줄기: 살짝 기울어진 굵은 기둥
  const trunkTop = new THREE.Vector3(.15, shape.trunkHeight, -.05);
  curvedBranch([new THREE.Vector3(0, 0, 0), new THREE.Vector3(-.08, shape.trunkHeight * .5, .04), trunkTop], .32, .22);
  // 큰 가지: 줄기 위에서 위쪽으로 비스듬히(약 35~60°) 뻗습니다.
  // 나무 기준 +X(장면에서는 창문이 이어지는 +Z 방향)로 모아 뻗습니다.
  // 줄기와 굵은 가지는 모서리 벽 뒤에 숨고, 바깥쪽 잔가지만 창 안으로 들어오게 하려는 배치입니다.
  // 건물 쪽(+Z)으로는 뻗지 않아 벽을 뚫지 않습니다.
  for (let i = 0; i < shape.limbs; i++) {
    const angle = Math.PI * (1.55 + .55 * i / (shape.limbs - 1)) + spread(.15);
    const lean = .75 + random() * .3;
    const direction = new THREE.Vector3(Math.cos(angle) * Math.sin(lean), Math.cos(lean), Math.sin(angle) * Math.sin(lean));
    direction.z = Math.min(direction.z, shape.wallSide);
    direction.normalize();
    // 가지 시작점을 줄기 안쪽으로 조금 묻어서, 줄기 끝 단면이 띠처럼 보이지 않게 합니다.
    const start = trunkTop.clone().addScaledVector(direction, -.45);
    grow(start, direction, shape.limbLength * (.85 + random() * .3), .16, shape.depth);
  }
  // 위쪽 가운데를 채우는 가지 하나
  grow(trunkTop.clone().add(new THREE.Vector3(0, -.3, 0)), new THREE.Vector3(.6, 1, -.2).normalize(), shape.limbLength * .8, .15, shape.depth - 1);

  // 모든 가지 도형을 합쳐 그리기 요청 횟수를 줄이고 원본 도형 리소스는 해제합니다.
  const branches = new THREE.Mesh(mergeGeometries(branchGeometries), bark);
  branches.castShadow = true; branches.receiveShadow = true; tree.add(branches);
  branchGeometries.forEach(geometry => geometry.dispose());

  // Five individually cupped petals, with a small notch at each tip.
  // 꽃잎 5장을 72도 간격으로 배치합니다. 각 꽃잎은 삼각형 10개로 구성됩니다.
  const vertices = [];
  for (let petal = 0; petal < 5; petal++) {
    const angle = petal / 5 * Math.PI * 2;
    const rotate = (x, y, z) => [Math.cos(angle) * x - Math.sin(angle) * y, Math.sin(angle) * x + Math.cos(angle) * y, z];
    const middle = rotate(.53, 0, .06);
    const edge = [];
    for (let i = 0; i <= 10; i++) {
      const t = i / 10 * Math.PI * 2;
      let x = .53 + .48 * Math.cos(t);
      if (i === 0 || i === 10) x -= .1;
      edge.push(rotate(x, .34 * Math.sin(t), .07 + .19 * Math.pow((x - .1), 2)));
    }
    for (let i = 0; i < 10; i++) vertices.push(...middle, ...edge[i], ...edge[i + 1]);
  }
  // 정점 좌표를 GPU에 전달하고 조명 계산에 필요한 표면 방향(법선)을 구합니다.
  const flowerGeometry = new THREE.BufferGeometry();
  flowerGeometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  flowerGeometry.computeVertexNormals();
  // 같은 꽃 도형을 공유하는 InstancedMesh: 위치·회전·크기·색만 개별 지정합니다.
  // 꽃은 아주 약하게 스스로 빛나서 그늘에서도 회색으로 죽지 않습니다.
  // 빛나는 색을 송이마다의 색(instanceColor)과 같게 해서, 깊은 쪽 진분홍 꽃이 그늘에서도 분홍으로 보이게 합니다.
  const flowerMaterial = new THREE.MeshStandardMaterial({ color: '#ffffff', emissive: '#ffffff', emissiveIntensity: .3, side: THREE.DoubleSide, roughness: .82 });
  flowerMaterial.onBeforeCompile = shader => {
    shader.fragmentShader = shader.fragmentShader.replace(
      'vec3 totalEmissiveRadiance = emissive;',
      'vec3 totalEmissiveRadiance = emissive * vColor;',
    );
  };
  const flowers = new THREE.InstancedMesh(flowerGeometry, flowerMaterial, flowersAt.length);
  flowers.castShadow = true; flowers.receiveShadow = true;
  // 화면에는 넣지 않는 임시 객체로 각 꽃의 변환 행렬을 계산합니다.
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  // 굵은 가지와의 거리: 굵은 가지 가까이 핀 꽃일수록 진한 분홍, 바깥 잔가지 끝으로 갈수록 연한 분홍이 됩니다.
  // thickPoints(굵은 가지 위의 점들) 중 가장 가까운 점까지의 거리를 재고, 꽃들 거리의 90% 지점을 '가장 바깥'으로 봅니다.
  const thickDistance = flowersAt.map(p => Math.sqrt(Math.min(...thickPoints.map(q => p.distanceToSquared(q)))));
  const outerDistance = [...thickDistance].sort((a, b) => a - b)[Math.floor(thickDistance.length * .9)];
  // 전체적으로 진한 편: 바깥쪽도 흰색이 아니라 분명한 분홍입니다.
  const pale = { s: .65, l: .84 }, deep = { s: 1, l: .55 };
  flowersAt.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.rotation.set(bloom() * Math.PI, bloom() * Math.PI, bloom() * Math.PI);
    const size = .07 + bloom() * .035;
    dummy.scale.setScalar(size); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix);
    // 굵은 가지에 가까울수록 1(진분홍), 바깥쪽일수록 0(연분홍). 송이마다 조금씩 다르게 흔듭니다.
    // 제곱근 곡선: 굵은 가지에서 조금 떨어진 꽃까지도 진한 쪽으로 기울입니다.
    const depth = Math.sqrt(THREE.MathUtils.clamp(1 - thickDistance[i] / outerDistance + bloomSpread(.1), 0, 1));
    flowers.setColorAt(i, color.setHSL(
      .945 + bloom() * .03,
      THREE.MathUtils.lerp(pale.s, deep.s, depth) + bloomSpread(.06),
      THREE.MathUtils.lerp(pale.l, deep.l, depth) + bloomSpread(.03),
    ));
  });
  tree.add(flowers);
  tree.userData.counts = { flowers: flowersAt.length, branchSegments: branchGeometries.length };
  tree.userData.thickPoints = thickPoints;
  tree.userData.flowerMaterial = flowerMaterial;
  return tree;
}
