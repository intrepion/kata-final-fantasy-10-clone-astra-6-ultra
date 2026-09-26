import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export type SceneState = {
  stage: number;
  activeHero: string | null;
  enemies: Array<{ id: string; hp: number; maxHp: number }>;
  heroes: Array<{ id: string; hp: number }>;
};

type Actor = {
  group: THREE.Group;
  body: THREE.Group;
  ring?: THREE.Mesh;
  origin: THREE.Vector3;
  phase: number;
};

type Effect = { group: THREE.Group; age: number; duration: number; update: (p: number) => void };

const PALETTE = {
  sand: 0xe9d9b2,
  stone: 0xbabbb0,
  lightStone: 0xd4d0bb,
  darkStone: 0x77877b,
  moss: 0x627c4e,
  leaf: 0x3d785d,
  leafLight: 0x6f9661,
  gold: 0xc4a55c,
};

/** A small, entirely procedural island diorama: no external models or textures. */
export class BattleScene {
  onTarget: ((id: string) => void) | null = null;
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.OrthographicCamera(-16, 16, 7.8, -7.8, 0.1, 180);
  private clock = new THREE.Clock();
  private frame = 0;
  private observer: ResizeObserver;
  private motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  private reducedMotion = this.motionQuery.matches;
  private heroes = new Map<string, Actor>();
  private enemies: Actor[] = [];
  private enemyIds: string[] = [];
  private hitboxes: THREE.Mesh[] = [];
  private effects: Effect[] = [];
  private palms: THREE.Group[] = [];
  private sparkles: THREE.Points;
  private sea: THREE.Mesh<THREE.PlaneGeometry, THREE.ShaderMaterial>;
  private activeHero: string | null = 'kael';
  private stage = 0;
  private elapsed = 0;
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2();
  private glowTexture: THREE.CanvasTexture;
  private disposed = false;
  private materials = new Map<string, THREE.MeshStandardMaterial>();
  private environment = new THREE.Group();

  constructor(private container: HTMLElement) {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.08;
    this.renderer.domElement.setAttribute(
      'aria-label',
      'Three adventurers face sea creatures on a sunlit island ruin. Select a creature to target it.',
    );
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);
    this.scene.background = new THREE.Color(0xb7dcd2);
    this.scene.fog = new THREE.FogExp2(0xaed5ce, 0.011);
    this.camera.position.set(13, 18.5, 26);
    this.camera.lookAt(0, 2, -0.4);
    this.scene.add(new THREE.HemisphereLight(0xd7f5f3, 0x777757, 1.9));
    const sun = new THREE.DirectionalLight(0xffefd3, 3.1);
    sun.position.set(-8, 19, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -18;
    sun.shadow.camera.right = 18;
    sun.shadow.camera.top = 16;
    sun.shadow.camera.bottom = -16;
    sun.shadow.normalBias = 0.025;
    sun.shadow.bias = -0.0002;
    sun.shadow.radius = 4;
    this.scene.add(sun);
    const fill = new THREE.DirectionalLight(0xb0eced, 0.6);
    fill.position.set(8, 6, -8);
    this.scene.add(fill);

    const glowCanvas = document.createElement('canvas');
    glowCanvas.width = glowCanvas.height = 64;
    const ctx = glowCanvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.16, 'rgba(255,255,255,.9)');
    gradient.addColorStop(0.5, 'rgba(255,255,255,.2)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    this.glowTexture = new THREE.CanvasTexture(glowCanvas);

    this.sea = this.makeSea();
    this.scene.add(this.sea, this.environment);
    this.makeIsland();
    this.makeRuins();
    this.makeVegetation();
    this.makeDistantIslands();
    const positions = new Float32Array(90 * 3);
    for (let i = 0; i < 90; i++) {
      positions[i * 3] = this.random(i * 8.4) * 21 - 10.5;
      positions[i * 3 + 1] = 0.6 + this.random(i * 13.1) * 4.7;
      positions[i * 3 + 2] = this.random(i * 23.7) * 15 - 8;
    }
    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.sparkles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({
        color: 0xf3efca,
        size: 0.095,
        map: this.glowTexture,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.scene.add(this.sparkles);
    this.makeHero('kael', -2.3, 1.9, 0);
    this.makeHero('lyra', -4.5, 0.15, 1);
    this.makeHero('rook', -3.9, 3.0, 2);
    this.makeCrab(3.15, 0.6);
    this.makeManta(1.7, -2.2);
    this.optimizeMeshes(this.environment, new Set(this.palms));
    for (const hero of this.heroes.values()) this.optimizeMeshes(hero.body);
    for (const enemy of this.enemies) {
      this.optimizeMeshes(
        enemy.body,
        new Set(enemy.body.children.filter((child) => child.name.startsWith('wing-'))),
      );
    }
    this.renderer.domElement.addEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.addEventListener('pointermove', this.handlePointerMove);
    this.motionQuery.addEventListener('change', this.handleMotionChange);
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(container);
    this.resize();
    this.animate();
  }

  private random(seed: number) {
    const n = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
    return n - Math.floor(n);
  }

  private material(color: number, roughness = 0.88, metalness = 0) {
    const key = `${color}-${roughness}-${metalness}`;
    let mat = this.materials.get(key);
    if (!mat) {
      mat = new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true });
      this.materials.set(key, mat);
    }
    return mat;
  }

  private mesh(
    geometry: THREE.BufferGeometry,
    color: number,
    parent: THREE.Object3D,
    x = 0,
    y = 0,
    z = 0,
    material?: THREE.Material,
  ) {
    const mesh = new THREE.Mesh(geometry, material ?? this.material(color));
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    parent.add(mesh);
    return mesh;
  }

  private ellipsoid(
    parent: THREE.Object3D,
    color: number,
    position: number[],
    scale: number[],
    detail = 1,
  ) {
    const m = this.mesh(
      new THREE.IcosahedronGeometry(1, detail),
      color,
      parent,
      position[0],
      position[1],
      position[2],
    );
    m.scale.set(scale[0], scale[1], scale[2]);
    return m;
  }

  private limb(
    parent: THREE.Object3D,
    from: number[],
    to: number[],
    radius: number,
    color: number,
    endRadius = radius,
  ) {
    const a = new THREE.Vector3(...(from as [number, number, number]));
    const b = new THREE.Vector3(...(to as [number, number, number]));
    const direction = b.clone().sub(a);
    const m = this.mesh(
      new THREE.CylinderGeometry(endRadius, radius, direction.length(), 7),
      color,
      parent,
    );
    m.position.copy(a.add(b).multiplyScalar(0.5));
    m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return m;
  }

