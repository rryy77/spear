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
    this.scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x6a5840, 0.45));
    const oculus = new THREE.DirectionalLight(0xfff8e8, 1.6);
    oculus.position.set(0, 55, 0);
    oculus.castShadow = true;
    oculus.shadow.mapSize.set(2048, 2048);
    oculus.shadow.camera.near = 1;
    oculus.shadow.camera.far = 120;
    oculus.shadow.camera.left = -45;
    oculus.shadow.camera.right = 45;
    oculus.shadow.camera.top = 45;
    oculus.shadow.camera.bottom = -45;
    this.scene.add(oculus);
    const fill = new THREE.DirectionalLight(0xffe8c8, 0.35);
    fill.position.set(-25, 15, 20);
    this.scene.add(fill);
  }

  _makeStoneTexture(base = '#c8b8a0') {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    ctx.fillStyle = base;
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 4000; i++) {
      const v = 160 + Math.random() * 60;
      ctx.fillStyle = `rgb(${v},${v - 12},${v - 28})`;
      ctx.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 1 + Math.random() * 2);
    }
    const tex = new THREE.CanvasTexture(c);
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(2, 2);
    return tex;
  }

  _stoneMat(base = '#c8b8a0', roughness = 0.88) {
    return new THREE.MeshStandardMaterial({
      map: this._makeStoneTexture(base),
      roughness,
      metalness: 0.04,
    });
  }

  _ellipsePoint(rx, rz, angle) {
    return { x: Math.cos(angle) * rx, z: Math.sin(angle) * rz };
  }

  _buildColosseum() {
    const stone = this._stoneMat('#c8b8a0');
    const stoneDark = this._stoneMat('#9a8a78', 0.92);
    const sandMat = new THREE.MeshStandardMaterial({ color: 0xb89058, roughness: 0.96, metalness: 0.02 });
    const rx = 58;
    const rz = 40;

    const sand = new THREE.Mesh(new THREE.CircleGeometry(1, 64), sandMat);
    sand.scale.set(rx * 0.92, rz * 0.92, 1);
    sand.rotation.x = -Math.PI / 2;
    sand.receiveShadow = true;
    this.scene.add(sand);

    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(130, 32, 16, 0, Math.PI * 2, 0, Math.PI * 0.55),
      new THREE.MeshBasicMaterial({ color: 0x9ec8e8, side: THREE.BackSide })
    );
    sky.position.y = 15;
    this.scene.add(sky);

    const oculus = new THREE.Mesh(
      new THREE.CircleGeometry(14, 32),
      new THREE.MeshBasicMaterial({ color: 0xd8ecff })
    );
    oculus.rotation.x = -Math.PI / 2;
    oculus.position.y = 52;
    this.scene.add(oculus);

    for (let i = 0; i < 8; i++) {
      const ray = new THREE.Mesh(
        new THREE.CylinderGeometry(0.1, 4, 50, 8, 1, true),
        new THREE.MeshBasicMaterial({ color: 0xfff8e8, transparent: true, opacity: 0.06, side: THREE.DoubleSide })
      );
      ray.position.set((i - 4) * 3, 25, 0);
      this.scene.add(ray);
    }

    for (let tier = 0; tier < 5; tier++) {
      const tierRx = rx + 6 + tier * 8;
      const tierRz = rz + 4 + tier * 6;
      const tierH = 3.8;
      const baseY = tier * tierH + 0.2;
      const arches = 40 + tier * 6;

      for (let i = 0; i < arches; i++) {
        const a = (i / arches) * Math.PI * 2;
        const p = this._ellipsePoint(tierRx, tierRz, a);
        const g = new THREE.Group();
        g.position.set(p.x, baseY + tierH / 2, p.z);
        g.lookAt(0, baseY + tierH / 2, 0);

        const pillarW = 0.55;
        const pillar = new THREE.Mesh(new THREE.BoxGeometry(pillarW, tierH, pillarW), tier % 2 ? stone : stoneDark);
        const pillar2 = pillar.clone();
        pillar.position.x = -1.4;
        pillar2.position.x = 1.4;
        g.add(pillar, pillar2);

        const archTop = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.55, 0.7), stoneDark);
        archTop.position.y = tierH / 2 - 0.2;
        g.add(archTop);

        const opening = new THREE.Mesh(
          new THREE.PlaneGeometry(2.2, tierH - 0.8),
          new THREE.MeshStandardMaterial({ color: 0x1a1410, roughness: 1 })
        );
        opening.position.z = 0.2;
        g.add(opening);

        this.scene.add(g);

        if (tier >= 1 && i % 3 === 0) {
          const crowdY = baseY + 0.6 + Math.random() * (tierH - 1);
          for (let c = 0; c < 4; c++) {
            const off = this._ellipsePoint(tierRx - 1.5 - Math.random() * 2, tierRz - 1 - Math.random() * 1.5, a + (c - 1.5) * 0.02);
            const person = new THREE.Mesh(
              new THREE.CylinderGeometry(0.12, 0.14, 0.55, 6),
              new THREE.MeshStandardMaterial({ color: new THREE.Color().setHSL(Math.random(), 0.35, 0.28 + Math.random() * 0.2) })
            );
            person.position.set(off.x, crowdY, off.z);
            this.scene.add(person);
          }
        }
      }

      const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.35, 6, 64), stoneDark);
      ring.scale.set(tierRx, 0.5, tierRz);
      ring.rotation.x = Math.PI / 2;
      ring.position.y = baseY + tierH;
      this.scene.add(ring);
    }

    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2;
      const p = this._ellipsePoint(rx + 4, rz + 3, a);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.65, 5.5, 10), stone);
      col.position.set(p.x, 2.75, p.z);
      col.castShadow = true;
      this.scene.add(col);
    }

    this.scene.fog = new THREE.Fog(0xc9b898, 55, 130);
    this.scene.background = new THREE.Color(0xa8c4d8);
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
