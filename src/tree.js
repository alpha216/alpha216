import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// 독립적인 벚꽃나무를 생성합니다. 장면 배치와 조명은 호출하는 쪽에서 관리합니다.
export function createCherryBlossomTree() {
  const tree = new THREE.Group();
  const bark = new THREE.MeshStandardMaterial({ color: '#514052', roughness: .93 });
  // 고정 시드 난수: 새로고침해도 동일한 나무가 생성됩니다.
  let seed = 51;
  function random() { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; }
  const branchGeometries = [];
  // a에서 b까지 원기둥을 놓습니다. base/tip은 시작/끝 반지름입니다.
  function branch(a, b, base, tip) {
    const direction = new THREE.Vector3().subVectors(b, a);
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(tip, base, direction.length(), 9), bark);
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    // 기본 Y축 방향의 원기둥을 실제 가지 방향으로 회전합니다.
    mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    mesh.castShadow = true; mesh.receiveShadow = true;
    // 합치기 전에 위치·회전을 정점 좌표에 반영합니다.
    mesh.updateMatrix();
    mesh.geometry.applyMatrix4(mesh.matrix);
    branchGeometries.push(mesh.geometry);
  }
  const flowersAt = [];
  // Broad, overlapping crowns with arching limbs and cascading outer shoots.
  // 제어점들을 지나는 곡선을 12개의 짧고 점점 가늘어지는 가지로 만듭니다.
  function curvedBranch(points,base,tip) {
    const curve=new THREE.CatmullRomCurve3(points);
    const steps=12;
    for(let i=0;i<steps;i++)branch(curve.getPoint(i/steps),curve.getPoint((i+1)/steps),THREE.MathUtils.lerp(base,tip,i/steps),THREE.MathUtils.lerp(base,tip,(i+1)/steps));
    return curve;
  }
  curvedBranch([new THREE.Vector3(0,0,0),new THREE.Vector3(-.15,1.25,.05),new THREE.Vector3(.02,2.5,0),new THREE.Vector3(-.22,4.4,.1)],.34,.09);
  // 큰 가지 26개: 마지막 7개는 윗부분을 채우고 나머지는 옆으로 펼칩니다.
  for(let i=0;i<26;i++) {
    const angle=i*2.399+random()*.45;
    const upper=i>=19;
    const radius=upper?1+random()*1.5:2.6+random()*1.6;
    const origin=new THREE.Vector3(-.08,2.1+random()*1.2,0);
    const crest=upper?5.7+random()*.55:4.6+random()*.7;
    const elbow=new THREE.Vector3(Math.cos(angle)*radius*.42,crest-.25,Math.sin(angle)*radius*.42);
    const end=new THREE.Vector3(Math.cos(angle)*radius,crest-(upper?.2:.7+random()*.4),Math.sin(angle)*radius*.77);
    const limb=curvedBranch([origin,elbow,end],upper?.09:.145,.015);
    // 큰 가지마다 작은 가지 11개를 만들고 바깥쪽 끝은 아래로 처지게 합니다.
    for(let j=0;j<11;j++) {
      const along=.28+j*.062;
      const base=limb.getPoint(along);
      const spread=angle+(random()-.5)*2.1;
      const length=.5+random()*.8;
      const tip=base.clone().add(new THREE.Vector3(Math.cos(spread)*length,along>.7?-.35-random()*.65:.2+random()*.5,Math.sin(spread)*length));
      const mid=base.clone().lerp(tip,.5).add(new THREE.Vector3(0,.22,0));
      const twig=curvedBranch([base,mid,tip],.019,.002);
      // 작은 가지당 꽃 무리 5개. 내부 k 반복 횟수를 바꾸면 꽃 밀도가 달라집니다.
      for(let n=0;n<5;n++) {
        const cluster=twig.getPoint(.15+n*.2);
        for(let k=0;k<7;k++) {
          // Rounded, uneven clusters keep gaps between flowering sprays.
          const theta=random()*Math.PI*2;
          const y=random()*2-1;
          const r=Math.cbrt(random());
          const ring=Math.sqrt(1-y*y);
          flowersAt.push(cluster.clone().add(new THREE.Vector3(Math.cos(theta)*ring*r*.32,y*r*.3,Math.sin(theta)*ring*r*.32)));
        }
      }
    }
  }
  // 모든 가지 도형을 합쳐 그리기 요청 횟수를 줄이고 원본 도형 리소스는 해제합니다.
  const branches=new THREE.Mesh(mergeGeometries(branchGeometries),bark);
  branches.castShadow=true;branches.receiveShadow=true;tree.add(branches);
  branchGeometries.forEach(geometry=>geometry.dispose());
  // Five individually cupped petals, with a small notch at each tip.
  // 꽃잎 5장을 72도 간격으로 배치합니다. 각 꽃잎은 삼각형 10개로 구성됩니다.
  const vertices=[];
  for(let petal=0;petal<5;petal++) {
    const angle=petal/5*Math.PI*2;
    const rotate=(x,y,z)=>[Math.cos(angle)*x-Math.sin(angle)*y,Math.sin(angle)*x+Math.cos(angle)*y,z];
    const middle=rotate(.53,0,.06);
    const edge=[];
    for(let i=0;i<=10;i++) {
      const t=i/10*Math.PI*2;
      let x=.53+.48*Math.cos(t);
      if(i===0||i===10)x-=.1;
      edge.push(rotate(x,.34*Math.sin(t),.07+.19*Math.pow((x-.1),2)));
    }
    for(let i=0;i<10;i++)vertices.push(...middle,...edge[i],...edge[i+1]);
  }
  // 정점 좌표를 GPU에 전달하고 조명 계산에 필요한 표면 방향(법선)을 구합니다.
  const flowerGeometry=new THREE.BufferGeometry();
  flowerGeometry.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  flowerGeometry.computeVertexNormals();
  // 같은 꽃 도형을 공유하는 InstancedMesh: 위치·회전·크기·색만 개별 지정합니다.
  const flowers = new THREE.InstancedMesh(flowerGeometry, new THREE.MeshStandardMaterial({color:'#f9b1e3',side:THREE.DoubleSide,roughness:.82}), flowersAt.length);
  flowers.castShadow=true;flowers.receiveShadow=true;
  const centers = new THREE.InstancedMesh(new THREE.SphereGeometry(1, 6, 4), new THREE.MeshStandardMaterial({ color: '#c86297', roughness: .8 }), flowersAt.length);
  // 화면에는 넣지 않는 임시 객체로 각 꽃의 변환 행렬을 계산합니다.
  const dummy = new THREE.Object3D();
  flowersAt.forEach((p, i) => {
    dummy.position.copy(p);
    dummy.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const size = .06 + random() * .055;
    dummy.scale.setScalar(size); dummy.updateMatrix(); flowers.setMatrixAt(i, dummy.matrix);
    flowers.setColorAt(i, new THREE.Color().setHSL(.83 + random() * .12, .36 + random() * .22, .72 + random() * .24));
    dummy.scale.setScalar(size * .12); dummy.updateMatrix(); centers.setMatrixAt(i, dummy.matrix);
  });
  tree.add(flowers, centers);
  return tree;
}