  private makeSea() {
    const material = new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, seaColor: { value: new THREE.Color(0x3aafa9) } },
      vertexShader: `varying vec3 vWorld; uniform float time;
        void main() { vec3 p = position; p.z += sin(p.x*.42+time*.55)*.06 + cos(p.y*.57+time*.35)*.035;
          vec4 world = modelMatrix * vec4(p,1.); vWorld=world.xyz; gl_Position=projectionMatrix*viewMatrix*world; }`,
      fragmentShader: `varying vec3 vWorld; uniform float time; uniform vec3 seaColor;
        void main() {
          vec2 p = vWorld.xz;
          float a = sin(p.x*1.1+p.y*.64+time*.42);
          float b = sin(p.x*.58-p.y*1.5+time*.55);
          float c = sin(p.x*1.9+p.y*.33-time*.31);
          float ripple = pow(max(0.,a*b*.5+c*.35),8.);
          float shallow = 1.-smoothstep(6.,17.,length(p*vec2(.78,1.)));
          vec3 color=mix(seaColor*.79,vec3(.30,.76,.71),shallow*.8);
          color+=ripple*vec3(.13,.23,.19);
          color+=sin(p.x*.11+p.y*.08)*.035;
          float distanceFade=smoothstep(25.,85.,length(p));
          color=mix(color,vec3(.67,.82,.77),distanceFade*.65);
          gl_FragColor=vec4(color,1.);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    const sea = new THREE.Mesh(new THREE.PlaneGeometry(220, 220, 110, 110), material);
    sea.rotation.x = -Math.PI / 2;
    sea.position.y = -0.66;
    return sea;
  }

  private makeIsland() {
    const island = this.mesh(
      new THREE.CylinderGeometry(8.4, 8.8, 1.1, 40, 1),
      PALETTE.sand,
      this.environment,
      0,
      -0.28,
      0,
    );
    island.scale.z = 0.76;
    const outer = this.mesh(
      new THREE.CylinderGeometry(8.9, 9.1, 0.19, 48),
      0xe4e5ca,
      this.environment,
      0,
      -0.54,
      0,
    );
    outer.scale.z = 0.76;
    const wetSand = this.mesh(
      new THREE.CylinderGeometry(9.3, 9.45, 0.09, 50),
      0x9dd2bd,
      this.environment,
      0,
      -0.64,
      0,
    );
    wetSand.scale.z = 0.765;
    for (let i = 0; i < 42; i++) {
      const a = (i / 42) * Math.PI * 2;
      const radius = 7.5 + this.random(i) * 0.8;
      const rock = this.ellipsoid(
        this.environment,
        [0xafb5a3, 0xbcc3b2, 0x969f8b][i % 3],
        [Math.cos(a) * radius, -0.12, Math.sin(a) * radius * 0.74],
        [
          0.55 + this.random(i + 3) * 0.7,
          0.3 + this.random(i + 5) * 0.5,
          0.4 + this.random(i + 2) * 0.5,
        ],
      );
      rock.rotation.set(this.random(i) * 2, a, this.random(i + 1));
    }

    const platform = this.mesh(
      new THREE.CylinderGeometry(6.2, 6.4, 0.35, 36),
      0xa5ada0,
      this.environment,
      0,
      0.37,
      0,
    );
    platform.scale.z = 0.84;
    const floor = this.mesh(
      new THREE.CylinderGeometry(6.03, 6.08, 0.14, 40),
      0xc3c4b2,
      this.environment,
      0,
      0.6,
      0,
    );
    floor.scale.z = 0.84;
    const ring = this.mesh(
      new THREE.RingGeometry(4.9, 5.02, 64),
      0x7d9685,
      this.environment,
      0,
      0.677,
      0,
    );
    ring.rotation.x = -Math.PI / 2;
    ring.scale.y = 0.84;
    const innerRing = this.mesh(
      new THREE.RingGeometry(3.5, 3.56, 64),
      0x91a28f,
      this.environment,
      0,
      0.679,
      0,
    );
    innerRing.rotation.x = -Math.PI / 2;
    innerRing.scale.y = 0.84;
    // A worn sun emblem and radial joins make the arena feel like an old place.
    for (let i = 0; i < 16; i++) {
      const a = (i * Math.PI) / 8;
      const line = this.mesh(
        new THREE.BoxGeometry(0.025, 0.007, 2.1),
        0x8b9e8c,
        this.environment,
        Math.cos(a) * 4.5,
        0.682,
        Math.sin(a) * 3.7,
      );
      line.rotation.y = Math.PI / 2 - a;
      const block = this.mesh(
        new THREE.BoxGeometry(0.82, 0.16, 0.4),
        i % 3 ? PALETTE.lightStone : PALETTE.stone,
        this.environment,
        Math.cos(a) * 6.02,
        0.63,
        Math.sin(a) * 5.03,
      );
      block.rotation.y = -a + Math.PI / 2;
      block.rotation.z = (this.random(i) - 0.5) * 0.08;
    }
    const emblem = new THREE.Group();
    emblem.position.set(0, 0.686, 0);
    this.environment.add(emblem);
    for (let i = 0; i < 8; i++) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0.2);
      shape.lineTo(0.12, 0.65);
      shape.lineTo(0, 1.2);
      shape.lineTo(-0.12, 0.65);
      shape.closePath();
      const ray = this.mesh(new THREE.ShapeGeometry(shape), 0x92a390, emblem);
      ray.rotation.x = -Math.PI / 2;
      ray.rotation.z = (i * Math.PI) / 4;
    }
    for (let i = 0; i < 30; i++) {
      const x = this.random(i * 3) * 10 - 5;
      const z = this.random(i * 6 + 1) * 8 - 4;
      if (x * x + z * z > 25) continue;
      const mark = this.mesh(
        new THREE.CircleGeometry(0.1 + this.random(i) * 0.26, 5),
        i % 2 ? 0xb4bdab : 0xaaba9e,
        this.environment,
        x,
        0.687,
        z,
      );
      mark.rotation.x = -Math.PI / 2;
      mark.scale.y = 0.4;
    }
    for (let i = 0; i < 4; i++) {
      const step = this.mesh(
        new THREE.BoxGeometry(3.4 + i * 0.2, 0.17, 0.6),
        PALETTE.lightStone,
        this.environment,
        -0.3,
        0.46 - i * 0.14,
        5.3 + i * 0.47,
      );
      step.rotation.y = -0.12;
    }
  }

  private makeRuins() {
    const temple = new THREE.Group();
    temple.position.set(-2.3, 0.4, -4.5);
    temple.rotation.y = -0.2;
    this.environment.add(temple);
    for (const side of [-1, 1]) {
      const x = side * 2.05;
      this.mesh(new THREE.BoxGeometry(1.12, 0.4, 1.15), PALETTE.darkStone, temple, x, 0.18, 0);
      this.mesh(new THREE.BoxGeometry(0.94, 0.2, 0.99), PALETTE.lightStone, temple, x, 0.47, 0);
      const pillar = this.mesh(
        new THREE.CylinderGeometry(0.35, 0.43, side < 0 ? 3.9 : 3.65, 8),
        PALETTE.stone,
        temple,
        x,
        side < 0 ? 2.5 : 2.37,
        0,
      );
      pillar.rotation.z = side * 0.035;
      for (let j = 0; j < 3; j++) {
        this.mesh(
          new THREE.CylinderGeometry(0.46, 0.46, 0.16, 8),
          PALETTE.lightStone,
          temple,
          x,
          1.1 + j * 1.35,
          0,
        );
      }
      this.mesh(
        new THREE.BoxGeometry(1.03, 0.28, 1.05),
        PALETTE.lightStone,
        temple,
        x - side * 0.1,
        4.45,
        0,
      );
      for (let j = 0; j < 4; j++) {
        this.ellipsoid(
          temple,
          j % 2 ? PALETTE.moss : 0x809561,
          [x + this.random(j * side + 0.5) * 0.5 - 0.25, 0.57, this.random(j + 2) * 0.7 - 0.35],
          [0.42, 0.13, 0.4],
        );
      }
    }
    // Individual voussoirs leave an unmistakable, broken temple-arch silhouette.
    for (let i = 0; i < 12; i++) {
      if (i === 6 || i === 7) continue;
      const a = (i / 11) * Math.PI;
      const block = this.mesh(
        new THREE.BoxGeometry(0.6, 0.68, 0.86),
        i % 3 ? PALETTE.lightStone : PALETTE.stone,
        temple,
        Math.cos(a) * 2.02,
        4.38 + Math.sin(a) * 1.92,
        0,
      );
      block.rotation.z = a - Math.PI / 2;
    }
    this.ellipsoid(temple, 0x6e8755, [-1.6, 5.5, 0], [0.5, 0.23, 0.44]);
    this.ellipsoid(temple, 0x8a9b62, [1.18, 5.98, 0], [0.47, 0.17, 0.42]);
    for (let i = 0; i < 6; i++) {
      const stone = this.mesh(
        new THREE.BoxGeometry(0.7, 0.4, 0.66),
        PALETTE.stone,
        this.environment,
        -4.3 + this.random(i + 30) * 4,
        0.3,
        -3.8 + this.random(i + 60) * 1.3,
      );
      stone.rotation.set(this.random(i + 2), this.random(i + 7) * 3, this.random(i + 6));
    }
    const stump = new THREE.Group();
    stump.position.set(5.1, 0.1, -3.15);
    this.environment.add(stump);
    this.mesh(new THREE.BoxGeometry(1.3, 0.33, 1.3), PALETTE.darkStone, stump, 0, 0.2, 0);
    this.mesh(new THREE.CylinderGeometry(0.36, 0.49, 2.25, 7), PALETTE.stone, stump, 0, 1.38, 0);
    this.mesh(
      new THREE.CylinderGeometry(0.48, 0.48, 0.16, 8),
      PALETTE.lightStone,
      stump,
      0,
      1.95,
      0,
    );
    this.ellipsoid(stump, PALETTE.moss, [0.03, 2.5, 0], [0.43, 0.13, 0.4]);
    const fallen = this.mesh(
      new THREE.CylinderGeometry(0.37, 0.4, 2.6, 8),
      PALETTE.stone,
      this.environment,
      5.7,
      0.55,
      -1.9,
    );
    fallen.rotation.set(0, 0, Math.PI / 2.2);
  }

  private makePalm(x: number, z: number, height: number, lean: number, seed: number) {
    const palm = new THREE.Group();
    palm.position.set(x, 0.3, z);
    this.environment.add(palm);
    const crown = new THREE.Vector3(lean, height, 0.2);
    for (let i = 0; i < 10; i++) {
      const p = i / 10;
      const next = (i + 1) / 10;
      this.limb(
        palm,
        [lean * p * p, height * p, 0.2 * p],
        [lean * next * next, height * next, 0.2 * next],
        0.16 - p * 0.07,
        i % 2 ? 0x9a8a61 : 0x887c54,
        0.155 - p * 0.07,
      );
    }
    const fronds = new THREE.Group();
    fronds.position.copy(crown);
    palm.add(fronds);
    this.palms.push(fronds);
    for (let j = 0; j < 10; j++) {
      const angle = (j * Math.PI * 2) / 10 + seed;
      const length = 2 + this.random(seed + j) * 0.9;
      const verts: number[] = [];
      const indices: number[] = [];
      for (let k = 0; k <= 10; k++) {
        const t = k / 10;
        const width = Math.sin(t * Math.PI) * 0.37;
        const y = Math.sin(t * Math.PI) * 0.7 - t * t * 0.9;
        const center = new THREE.Vector3(
          Math.cos(angle) * length * t,
          y,
          Math.sin(angle) * length * t,
        );
        const cross = new THREE.Vector3(-Math.sin(angle), 0, Math.cos(angle)).multiplyScalar(width);
        verts.push(center.x - cross.x, center.y - width * 0.16, center.z - cross.z);
        verts.push(center.x, center.y + 0.04, center.z);
        verts.push(center.x + cross.x, center.y - width * 0.16, center.z + cross.z);
        if (k < 10) {
          const a = k * 3;
          indices.push(
            a,
            a + 3,
            a + 1,
            a + 1,
            a + 3,
            a + 4,
            a + 1,
            a + 4,
            a + 2,
            a + 2,
            a + 4,
            a + 5,
          );
        }
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const mat = this.material(j % 3 ? PALETTE.leaf : PALETTE.leafLight).clone();
      mat.side = THREE.DoubleSide;
      this.mesh(geo, PALETTE.leaf, fronds, 0, 0, 0, mat);
    }
    for (let j = 0; j < 3; j++)
      this.ellipsoid(
        palm,
        0x787344,
        [lean + Math.sin(j * 2) * 0.18, height - 0.12, 0.2 + Math.cos(j * 2) * 0.18],
        [0.17, 0.2, 0.16],
      );
  }

  private makeVegetation() {
    this.makePalm(-7.05, -1.7, 5.1, 0.6, 0.7);
    this.makePalm(-6.5, -3.65, 3.7, -0.45, 2);
    this.makePalm(6.75, -3.6, 4.9, -0.6, 0.3);
    this.makePalm(7.1, 1.95, 3.8, 0.45, 3);
    for (let i = 0; i < 65; i++) {
      const a = this.random(i + 32) * Math.PI * 2;
      const r = 6.5 + this.random(i + 3) * 1.1;
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r * 0.74;
      if (z > 4.3 && x > -2.5 && x < 2.5) continue;
      const bush = this.ellipsoid(
        this.environment,
        [0x548467, 0x758e5b, 0x3e7057, 0x8a9a66][i % 4],
        [x, 0.28 + this.random(i) * 0.13, z],
        [
          0.3 + this.random(i * 2) * 0.6,
          0.35 + this.random(i) * 0.3,
          0.32 + this.random(i * 3) * 0.4,
        ],
      );
      bush.rotation.y = a;
      if (i % 3 === 0) {
        for (let j = 0; j < 4; j++) {
          const leaf = this.mesh(
            new THREE.ConeGeometry(0.1, 0.8 + this.random(j + i) * 0.4, 4),
            0x679077,
            this.environment,
            x + Math.cos(j * 2) * 0.2,
            0.7,
            z + Math.sin(j * 2) * 0.2,
          );
          leaf.rotation.set(Math.cos(j * 2) * 0.6, j, Math.sin(j * 2) * 0.6);
        }
      }
      if (i % 11 === 0) {
        for (let j = 0; j < 3; j++)
          this.ellipsoid(
            this.environment,
            0xe5bb89,
            [x + 0.12 * j, 0.73, z],
            [0.065, 0.075, 0.07],
            0,
          );
      }
    }
    // Grass shoots and little warm shells soften the clean platform edge.
    for (let i = 0; i < 14; i++) {
      const x = this.random(i + 91) * 15 - 7.5;
      const z = 4.6 + this.random(i + 23) * 1.4;
      this.ellipsoid(
        this.environment,
        i % 3 === 0 ? 0xe2b69c : 0xdddac4,
        [x, 0.04, z],
        [0.12, 0.09, 0.1],
        0,
      );
    }
  }

  private makeDistantIslands() {
    const locations = [
      [-24, -22, 6],
      [16, -34, 8],
      [-9, -43, 9],
      [33, -13, 7],
    ];
    for (const [x, z, scale] of locations) {
      const island = this.ellipsoid(
        this.scene,
        0x7ea99a,
        [x, -0.75, z],
        [scale, scale * 0.22, scale * 0.4],
        1,
      );
      island.rotation.y = 0.4;
      this.ellipsoid(
        this.scene,
        0x759e89,
        [x - 1, 0, z],
        [scale * 0.8, scale * 0.3, scale * 0.32],
        1,
      );
      for (let i = 0; i < 5; i++) {
        const px = x - scale * 0.65 + i * scale * 0.3;
        const tree = this.mesh(
          new THREE.ConeGeometry(0.6, 2.5 + this.random(i) * 2, 5),
          0x739a8a,
          this.scene,
          px,
          1.1,
          z,
        );
        tree.rotation.z = 0.15;
      }
    }
    // Pale angular gull silhouettes over the far water.
    for (let i = 0; i < 6; i++) {
      const x = 2 + i * 2;
      const bird = new THREE.Group();
      bird.position.set(x, 5 + Math.sin(i) * 0.5, -17 - i * 0.7);
      const mat = new THREE.LineBasicMaterial({
        color: 0x537d79,
        transparent: true,
        opacity: 0.65,
      });
      const geo = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(-0.35, 0.08, 0),
        new THREE.Vector3(-0.12, 0.18, 0),
        new THREE.Vector3(0, 0, 0),
        new THREE.Vector3(0.13, 0.18, 0),
        new THREE.Vector3(0.36, 0.1, 0),
      ]);
      bird.add(new THREE.Line(geo, mat));
      this.scene.add(bird);
    }
  }

  private makeHero(id: string, x: number, z: number, style: number) {
    const group = new THREE.Group();
    group.position.set(x, 0.72, z);
    group.rotation.y = 1.6;
    const body = new THREE.Group();
    group.add(body);
    this.scene.add(group);
    const skin = style === 2 ? 0xc19378 : 0xe1bda1;
    const cloth = [0x294957, 0xebe9ce, 0x685478][style];
    const accent = [0xc0a369, 0x4f9695, 0xa9a0bf][style];
    const boots = [0x4e493e, 0x778c81, 0x463e51][style];
    // Narrow articulated limbs, faceted cloth and hand-shaped profiles read as miniatures.
    this.limb(body, [-0.16, 0.18, 0.05], [-0.16, 0.76, 0], 0.12, boots, 0.11);
    this.limb(body, [0.16, 0.18, -0.04], [0.16, 0.76, 0], 0.12, boots, 0.11);
    this.ellipsoid(body, boots, [-0.16, 0.08, 0.13], [0.135, 0.1, 0.23]);
    this.ellipsoid(body, boots, [0.16, 0.08, 0.04], [0.135, 0.1, 0.23]);
    const tunic = this.mesh(
      new THREE.CylinderGeometry(0.27, style === 0 ? 0.32 : 0.45, style === 0 ? 0.63 : 1.08, 7),
      cloth,
      body,
      0,
      style === 0 ? 1.03 : 0.8,
      0,
    );
    tunic.scale.z = 0.68;
    this.mesh(new THREE.CylinderGeometry(0.277, 0.28, 0.09, 7), accent, body, 0, 0.94, 0).scale.z =
      0.72;
    this.ellipsoid(body, cloth, [0, 1.3, 0], [0.34, 0.24, 0.21]);
    this.mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.17, 6), skin, body, 0, 1.53, 0);
    this.ellipsoid(body, skin, [0, 1.74, 0.025], [0.19, 0.235, 0.18], 1);
    this.ellipsoid(body, skin, [0, 1.71, 0.188], [0.045, 0.062, 0.045], 0);
    const hairColor = [0x253841, 0xd1d6ce, 0x4f3d59][style];
    this.ellipsoid(body, hairColor, [0, 1.91, -0.03], [0.205, 0.11, 0.18]);
    this.ellipsoid(body, hairColor, [0, 1.76, -0.12], [0.195, style === 1 ? 0.3 : 0.16, 0.11]);
    for (let i = 0; i < 5; i++) {
      const spike = this.mesh(
        new THREE.ConeGeometry(0.076, style === 0 ? 0.24 : 0.12, 4),
        hairColor,
        body,
        (i - 2) * 0.065,
        1.98,
        -0.01,
      );
      spike.rotation.z = (i - 2) * 0.18;
    }
    this.limb(body, [-0.31, 1.35, 0], [-0.42, 1.02, 0.12], 0.11, cloth, 0.09);
    this.limb(body, [-0.42, 1.02, 0.12], [-0.43, 0.89, 0.35], 0.075, skin, 0.07);
    this.limb(body, [0.31, 1.35, 0], [0.45, 1.11, 0.22], 0.11, cloth, 0.09);
    this.limb(body, [0.45, 1.11, 0.22], [0.48, 1.0, 0.44], 0.075, skin, 0.07);
    this.ellipsoid(body, skin, [0.48, 1.0, 0.44], [0.085, 0.085, 0.09]);
    if (style === 0) {
      this.ellipsoid(body, PALETTE.gold, [-0.32, 1.39, 0], [0.2, 0.12, 0.22]);
      // Long teal coat tails behind the swordbearer.
      for (const side of [-1, 1]) {
        const coat = this.mesh(
          new THREE.ConeGeometry(0.18, 0.78, 4),
          0x294957,
          body,
          side * 0.18,
          0.63,
          -0.15,
        );
        coat.rotation.z = Math.PI + side * 0.1;
      }
      const sword = new THREE.Group();
      sword.position.set(0.48, 1.02, 0.43);
      sword.rotation.x = -0.67;
      body.add(sword);
      this.mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.27, 6), 0x615748, sword, 0, 0.03, 0);
      this.mesh(new THREE.BoxGeometry(0.36, 0.065, 0.085), PALETTE.gold, sword, 0, 0.19, 0);
      const blade = this.mesh(
        new THREE.ConeGeometry(0.105, 1.34, 4),
        0xcce7e0,
        sword,
        0,
        0.88,
        0,
        this.material(0xcce7e0, 0.25, 0.65),
      );
      blade.scale.z = 0.33;
      const cape = this.mesh(new THREE.ConeGeometry(0.31, 0.72, 5), 0x345967, body, 0, 1.0, -0.2);
      cape.scale.z = 0.25;
    } else if (style === 1) {
      // A turquoise stole with gold embroidery; an open crescent staff.
      for (const side of [-1, 1])
        this.mesh(new THREE.BoxGeometry(0.095, 0.86, 0.035), accent, body, side * 0.18, 1.02, 0.18);
      this.limb(body, [0.5, 0.1, 0.44], [0.5, 2.15, 0.44], 0.029, PALETTE.gold);
      const crescent = this.mesh(
        new THREE.TorusGeometry(0.22, 0.034, 5, 20, Math.PI * 1.6),
        PALETTE.gold,
        body,
        0.5,
        2.36,
        0.44,
      );
      crescent.rotation.z = -Math.PI * 0.3;
      this.mesh(
        new THREE.OctahedronGeometry(0.12),
        0x8ed3c4,
        body,
        0.5,
        2.35,
        0.44,
        new THREE.MeshStandardMaterial({
          color: 0x7fc7bd,
          emissive: 0x5dbcae,
          emissiveIntensity: 0.7,
          roughness: 0.2,
        }),
      );
      this.glow(body, 0.5, 2.35, 0.44, 0x7ee1d6, 0.48, 0.7);
      this.mesh(
        new THREE.TorusGeometry(0.2, 0.022, 5, 12),
        PALETTE.gold,
        body,
        0,
        1.87,
        0,
      ).rotation.x = Math.PI / 2;
    } else {
      const hood = this.mesh(new THREE.ConeGeometry(0.28, 0.28, 7), 0x746382, body, 0, 1.99, -0.04);
      hood.rotation.z = -0.15;
      this.mesh(
        new THREE.BoxGeometry(0.3, 0.37, 0.09),
        0xb19b70,
        body,
        -0.43,
        0.95,
        0.4,
      ).rotation.z = 0.18;
      this.mesh(
        new THREE.BoxGeometry(0.25, 0.3, 0.095),
        0xe3d6b4,
        body,
        -0.43,
        0.95,
        0.407,
      ).rotation.z = 0.18;
      this.mesh(
        new THREE.OctahedronGeometry(0.125),
        0xa5bbdf,
        body,
        0.5,
        1.17,
        0.5,
        new THREE.MeshStandardMaterial({
          color: 0x9fbfdf,
          emissive: 0x607caf,
          emissiveIntensity: 1,
        }),
      );
      this.glow(body, 0.5, 1.19, 0.5, 0xacd1ff, 0.45, 0.8);
    }
    const ring = this.mesh(
      new THREE.RingGeometry(0.59, 0.63, 48),
      0xf4e3a0,
      group,
      0,
      0.002,
      0,
      new THREE.MeshBasicMaterial({
        color: 0xf4e3a0,
        transparent: true,
        opacity: 0.88,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.visible = id === this.activeHero;
    this.heroes.set(id, { group, body, ring, origin: group.position.clone(), phase: style * 2.1 });
  }

  private makeCrab(x: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, 0.73, z);
    group.rotation.y = -0.95;
    const body = new THREE.Group();
    group.add(body);
    this.scene.add(group);
    this.ellipsoid(body, 0xb87464, [0, 0.62, 0], [0.81, 0.43, 0.64]);
    this.ellipsoid(body, 0x698f8e, [0, 0.79, -0.05], [0.8, 0.42, 0.62]);
    this.ellipsoid(body, 0x91aea0, [0, 0.98, -0.09], [0.5, 0.28, 0.42]);
    for (const side of [-1, 1]) {
      for (let j = 0; j < 3; j++) {
        const hip = [side * 0.55, 0.6, 0.33 - j * 0.35];
        const knee = [side * (1.1 + j * 0.04), 0.52, 0.38 - j * 0.47];
        const foot = [side * (1.2 - j * 0.06), 0.04, 0.65 - j * 0.64];
        this.limb(body, hip, knee, 0.12, 0xa97160, 0.095);
        this.limb(body, knee, foot, 0.095, 0xc08d74, 0.025);
      }
      this.limb(body, [side * 0.57, 0.7, 0.35], [side * 1.08, 0.93, 0.89], 0.16, 0xbd7d66, 0.14);
      this.ellipsoid(body, 0xdba386, [side * 1.1, 1.02, 1.11], [0.29, 0.22, 0.38]);
      const claw = this.mesh(
        new THREE.ConeGeometry(0.12, 0.46, 5),
        0xe2b499,
        body,
        side * 1.19,
        1.03,
        1.43,
      );
      claw.rotation.x = Math.PI / 2;
      claw.rotation.z = side * 0.2;
      const pincer = this.mesh(
        new THREE.ConeGeometry(0.1, 0.4, 5),
        0xcc8e72,
        body,
        side * 0.99,
        1.04,
        1.44,
      );
      pincer.rotation.x = Math.PI / 2;
      pincer.rotation.z = -side * 0.3;
      this.limb(body, [side * 0.32, 0.87, 0.36], [side * 0.33, 1.15, 0.5], 0.055, 0x877b60);
      this.ellipsoid(body, 0xeee7ba, [side * 0.33, 1.17, 0.5], [0.09, 0.09, 0.085]);
      this.ellipsoid(body, 0x293e3a, [side * 0.33, 1.18, 0.571], [0.035, 0.045, 0.025]);
    }
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const crystal = this.mesh(
        new THREE.ConeGeometry(0.1 + this.random(i) * 0.06, 0.36 + this.random(i + 6) * 0.3, 5),
        i % 2 ? 0xe8c4aa : 0xca9184,
        body,
        Math.cos(a) * 0.43,
        1.17,
        Math.sin(a) * 0.36 - 0.08,
      );
      crystal.rotation.set(Math.sin(a) * 0.35, a, -Math.cos(a) * 0.35);
    }
    this.addEnemy(group, body, 0, 1.1);
  }

  private makeManta(x: number, z: number) {
    const group = new THREE.Group();
    group.position.set(x, 1.7, z);
    group.rotation.y = -1.0;
    const body = new THREE.Group();
    group.add(body);
    this.scene.add(group);
    this.ellipsoid(body, 0x7798bb, [0, 0.2, 0], [0.54, 0.23, 0.87]);
    this.ellipsoid(body, 0xabcac9, [0, 0.07, 0.1], [0.48, 0.14, 0.71]);
    for (const side of [-1, 1]) {
      const shape = new THREE.Shape();
      shape.moveTo(0.15 * side, -0.63);
      shape.quadraticCurveTo(0.95 * side, -0.5, 1.7 * side, 0.4);
      shape.quadraticCurveTo(0.96 * side, 0.23, 0.57 * side, 0.6);
      shape.lineTo(0.15 * side, 0.45);
      shape.closePath();
      const wing = this.mesh(
        new THREE.ExtrudeGeometry(shape, {
          depth: 0.07,
          bevelEnabled: true,
          bevelThickness: 0.05,
          bevelSize: 0.06,
          bevelSegments: 1,
          steps: 1,
        }),
        0x7799b8,
        body,
        0,
        0.15,
        0,
      );
      wing.rotation.x = Math.PI / 2;
      wing.rotation.y = side * -0.18;
      wing.name = `wing-${side}`;
      this.ellipsoid(body, 0xf0dc9d, [side * 0.25, 0.27, 0.59], [0.08, 0.053, 0.067]);
      this.glow(body, side * 0.25, 0.3, 0.6, 0x9be4d9, 0.22, 0.65);
      for (let j = 0; j < 5; j++)
        this.ellipsoid(
          body,
          0xb5d8c9,
          [side * (0.43 + j * 0.15), 0.24, 0.05 + j * 0.06],
          [0.038, 0.025, 0.055],
          0,
        );
    }
    const tail = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, 0.19, -0.6),
      new THREE.Vector3(0.05, 0.3, -1.15),
      new THREE.Vector3(0.24, 0.5, -1.6),
      new THREE.Vector3(0.14, 0.68, -1.85),
    ]);
    this.mesh(new THREE.TubeGeometry(tail, 14, 0.05, 5, false), 0x719fa8, body);
    const tailTip = this.mesh(
      new THREE.OctahedronGeometry(0.12),
      0xa4dcca,
      body,
      0.14,
      0.68,
      -1.85,
    );
    tailTip.scale.set(0.7, 0.7, 1.5);
    this.glow(body, 0.14, 0.68, -1.85, 0x8de1c9, 0.4, 0.5);
    for (let i = 0; i < 4; i++) {
      const tentacle = new THREE.CatmullRomCurve3([
        new THREE.Vector3((i - 1.5) * 0.18, 0, -0.25),
        new THREE.Vector3((i - 1.5) * 0.21, -0.45, -0.18),
        new THREE.Vector3((i - 1.5) * 0.25, -0.77, -0.4),
      ]);
      this.mesh(new THREE.TubeGeometry(tentacle, 10, 0.024, 4, false), 0xaacdc8, body);
    }
    this.addEnemy(group, body, 1, 1.3);
  }

  private addEnemy(group: THREE.Group, body: THREE.Group, index: number, radius: number) {
    const actor: Actor = { group, body, origin: group.position.clone(), phase: index * 1.6 };
    this.enemies.push(actor);
    const hitbox = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 8, 6),
      new THREE.MeshBasicMaterial({ visible: false }),
    );
    hitbox.position.y = 0.7;
    hitbox.userData.enemyIndex = index;
    group.add(hitbox);
    this.hitboxes.push(hitbox);
  }

  private glow(
    parent: THREE.Object3D,
    x: number,
    y: number,
    z: number,
    color: number,
    size: number,
    opacity: number,
  ) {
    const sprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: this.glowTexture,
        color,
        transparent: true,
        opacity,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    sprite.position.set(x, y, z);
    sprite.scale.setScalar(size);
    parent.add(sprite);
    return sprite;
  }

  /** Batch the static miniature parts by material, keeping animated fronds and wings separate. */
  private optimizeMeshes(root: THREE.Object3D, skip = new Set<THREE.Object3D>()) {
    root.updateWorldMatrix(true, true);
    const inverse = root.matrixWorld.clone().invert();
    const batches = new Map<THREE.Material, THREE.Mesh[]>();
    root.traverse((child) => {
      if (!(child instanceof THREE.Mesh) || Array.isArray(child.material)) return;
      let ancestor: THREE.Object3D | null = child;
      while (ancestor && ancestor !== root) {
        if (skip.has(ancestor)) return;
        ancestor = ancestor.parent;
      }
      const batch = batches.get(child.material) ?? [];
      batch.push(child);
      batches.set(child.material, batch);
    });
    for (const [material, meshes] of batches) {
      if (meshes.length < 2) continue;
      const parts = meshes.map((mesh) => {
        const geometry = mesh.geometry.index ? mesh.geometry.toNonIndexed() : mesh.geometry.clone();
        geometry.applyMatrix4(inverse.clone().multiply(mesh.matrixWorld));
        return geometry;
      });
      const geometry = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      if (!geometry) continue;
      const merged = new THREE.Mesh(geometry, material);
      merged.castShadow = true;
      merged.receiveShadow = true;
      for (const mesh of meshes) {
        mesh.removeFromParent();
        mesh.geometry.dispose();
      }
      root.add(merged);
    }
  }

  setState(state: SceneState) {
    this.activeHero = state.activeHero;
    this.enemyIds = state.enemies.map((enemy) => enemy.id);
    for (const [id, hero] of this.heroes) {
      const data = state.heroes.find((item) => item.id === id);
      hero.ring!.visible = id === state.activeHero && (!data || data.hp > 0);
      hero.body.rotation.z = data && data.hp <= 0 ? -0.8 : 0;
    }
    this.enemies.forEach((enemy, i) => {
      enemy.group.visible = !!state.enemies[i] && state.enemies[i].hp > 0;
      enemy.group.scale.setScalar(
        i === 0 && (state.stage >= 2 || state.enemies.length === 1) ? 1.3 : 1,
      );
    });
    if (this.stage !== state.stage) {
      this.stage = state.stage;
      const finalStage = state.stage >= 2;
      this.sea.material.uniforms.seaColor.value.set(
        finalStage ? 0x537c9b : state.stage === 1 ? 0x528d78 : 0x3aafa9,
      );
      (this.scene.background as THREE.Color).set(
        finalStage ? 0xabc3d0 : state.stage === 1 ? 0xc1d6bb : 0xb7dcd2,
      );
      (this.scene.fog as THREE.FogExp2).color.set(
        finalStage ? 0xb0c3cf : state.stage === 1 ? 0xc2d5bb : 0xaed5ce,
      );
      this.enemies[0].body.traverse((child) => {
        if (
          !(child instanceof THREE.Mesh) ||
          !(child.material instanceof THREE.MeshStandardMaterial)
        )
          return;
        if (child.material.userData.originalColor === undefined) {
          child.material = child.material.clone();
          child.material.userData.originalColor = child.material.color.getHex();
        }
        child.material.color.setHex(child.material.userData.originalColor);
        if (state.stage === 1) child.material.color.lerp(new THREE.Color(0x789b69), 0.6);
        if (finalStage) child.material.color.lerp(new THREE.Color(0xb69673), 0.48);
      });
    }
    if (this.reducedMotion) this.renderer.render(this.scene, this.camera);
  }

  playAction(kind: string, actorId: string | null, targetId?: string) {
    if (kind === 'summon') this.summonSpirit();
    const actor =
      this.heroes.get(actorId ?? '') ?? this.enemies[this.enemyIds.indexOf(actorId ?? '')];
    const target =
      this.heroes.get(targetId ?? '') ??
      this.enemies[this.enemyIds.indexOf(targetId ?? '')] ??
      this.enemies.find((enemy) => enemy.group.visible);
    const point = (target ?? actor)?.group.position.clone() ?? new THREE.Vector3(0, 1, 0);
    point.y += 0.85;
    const isHeal = /heal|mend|potion|cure|restore|ether|phoenix|item/i.test(kind);
    const isGuard = /guard|defend/i.test(kind);
    const isMagic =
      /magic|water|spell|tidal|aqua|thunder|spark|fire|ice|flare|overdrive|tempest|burst|skill|summon|light|lumina|ember|frost/i.test(
        kind,
      );
    const group = new THREE.Group();
    group.position.copy(
      isGuard
        ? (actor?.group.position ?? point)
        : isHeal
          ? (target?.group.position ?? actor?.group.position ?? point)
          : point,
    );
    if (isHeal || isGuard) group.position.y += 0.8;
    this.scene.add(group);
    const color = isHeal
      ? 0xa4e8b6
      : isGuard
        ? 0xa7d8e3
        : /ember|fire/.test(kind)
          ? 0xffaa69
          : /spark|thunder/.test(kind)
            ? 0xffed9a
            : /lumina|summon/.test(kind)
              ? 0xf9efbc
              : isMagic
                ? 0x9de6ec
                : 0xffe2a4;
    const flashes: THREE.Sprite[] = [];
    for (let i = 0; i < 10; i++) {
      flashes.push(this.glow(group, 0, 0, 0, color, 0.2 + this.random(i) * 0.35, 0.95));
    }
    const shockwave = this.mesh(
      new THREE.TorusGeometry(0.4, 0.03, 6, 42),
      color,
      group,
      0,
      0,
      0,
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95, depthWrite: false }),
    );
    shockwave.rotation.x = isGuard ? 0 : Math.PI / 2;
    let shield: THREE.Mesh | null = null;
    if (isGuard) {
      shield = this.mesh(
        new THREE.IcosahedronGeometry(0.95, 1),
        color,
        group,
        0,
        0,
        0,
        new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
          transparent: true,
          opacity: 0.5,
          depthWrite: false,
        }),
      );
    } else if (!isHeal && !isMagic) {
      const slash = this.mesh(
        new THREE.TorusGeometry(0.7, 0.055, 4, 24, Math.PI * 1.4),
        0xfff5d6,
        group,
        0,
        0,
        0,
        new THREE.MeshBasicMaterial({ color: 0xfff3cf, transparent: true, opacity: 0.96 }),
      );
      slash.rotation.set(0.25, 0.2, -0.75);
    } else if (isMagic) {
      for (let i = 0; i < 5; i++) {
        const streak = this.mesh(
          new THREE.ConeGeometry(0.045, 1.6, 4),
          color,
          group,
          (this.random(i) - 0.5) * 1.1,
          0.5,
          (this.random(i + 1) - 0.5) * 1.1,
          new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.75 }),
        );
        streak.rotation.z = -0.4;
      }
    }
    this.effects.push({
      group,
      age: 0,
      duration: this.reducedMotion ? 0.25 : 0.8,
      update: (p) => {
        flashes.forEach((sprite, i) => {
          const a = (i / flashes.length) * Math.PI * 2;
          sprite.position.set(
            Math.cos(a) * p * 1.2,
            Math.sin(a) * p * 1.1 + (isHeal ? p * 1.2 : 0),
            Math.sin(i * 7) * p * 0.8,
          );
          sprite.material.opacity = (1 - p) * 0.9;
        });
        shockwave.scale.setScalar(1 + p * 3);
        (shockwave.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.8;
        if (shield) shield.scale.setScalar(1 + Math.sin(p * Math.PI) * 0.08);
        if (actor && !isHeal && !isGuard && !isMagic && !this.reducedMotion) {
          const direction = point.clone().sub(actor.origin).setY(0).normalize();
          actor.group.position
            .copy(actor.origin)
            .add(direction.multiplyScalar(Math.sin(p * Math.PI) * 0.65));
        }
        if (target && !isHeal && !isGuard && !this.reducedMotion)
          target.body.rotation.z = Math.sin(p * 28) * (1 - p) * 0.13;
        if (p === 1) {
          actor?.group.position.copy(actor.origin);
          if (target) target.body.rotation.z = 0;
        }
      },
    });
  }

  private summonSpirit() {
    const spirit = this.enemies[1].body.clone(true);
    const materials: THREE.Material[] = [];
    spirit.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.geometry = child.geometry.clone();
        child.material = new THREE.MeshBasicMaterial({
          color: 0xd1fff0,
          transparent: true,
          opacity: 0.65,
          side: THREE.DoubleSide,
          depthWrite: false,
        });
        child.castShadow = false;
        materials.push(child.material);
      } else if (child instanceof THREE.Sprite) {
        child.material = child.material.clone();
        materials.push(child.material);
      }
    });
    const group = new THREE.Group();
    group.add(spirit);
    group.position.set(-0.7, 4.6, -0.3);
    spirit.rotation.set(0, -0.8, -0.12);
    spirit.scale.setScalar(2.5);
    const haloMaterial = new THREE.MeshBasicMaterial({
      color: 0xfff1b1,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
    });
    const halo = this.mesh(
      new THREE.TorusGeometry(2.4, 0.025, 4, 80),
      0xfff1b1,
      group,
      0,
      -2.2,
      0,
      haloMaterial,
    );
    halo.rotation.x = Math.PI / 2;
    materials.push(haloMaterial);
    this.scene.add(group);
    this.effects.push({
      group,
      age: 0,
      duration: this.reducedMotion ? 0.9 : 1.8,
      update: (p) => {
        const opacity = Math.min(1, p * 6) * Math.min(1, (1 - p) * 4);
        materials.forEach((material) => {
          material.opacity = opacity * 0.7;
        });
        if (!this.reducedMotion) {
          group.position.x = -2 + p * 5;
          group.position.y = 4.2 + Math.sin(p * Math.PI) * 1.2;
          spirit.rotation.z = Math.sin(p * Math.PI) * 0.15;
          for (const side of [-1, 1]) {
            const wing = spirit.getObjectByName(`wing-${side}`);
            if (wing) wing.rotation.y = side * Math.sin(p * Math.PI * 2) * 0.2;
          }
          halo.scale.setScalar(0.7 + p);
        }
      },
    });
  }

  /** Normalized viewport coordinate for an HTML label above an actor. */
  getAnchor(id: string): { x: number; y: number } | null {
    const hero = this.heroes.get(id);
    const enemy = this.enemies[this.enemyIds.indexOf(id)];
    const actor = hero ?? enemy;
    if (!actor || !actor.group.visible) return null;
    const world = actor.group.position.clone();
    world.y += (hero ? 2.2 : enemy === this.enemies[0] ? 1.65 : 0.8) * actor.group.scale.y;
    world.project(this.camera);
    return { x: (world.x + 1) / 2, y: (1 - world.y) / 2 };
  }

  resize() {
    if (this.disposed) return;
    const width = Math.max(1, this.container.clientWidth);
    const height = Math.max(1, this.container.clientHeight);
    const aspect = width / height;
    const halfHeight = aspect > 1.65 ? 7.25 : 8.1 / aspect;
    this.camera.left = -halfHeight * aspect;
    this.camera.right = halfHeight * aspect;
    this.camera.top = halfHeight;
    this.camera.bottom = -halfHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height, false);
    this.renderer.render(this.scene, this.camera);
  }

  private targetAt(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      (-(event.clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hits = this.raycaster.intersectObjects(
      this.hitboxes.filter((box) => box.parent?.visible),
      false,
    );
    return hits.length ? this.enemyIds[hits[0].object.userData.enemyIndex] : undefined;
  }

  private handlePointerDown = (event: PointerEvent) => {
    const id = this.targetAt(event);
    if (id) this.onTarget?.(id);
  };

  private handlePointerMove = (event: PointerEvent) => {
    this.renderer.domElement.style.cursor = this.targetAt(event) ? 'crosshair' : 'default';
  };

  private handleMotionChange = () => {
    this.reducedMotion = this.motionQuery.matches;
  };

  private animate = () => {
    if (this.disposed) return;
    this.frame = requestAnimationFrame(this.animate);
    const dt = Math.min(this.clock.getDelta(), 0.05);
    this.elapsed += dt;
    if (!this.reducedMotion) {
      const t = this.elapsed;
      this.sea.material.uniforms.time.value = t;
      for (const hero of this.heroes.values()) {
        hero.body.position.y = Math.sin(t * 1.8 + hero.phase) * 0.024;
        if (hero.ring) {
          (hero.ring.material as THREE.MeshBasicMaterial).opacity = 0.62 + Math.sin(t * 2.3) * 0.2;
          hero.ring.rotation.z = t * 0.14;
        }
      }
      this.enemies[0].body.position.y = Math.sin(t * 2.2) * 0.025;
      const manta = this.enemies[1].body;
      manta.position.y = Math.sin(t * 1.35) * 0.15;
      manta.rotation.z = Math.sin(t * 0.9) * 0.04;
      for (const side of [-1, 1]) {
        const wing = manta.getObjectByName(`wing-${side}`);
        if (wing) wing.rotation.y = side * (-0.18 + Math.sin(t * 1.8) * 0.11);
      }
      this.palms.forEach((palm, i) => {
        palm.rotation.z = Math.sin(t * 0.55 + i) * 0.025;
        palm.rotation.y = Math.sin(t * 0.3 + i) * 0.018;
      });
      this.sparkles.rotation.y = t * 0.013;
      this.sparkles.position.y = Math.sin(t * 0.4) * 0.2;
    }
    const shouldRender = !this.reducedMotion || this.effects.length > 0;
    for (let i = this.effects.length - 1; i >= 0; i--) {
      const effect = this.effects[i];
      effect.age += dt;
      const p = Math.min(1, effect.age / effect.duration);
      effect.update(p);
      if (p === 1) {
        this.scene.remove(effect.group);
        this.disposeObject(effect.group);
        this.effects.splice(i, 1);
      }
    }
    if (shouldRender) this.renderer.render(this.scene, this.camera);
  };

  private disposeObject(object: THREE.Object3D) {
    object.traverse((child) => {
      const item = child as THREE.Mesh;
      if (item.geometry && !(child instanceof THREE.Sprite)) item.geometry.dispose();
      if (child instanceof THREE.DirectionalLight) child.shadow.dispose();
      if (item.material) {
        const mats = Array.isArray(item.material) ? item.material : [item.material];
        for (const mat of mats)
          if (![...this.materials.values()].includes(mat as THREE.MeshStandardMaterial))
            mat.dispose();
      }
    });
  }

  destroy() {
    this.disposed = true;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.motionQuery.removeEventListener('change', this.handleMotionChange);
    this.renderer.domElement.removeEventListener('pointerdown', this.handlePointerDown);
    this.renderer.domElement.removeEventListener('pointermove', this.handlePointerMove);
    this.disposeObject(this.scene);
    this.materials.forEach((material) => material.dispose());
    this.glowTexture.dispose();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
