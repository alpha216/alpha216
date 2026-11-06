import * as THREE from "three";

// The chalkboard wall is z=0. The window wall is x=0.
// The camera stays inside the room (negative x, positive z).
// 전달받은 장면에 교실을 추가하고, 카메라 크기 갱신과 애니메이션 갱신 함수를 반환합니다.
export function buildClassroom(scene, tree, renderer, camera, sunlight) {
  let seed = 802;
  const random = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
  // 기본 거칠기는 .85이며 extra로 금속성·질감·거칠기 등을 덮어쓸 수 있습니다.
  const material = (color, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...extra });
  // 2D canvas에 직접 그린 이미지를 3D 표면의 텍스처로 변환합니다.
  function canvasTexture(draw, w = 1024, h = 1024) {
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    draw(canvas.getContext("2d"), w, h);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    return texture;
  }
  // 크기(w,h,d), 중심 위치(x,y,z), 재질 순서로 상자를 생성합니다.
  function box(w, h, d, x, y, z, mat) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    scene.add(mesh);
    return mesh;
  }
  // Local window coordinates: u runs along the right wall, v is height,
  // and depth projects into the room. All layers share the exact same plane.
  // 창문 벽 좌표를 변환합니다: u→Z, v→Y, 실내 쪽 깊이→음수 X.
  const wallBox = (w, h, d, u, v, depth, mat) =>
    box(d, h, w, -depth, v, u, mat);

  const start = 0.66,
    end = 10,
    low = 2,
    high = 6.3;

  // 구성 순서를 유지해 시드 기반 질감과 화면 모습이 바뀌지 않게 합니다.
  applyBarkTexture();
  const { plaster, lowerWall, aluminum, silver, rubber, wood } = createMaterials();
  createWalls();
  const boardCorners = createChalkboard();
  createWindowFrame();
  createGlass();
  createCeilingFixtures();
  createFloor();
  createDesk();
  positionTree();
  const sky = createSky();
  configureSunlight();

  // 카메라 도입부: 천장에서 잠시 머문 뒤 현재 구도로 고개를 내립니다.
  const reduceCameraMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cameraIntro = { hold: .5, duration: 3.5, upwardAngle: 90 * Math.PI / 180 };
  let cameraElapsed = 0;
  const settledRotation = new THREE.Quaternion();
  function applyCameraIntro() {
    const progress = reduceCameraMotion ? 1 : THREE.MathUtils.clamp(
      (cameraElapsed - cameraIntro.hold) / cameraIntro.duration, 0, 1
    );
    // 시작과 끝에서 속도·가속도가 부드럽게 0이 되는 곡선입니다.
    const eased = progress * progress * progress * (progress * (progress * 6 - 15) + 10);
    camera.quaternion.copy(settledRotation);
    // 카메라 자체의 가로축으로만 회전하므로 위치와 좌우 방향은 유지됩니다.
    camera.rotateX(cameraIntro.upwardAngle * (1 - eased));
  }

  // 화면이 바뀌면 캔버스 크기·종횡비·화각을 갱신합니다. FOV가 작을수록 줌인됩니다.
  function resize() {
    const width = innerWidth,
      height = innerHeight;
    const portrait = width < height;
    renderer.setSize(width, height);
    camera.aspect = width / height;
    // 가로 화각을 고정해 창 비율이 바뀌어도 칠판이 화면 가로의 같은 위치에 오게 합니다.
    // 기준: 16:10 화면에서 세로 화각 40°. 너무 납작하거나 길쭉한 화면에서는 32°~56°로 제한합니다.
    // 세로(휴대폰) 화면은 기존처럼 56°를 씁니다.
    const designAspect = 1.6, designFov = 40;
    const halfWidth = Math.tan(THREE.MathUtils.degToRad(designFov / 2)) * designAspect;
    const fitFov = THREE.MathUtils.radToDeg(2 * Math.atan(halfWidth / camera.aspect));
    camera.fov = portrait ? 56 : THREE.MathUtils.clamp(fitFov, 32, 56);
    // position은 카메라 위치, lookAt은 바라보는 목표점입니다.
    camera.position.set(-7, 3.35, 9.3);
    camera.lookAt(portrait ? -3.4 : -1, 3.65, portrait ? 0.9 : 1);
    settledRotation.copy(camera.quaternion);
    applyCameraIntro();
    camera.updateProjectionMatrix();
  };

  // deltaSeconds는 탭이 보이는 동안 흐른 시간입니다.
  function update(deltaSeconds) {
    sky.material.uniforms.uTime.value += deltaSeconds;
    cameraElapsed += deltaSeconds;
    applyCameraIntro();
  }
  return { resize, update, boardCorners };

  function applyBarkTexture() {
    // 나무껍질: 세로 곡선과 짧은 밝은 무늬를 겹쳐 만듭니다.
    const barkTexture = canvasTexture(
      (ctx, w, h) => {
        ctx.fillStyle = "#9a8b83";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 3500; i++) {
          const x = random() * w,
            y = random() * h;
          ctx.strokeStyle = `rgba(37,29,33,${0.06 + random() * 0.25})`;
          ctx.lineWidth = 0.5 + random() * 2;
          ctx.beginPath();
          ctx.moveTo(x, y);
          ctx.bezierCurveTo(
            x + random() * 6,
            y + 12,
            x - random() * 7,
            y + 35,
            x + (random() - 0.5) * 12,
            y + 20 + random() * 100,
          );
          ctx.stroke();
        }
        for (let i = 0; i < 260; i++) {
          ctx.fillStyle = "rgba(224,209,195,.2)";
          ctx.fillRect(
            random() * w,
            random() * h,
            4 + random() * 18,
            1 + random() * 2,
          );
        }
      },
      512,
      1024,
    );
    // main.js에서 첫 번째로 추가한 자식은 합쳐진 줄기·가지입니다. 자식 순서 변경 시 주의합니다.
    // bumpMap은 실제 도형을 바꾸지 않고 빛 반응으로 요철을 표현합니다.
    const barkMaterial = tree.children[0].material;
    barkMaterial.map = barkTexture;
    barkMaterial.bumpMap = barkTexture;
    barkMaterial.bumpScale = 0.025;
    barkMaterial.needsUpdate = true;
  }

  function createMaterials() {
    // 벽 질감: 미세한 밝고 어두운 점을 반복해 석고 표면을 표현합니다.
    const plasterTexture = canvasTexture((ctx, w, h) => {
      ctx.fillStyle = "#dddcd5";
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 65000; i++) {
        const shade = random() > 0.5 ? "255,255,250" : "83,86,80";
        ctx.fillStyle = `rgba(${shade},${random() * 0.07})`;
        ctx.fillRect(
          random() * w,
          random() * h,
          1 + random() * 2,
          1 + random() * 2,
        );
      }
    });
    plasterTexture.wrapS = plasterTexture.wrapT = THREE.RepeatWrapping;
    plasterTexture.repeat.set(3, 2);
    const plaster = material("#ffffff", {
      map: plasterTexture,
      bumpMap: plasterTexture,
      bumpScale: 0.018,
    });
    const lowerWall = material("#b5bcb6", { map: plasterTexture });
    const aluminum = material("#b5bec1", { metalness: 0.68, roughness: 0.34 });
    const silver = material("#d0d7d8", { metalness: 0.6, roughness: 0.28 });
    const rubber = material("#394345", { roughness: 0.94 });
    const wood = material("#70695a");
    return { plaster, lowerWall, aluminum, silver, rubber, wood };
  }

  function createWalls() {
    // 칠판 벽은 Z=0, 창문 벽은 X=0에 있어 실제로 직각 모서리를 이룹니다.
    // 창문 자리에는 벽을 만들지 않고 위·아래·옆 벽만 배치합니다.
    box(16, 7, 0.24, -8, 3.5, -0.12, plaster);
    box(16, 1.05, 0.24, -8, 0.525, -0.12, plaster); //칠판 밑 
    box(16, 1, 0.1, -8, 0.08, 0.065, wood); //칠판 밑 받침
    box(0.22, 7, 0.65, 0.12, 3.5, 0.325, plaster);
    box(0.24, 2.4, 15, 0.12, 0.625, 8.15, plaster);
    box(0.24, 1, 15, 0.12, 7, 8.15, plaster); // 위쪽 벽은 천장과 맞닿아 있어 석고가 아닌 흰색으로 칠합니다.
    box(0.24, 7, 6, 0.12, 3.5, 13, plaster);
    box(0.1, 1, 15, -0.06, 0.08, 7.5, wood);
    box(16, 0.18, 16, -8, 7.05, 8, plaster);
    // Narrow shadow in the physical wall junction emphasizes the corner.
    box(0.025, 7, 0.018, -0.014, 3.5, 0.015, material("#a2aaa7"));
    box(16, 0.09, 0.08, -8, 6.82, 0.04, material("#b7bebc"));
    wallBox(15, 0.09, 0.08, 7.5, 6.82, 0.04, material("#c9ceca"));

  }

  function createChalkboard() {
    // Chalkboard surface, erased strokes and chalk dust, without invented text.
    // 칠판: 희미한 그라데이션으로 지운 자국, 작은 점으로 분필 가루를 표현합니다.
    const boardTexture = canvasTexture(
      (ctx, w, h) => {
        ctx.fillStyle = "#244b40";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 110; i++) {
          ctx.save();
          ctx.translate(random() * w, random() * h);
          ctx.rotate((random() - 0.5) * 0.12);
          const gradient = ctx.createLinearGradient(0, -18, 0, 18);
          gradient.addColorStop(0, "rgba(210,225,202,0)");
          gradient.addColorStop(0.5, "rgba(210,225,202,.025)");
          gradient.addColorStop(1, "rgba(210,225,202,0)");
          ctx.fillStyle = gradient;
          ctx.fillRect(-80, -18, 80 + random() * 260, 36);
          ctx.restore();
        }
        for (let i = 0; i < 35000; i++) {
          ctx.fillStyle = `rgba(220,234,211,${random() * 0.09})`;
          ctx.fillRect(random() * w, random() * h, 1, 1);
        }
      },
      1536,
      1024,
    );
    const board = material("#ffffff", {
      map: boardTexture,
      roughness: 0.98,
      bumpMap: boardTexture,
      bumpScale: 0.007,
    });
    // Keep the right and bottom edges fixed when resizing the board.
    // 칠판 크기 조절은 이 두 값으로 합니다. 테두리와 받침도 함께 늘어납니다.
    const boardWidth = 8.2;
    const boardHeight = 4;
    // 오른쪽과 아래쪽을 고정하고 중심을 계산하므로 왼쪽·위쪽 방향으로 커집니다.
    const boardRight = -0.77;
    const boardBottom = 2.2;
    const boardX = boardRight - boardWidth / 2;
    const boardY = boardBottom + boardHeight / 2;
    box(boardWidth, boardHeight, 0.14, boardX, boardY, 0.11, wood);
    box(boardWidth - 0.2, boardHeight - 0.2, 0.055, boardX, boardY, 0.21, board);
    for (const x of [boardX - boardWidth / 2, boardRight]) {
      box(0.075, boardHeight + 0.05, 0.1, x, boardY, 0.23, aluminum);
    }
    for (const y of [boardBottom, boardBottom + boardHeight]) {
      box(boardWidth + 0.05, 0.075, 0.1, boardX, y, 0.23, aluminum);
    }
    box(
      boardWidth + 0.12,
      0.065,
      0.3,
      boardX,
      boardBottom - 0.055,
      0.28,
      aluminum,
    );
    box(
      boardWidth + 0.12,
      0.055,
      0.025,
      boardX,
      boardBottom - 0.015,
      0.435,
      silver,
    );
    // 분필은 눕힌 원기둥, 지우개는 위아래 상자 두 개입니다.
    const chalk = material("#eee9db");
    for (let i = 0; i < 3; i++) {
      const piece = new THREE.Mesh(
        new THREE.CylinderGeometry(0.016, 0.016, 0.14, 10),
        chalk,
      );
      piece.rotation.z = Math.PI / 2;
      piece.rotation.y = i * 0.16;
      piece.position.set(-1.3 - i * 0.21, 2.2, 0.31);
      scene.add(piece);
    }
    box(0.28, .065, 0.14, -2.05, 2.25, 0.3, material("#786447"));
    box(0.28, 0.025, 0.14, -2.05, 2.2, 0.3, material("#363b3d"));

    // HTML 타이틀을 칠판에 맞추기 위해 칠판 면(초록 부분)의 네 모서리를 돌려줍니다.
    const halfW = (boardWidth - 0.2) / 2, halfH = (boardHeight - 0.2) / 2;
    const faceZ = 0.21 + 0.055 / 2;
    return {
      topLeft: new THREE.Vector3(boardX - halfW, boardY + halfH, faceZ),
      topRight: new THREE.Vector3(boardX + halfW, boardY + halfH, faceZ),
      bottomLeft: new THREE.Vector3(boardX - halfW, boardY - halfH, faceZ),
      bottomRight: new THREE.Vector3(boardX + halfW, boardY - halfH, faceZ),
    };
  }

  function createWindowFrame() {
    // Recessed window assembly: masonry reveal, rubber seals, sash, handles, tracks.
    // 창문 범위: 벽을 따라 start~end, 높이는 low~high입니다.
    wallBox(
      end - start + 0.22,
      0.15,
      0.48,
      (start + end) / 2,
      low - 0.04,
      0.12,
      material("#d5d4c9"),
    );
    wallBox(
      end - start + 0.3,
      0.045,
      0.55,
      (start + end) / 2,
      low + 0.045,
      0.15,
      silver,
    );
    for (const u of [start, 3.8, 6.9, end]) { //세로
      wallBox(0.3, high - low, 0.27, u, (low + high) / 2, 0.04, aluminum);
      wallBox(
        0.045,
        high - low,
        0.035,
        u - 0.05,
        (low + high) / 2,
        0.195,
        silver,
      );
      wallBox(0.022, high - low, 0.025, u + 0.09, (low + high) / 2, 0.07, rubber);
    }
    for (const y of [low, 4.1, high]) { // 가로
      wallBox(end - start, 0.15, 0.2, (start + end) / 2, y, 0.045, aluminum);
      wallBox(
        end - start,
        0.025,
        0.04,
        (start + end) / 2,
        y + 0.04,
        0.185,
        silver,
      );
      wallBox(
        end - start,
        0.018,
        0.025,
        (start + end) / 2,
        y - 0.07,
        0.08,
        rubber,
      );
    }
    for (const depth of [-0.04, 0.06, 0.17])
      wallBox(
        end - start,
        0.018,
        0.025,
        (start + end) / 2,
        low + 0.07,
        depth,
        rubber,
      );
  }

  function createGlass() {
    // 옅은 반투명 유리입니다. 실제 굴절은 구현하지 않으며 깊이 기록과 그림자 투사는 끕니다.
    const glass = new THREE.MeshPhysicalMaterial({
      color: "#d5edff",
      transparent: true,
      opacity: 0.055,
      roughness: 0.09,
      metalness: 0.1,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    wallBox(
      end - start - 0.1,
      high - low - 0.1,
      0.012,
      (start + end) / 2,
      (low + high) / 2,
      -0.05,
      glass,
    ).castShadow = false;

  }

  function createCeilingFixtures() {
    // Acoustic ceiling tiles, recessed fluorescent housing, and ventilation slots.
    // 천장 줄눈, 형광등 케이스와 환풍구를 작은 상자들로 조립합니다.
    // 형광등 emissive는 표면만 밝히며 주변에 빛을 방출하는 광원은 아닙니다.

    // const ceilingSeam = material('#b1b7b8');
    // for (let x = -15; x < 0; x += 1.2)box(.014, .012, 16, x, 6.951, 8, ceilingSeam);
    // for (let z = 0; z < 16; z += 1.2)box(16, .012, .014, -8, 6.951, z, ceilingSeam);
    for (const z of [2.7, 7.5]) {
      box(0.72, 0.07, 2.5, -3.7, 6.89, z, aluminum);
      box(0.58, 0.025, 2.35, -3.7, 6.84, z, material("#d9dedb"));
      for (const x of [-3.88, -3.52])
        box(
          0.08,
          0.04,
          2.22,
          x,
          6.81,
          z,
          material("#f0eee2", { emissive: "#ebe5d4", emissiveIntensity: 0.14 }),
        );
    }
    box(0.7, 0.045, 0.65, -1.7, 6.9, 1.5, silver);
    for (let i = 0; i < 9; i++)
      box(0.57, 0.02, 0.023, -1.7, 6.87, 1.25 + i * 0.06, rubber);

  }

  function createFloor() {
    // 타일 한 장의 질감을 만든 뒤 18×18번 반복합니다.
    const floorTexture = canvasTexture(
      (ctx, w, h) => {
        ctx.fillStyle = "#a5aaa6";
        ctx.fillRect(0, 0, w, h);
        for (let i = 0; i < 20000; i++) {
          ctx.fillStyle = `rgba(53,66,68,${random() * 0.1})`;
          ctx.fillRect(
            random() * w,
            random() * h,
            1 + random() * 3,
            1 + random() * 3,
          );
        }
        ctx.strokeStyle = "#7c8787";
        ctx.lineWidth = 3;
        ctx.strokeRect(0, 0, w, h);
      },
      256,
      256,
    );
    floorTexture.wrapS = floorTexture.wrapT = THREE.RepeatWrapping;
    floorTexture.repeat.set(18, 18);
    box(
      16,
      0.1,
      16,
      -8,
      -0.06,
      8,
      material("#ffffff", { map: floorTexture, roughness: 0.72 }),
    );
  }

  function createDesk() {
    // Just a foreground desk edge to anchor the classroom's scale.
    const deskTop = material("#b2a187", { roughness: 0.58 });
    box(1.55, 0.09, 1.05, -4.7, 1.03, 5.3, deskTop);
    for (const x of [-5.32, -4.08])
      for (const z of [4.9, 5.7]) box(0.045, 1, 0.045, x, 0.5, z, aluminum);

  }

  function positionTree() {
    // 나무를 창밖, 칠판 쪽 모서리 벽 뒤에 둡니다. 줄기와 굵은 가지는 벽에 가려지고,
    // 창 쪽으로 뻗은 바깥 잔가지만 창 안으로 들어오도록 맞춘 값입니다(1440×900 화면 기준).
    // x는 창문 벽(x=0)에서 떨어진 거리입니다. 나무의 건물 쪽 가지 길이 × 크기보다 커야 벽을 뚫지 않습니다.
    tree.position.set(4, -6.5, -9.5);
    // 줄기·가지·꽃을 모두 같은 비율로 확대합니다.
    tree.scale.setScalar(1.5);
    tree.rotation.y = -Math.PI / 2;
  }

  function createSky() {
    // Directional sky with layered cloud noise, drawn behind the actual geometry.
    // 큰 구체의 안쪽에 하늘을 그립니다. 아래 GLSL 셰이더는 GPU에서 실행됩니다.
    // hash: 불규칙한 값 / noise: 부드러운 연결 / fbm: 서로 다른 크기의 노이즈 5겹.
    // 시간에 따라 노이즈 샘플 위치를 이동해 구름이 흐르게 합니다.
    let cloudVelocity = 0.02
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(85, 32, 24),
      new THREE.ShaderMaterial({
        uniforms: { uTime: { value: 0 }, uCloudVelocity: { value: new THREE.Vector2(-cloudVelocity, cloudVelocity * 4) } },
        side: THREE.BackSide,
        depthWrite: false,
        vertexShader:
          "varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",
        fragmentShader: `varying vec3 v;
      uniform float uTime;
      uniform vec2 uCloudVelocity;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float n=0.;float a=.5;for(int i=0;i<5;i++){n+=a*noise(p);p=p*2.07+vec2(3.1,1.7);a*=.5;}return n;}
      void main(){vec3 d=normalize(v);float h=smoothstep(-.1,.7,d.y);vec3 color=mix(vec3(.529,.854,1),vec3(.129,.537,1),h);
      vec2 uv=d.xz/(max(d.y+.45,.15))*2.3;float n=fbm(uv*3.5 + uCloudVelocity*uTime);float clouds=smoothstep(.3,.5,n)*smoothstep(-.4,.1,d.y);vec3 white=mix(vec3(.87,.92,.99),vec3(1.,1.,1.),smoothstep(.48,.76,n));color=mix(color,white,clouds*.97);gl_FragColor=vec4(color,1.);}`,
      }),
    );
    scene.add(sky);
    return sky;
  }

  function configureSunlight() {
    // 빛의 위치에서 target으로 햇빛이 들어와 창틀·칠판·바닥 그림자를 만듭니다.
    sunlight.position.set(12, 11, 9);
    sunlight.target.position.set(-4, 1, 1);
    scene.add(sunlight.target);
    Object.assign(sunlight.shadow.camera, {
      left: -13,
      right: 13,
      top: 13,
      bottom: -13,
      near: 0.5,
      far: 50,
    });
    sunlight.shadow.mapSize.set(2048, 2048);
    sunlight.shadow.normalBias = 0.025;
    // 직사광은 강하게, 주변광은 main.js에서 낮춰 밝은 창틀 그림자 대비를 만듭니다.
    sunlight.intensity = 15;
    renderer.toneMappingExposure = 1.3;
  }
}
