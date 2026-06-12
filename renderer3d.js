// Three.js FPS — 馬上槍試合（中央壁・コロッセウム）
class FPSRenderer {
  constructor(canvas, playerSide) {
    this.canvas = canvas;
    this.playerSide = playerSide; // 'host' = 騎士A（壁の左）, 'guest' = 騎士B（壁の右）
    this.isHost = playerSide === 'host';
    this.laneX = this.isHost ? -2.6 : 2.6;
    this.startZ = this.isHost ? 48 : -48;
    this.endZ = this.isHost ? -48 : 48;
    this.wallSide = this.isHost ? 1 : -1;

    this.clock = new THREE.Clock();
    this.bobPhase = 0;
    this.shake = 0;
    this.chargeT = 0;
    this.aimX = 0.5;
    this.aimHeight = 0.5;
    this.phase = 'lobby';
    this.stabT = 0;
    this.dodgeT = 0;

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xa8c0d8);
    this.scene.fog = new THREE.Fog(0xd4c4a0, 40, 150);

    this.camera = new THREE.PerspectiveCamera(68, 1, 0.1, 250);

    this._buildLights();
    this._buildColosseum();
    this._buildTiltWall();
    this._buildTracks();
    this._buildWeapon();
    this._buildOpponentKnight();

    this.playerZ = this.startZ;
    this.resize();
  }

  _buildLights() {
    this.scene.add(new THREE.HemisphereLight(0xe8f0ff, 0x8a7050, 0.5));
    const sun = new THREE.DirectionalLight(0xfff0d0, 1.4);
    sun.position.set(20, 40, 10);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -40;
    sun.shadow.camera.right = 40;
    sun.shadow.camera.top = 40;
    sun.shadow.camera.bottom = -40;
    this.scene.add(sun);
  }

  _buildColosseum() {
    const stone = new THREE.MeshStandardMaterial({ color: 0xb8a898, roughness: 0.85 });
    const darkStone = new THREE.MeshStandardMaterial({ color: 0x8a7a6a, roughness: 0.9 });

    const arenaFloor = new THREE.Mesh(
      new THREE.CircleGeometry(55, 48),
      new THREE.MeshStandardMaterial({ color: 0xc4a060, roughness: 0.92 })
    );
    arenaFloor.rotation.x = -Math.PI / 2;
    arenaFloor.receiveShadow = true;
    this.scene.add(arenaFloor);

    for (let tier = 0; tier < 4; tier++) {
      const r = 42 + tier * 6;
      const h = 3.5;
      const y = h * tier + 0.5;
      for (let i = 0; i < 32; i++) {
        const a = (i / 32) * Math.PI * 2;
        const arch = new THREE.Mesh(new THREE.BoxGeometry(3.5, h, 2.2), tier % 2 ? stone : darkStone);
        arch.position.set(Math.cos(a) * r, y + h / 2, Math.sin(a) * r);
        arch.rotation.y = -a;
        arch.castShadow = true;
        this.scene.add(arch);

        if (i % 2 === 0) {
          const banner = new THREE.Mesh(
            new THREE.PlaneGeometry(1.5, 2.5),
            new THREE.MeshStandardMaterial({
              color: [0x8b1a1a, 0x1a3a6b, 0xc9a227][i % 3],
              side: THREE.DoubleSide,
            })
          );
          banner.position.set(Math.cos(a) * (r - 1.5), y + h * 0.7, Math.sin(a) * (r - 1.5));
          banner.rotation.y = -a + Math.PI / 2;
          this.scene.add(banner);
        }
      }
    }

    for (let i = 0; i < 80; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 38 + Math.random() * 18;
      const crowd = new THREE.Mesh(
        new THREE.BoxGeometry(0.3, 0.6 + Math.random() * 0.4, 0.25),
        new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.4, 0.35 + Math.random() * 0.2) })
      );
      crowd.position.set(Math.cos(a) * r, 2 + Math.random() * 8, Math.sin(a) * r);
      this.scene.add(crowd);
    }
  }

  _buildTiltWall() {
    this.wallGroup = new THREE.Group();
    const wood = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 0.9 });
    const yellow = new THREE.MeshStandardMaterial({ color: 0xe8c020, roughness: 0.6 });
    const clothW = new THREE.MeshStandardMaterial({ color: 0xf0f0f0, roughness: 0.95 });
    const clothB = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.95 });

    for (let z = -58; z <= 58; z += 2) {
      const panel = new THREE.Mesh(new THREE.BoxGeometry(0.12, 1.3, 1.8), (Math.floor(z / 2) % 2 === 0) ? clothW : clothB);
      panel.position.set(0, 0.85, z);
      panel.castShadow = true;
      this.wallGroup.add(panel);
    }

    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.15, 118), yellow);
    rail.position.set(0, 1.55, 0);
    this.wallGroup.add(rail);

    const postL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 1.8, 0.25), wood);
    postL.position.set(0, 0.9, -58);
    const postR = postL.clone();
    postR.position.z = 58;
    this.wallGroup.add(postL, postR);

    this.scene.add(this.wallGroup);
  }

  _buildTracks() {
    for (const side of [-1, 1]) {
      const lane = new THREE.Mesh(
        new THREE.PlaneGeometry(4.5, 118),
        new THREE.MeshStandardMaterial({ color: 0xb89850, roughness: 0.9 })
      );
      lane.rotation.x = -Math.PI / 2;
      lane.position.set(side * 2.6, 0.03, 0);
      lane.receiveShadow = true;
      this.scene.add(lane);
    }
  }

  _buildKnightModel(colors) {
    const g = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xb0b8c0, metalness: 0.8, roughness: 0.3 });
    const armor = new THREE.MeshStandardMaterial({ color: colors.armor, metalness: 0.65, roughness: 0.35 });
    const horse = new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.88 });
    const cap = new THREE.MeshStandardMaterial({ color: colors.caparison, roughness: 0.8 });

    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.85, 2.0), horse);
    body.position.y = 1.0;
    body.castShadow = true;

    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.3, 0.7, 8), horse);
    neck.position.set(0, 1.35, 0.95);
    neck.rotation.x = -0.5;

    const head = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.4, 0.7), horse);
    head.position.set(0, 1.55, 1.35);

    const capMesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.9, 2.1), cap);
    capMesh.position.y = 1.05;

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.9, 0.55), armor);
    torso.position.set(0, 2.0, 0);
    torso.castShadow = true;

    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 10, 10), steel);
    helm.position.set(0, 2.65, 0);
    helm.scale.y = 1.1;

    const plume = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.5, 6), new THREE.MeshStandardMaterial({ color: colors.plume }));
    plume.position.set(0, 3.05, 0);

    const lance = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.045, 3.8, 8), new THREE.MeshStandardMaterial({ color: 0x6b4e28 }));
    shaft.rotation.z = Math.PI / 2;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.3, 6), steel);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 2.0;
    lance.add(shaft, tip);
    lance.position.set(0.35, 2.1, 0.3);
    lance.rotation.y = colors.lanceYaw ?? 0;

    g.add(body, neck, head, capMesh, torso, helm, plume, lance);
    return g;
  }

  _buildWeapon() {
    this.weapon = new THREE.Group();
    const steel = new THREE.MeshStandardMaterial({ color: 0xa8b0b8, metalness: 0.8, roughness: 0.3 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6b4e28, roughness: 0.85 });
    const leather = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 });

    const horseNeck = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.35, 0.7), leather);
    horseNeck.position.set(this.wallSide * 0.15, -0.35, 0.2);

    const glove = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.2, 0.22), steel);
    glove.position.set(this.wallSide * 0.05, -0.05, -0.05);

    this.lanceGroup = new THREE.Group();
    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 3.2, 8), wood);
    shaft.rotation.z = Math.PI / 2;
    shaft.position.x = 1.6;
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.28, 6), steel);
    tip.rotation.z = -Math.PI / 2;
    tip.position.x = 3.35;
    const pennon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.3, 0.45),
      new THREE.MeshStandardMaterial({ color: this.isHost ? 0x8b1a1a : 0x1a3a6b, side: THREE.DoubleSide })
    );
    pennon.position.set(1.0, 0.15, 0);
    pennon.rotation.y = Math.PI / 2;
    this.lanceGroup.add(shaft, tip, pennon);

    this.weapon.add(horseNeck, glove, this.lanceGroup);
    this.weapon.position.set(this.wallSide * 0.25, -0.45, -0.35);
    this.camera.add(this.weapon);
    this.scene.add(this.camera);
  }

  _buildOpponentKnight() {
    this.opponent = this._buildKnightModel({
      armor: 0x4a5a7a,
      caparison: this.isHost ? 0x1a3a8b : 0x8b1a1a,
      plume: this.isHost ? 0x5a9ae8 : 0xe85a5a,
      lanceYaw: this.isHost ? -0.55 : 0.55,
    });
    this.opponent.scale.set(0.85, 0.85, 0.85);
    this.scene.add(this.opponent);
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 1 || h < 1) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setState({ phase, x, height, chargeT, shake, stabT, dodgeT, playerSide }) {
    this.phase = phase;
    this.aimX = x;
    this.aimHeight = height;
    this.chargeT = chargeT;
    if (stabT > this.stabT) this.stabT = stabT;
    if (dodgeT > this.dodgeT) this.dodgeT = dodgeT;
    if (shake > this.shake) this.shake = shake;
    if (playerSide) {
      this.playerSide = playerSide;
      this.isHost = playerSide === 'host';
    }
  }

  render() {
    const dt = this.clock.getDelta();
    this.bobPhase += dt * (this.phase === 'charge' ? 16 : 5);
    const gallop = Math.sin(this.bobPhase) * (this.phase === 'charge' ? 0.08 : 0.02);
    const gallop2 = Math.sin(this.bobPhase * 2.1) * (this.phase === 'charge' ? 0.04 : 0.01);

    if (this.stabT > 0) this.stabT -= dt;

    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.006 : 0;
    if (this.shake > 0) this.shake *= 0.88;

    if (this.dodgeT > 0) this.dodgeT -= dt;
    const dodgeShift = this.dodgeT > 0 ? this.wallSide * this.dodgeT * 0.5 : 0;
    const lateral = (this.aimX - 0.5) * 1.8 + dodgeShift;
    const ease = this.chargeT * this.chargeT * (3 - 2 * this.chargeT);

    if (this.phase === 'charge' || this.phase === 'result') {
      this.playerZ = this.startZ + (this.endZ - this.startZ) * ease;
    } else if (this.phase === 'intro' || this.phase === 'aim' || this.phase === 'countdown') {
      this.playerZ = this.startZ;
    }

    const camY = 2.35 + gallop + gallop2;
    this.camera.position.set(this.laneX + lateral + shakeX, camY, this.playerZ);
    this.camera.rotation.order = 'YXZ';

    const yaw = this.isHost ? Math.PI : 0;
    const pitch = (this.aimHeight - 0.5) * -0.35;
    this.camera.rotation.set(pitch, yaw, 0);

    const lanceYaw = this.wallSide * 0.62;
    const lancePitch = (this.aimHeight - 0.5) * -0.45;
    const stabPush = this.stabT > 0 ? 0.35 * (this.stabT / 0.35) : 0;
    this.lanceGroup.rotation.set(lancePitch, lanceYaw, 0);
    this.lanceGroup.position.x = 1.6 + stabPush;
    this.weapon.position.y = -0.45 + gallop * 0.4;

    if (this.phase === 'charge' || this.phase === 'result' || this.phase === 'aim' || this.phase === 'countdown' || this.phase === 'intro') {
      const oppStartZ = -this.startZ;
      const oppEndZ = -this.endZ;
      const oppZ = oppStartZ + (oppEndZ - oppStartZ) * ease;
      const oppX = this.isHost ? 2.6 : -2.6;
      this.opponent.position.set(oppX, 0, oppZ);
      this.opponent.rotation.y = this.isHost ? 0 : Math.PI;
      this.opponent.visible = true;
    } else {
      this.opponent.visible = false;
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateDust() {}
}

window.FPSRenderer = FPSRenderer;
