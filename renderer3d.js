// Three.js FPS renderer — medieval joust lists
class FPSRenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.clock = new THREE.Clock();
    this.bobPhase = 0;
    this.shake = 0;
    this.chargeT = 0;
    this.aimX = 0.5;
    this.aimHeight = 0.5;
    this.phase = 'lobby';

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x87a8c4);
    this.scene.fog = new THREE.Fog(0xc9b896, 18, 120);

    this.camera = new THREE.PerspectiveCamera(72, 1, 0.1, 200);
    this.camera.position.set(0, 1.65, 0);

    this._buildLights();
    this._buildEnvironment();
    this._buildWeapon();
    this._buildOpponent();
    this._buildDust();

    this.resize();
  }

  _buildLights() {
    const hemi = new THREE.HemisphereLight(0xdce8f5, 0x8b7355, 0.55);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4d6, 1.35);
    sun.position.set(12, 28, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(1024, 1024);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 80;
    sun.shadow.camera.left = -25;
    sun.shadow.camera.right = 25;
    sun.shadow.camera.top = 25;
    sun.shadow.camera.bottom = -25;
    this.scene.add(sun);
    this.sun = sun;
  }

  _buildEnvironment() {
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(140, 140),
      new THREE.MeshStandardMaterial({ color: 0x4a6b38, roughness: 0.95 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    this.scene.add(ground);

    const track = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 120),
      new THREE.MeshStandardMaterial({ color: 0xc4a060, roughness: 0.88, metalness: 0.05 })
    );
    track.rotation.x = -Math.PI / 2;
    track.position.y = 0.02;
    track.receiveShadow = true;
    this.scene.add(track);

    const lineMat = new THREE.MeshStandardMaterial({ color: 0x8b6914 });
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.8, 110), lineMat);
      rail.position.set(side * 4.8, 0.4, -55);
      rail.castShadow = true;
      this.scene.add(rail);
    }

    for (let z = -50; z <= 10; z += 8) {
      for (const side of [-1, 1]) {
        const bag = this._sandbag();
        bag.position.set(side * 5.5, 0.35, z);
        this.scene.add(bag);
      }
    }

    for (let i = 0; i < 6; i++) {
      const hill = new THREE.Mesh(
        new THREE.SphereGeometry(8 + Math.random() * 6, 8, 8),
        new THREE.MeshStandardMaterial({ color: 0x3d5530, roughness: 1 })
      );
      hill.scale.y = 0.35;
      hill.position.set(-30 + i * 12, 1, -70 - Math.random() * 10);
      this.scene.add(hill);
    }

    for (let z = -45; z < 0; z += 15) {
      for (const side of [-1, 1]) {
        const pole = new THREE.Mesh(
          new THREE.CylinderGeometry(0.08, 0.1, 4, 6),
          new THREE.MeshStandardMaterial({ color: 0x5a4030 })
        );
        pole.position.set(side * 7, 2, z);
        this.scene.add(pole);
        const banner = new THREE.Mesh(
          new THREE.PlaneGeometry(1.2, 0.8),
          new THREE.MeshStandardMaterial({ color: side < 0 ? 0x8b1a1a : 0x1a3a6b, side: THREE.DoubleSide })
        );
        banner.position.set(side * 7.6, 2.8, z);
        banner.rotation.y = side * -0.4;
        this.scene.add(banner);
      }
    }
  }

  _sandbag() {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0x9a7a48, roughness: 0.9 });
    for (let i = 0; i < 3; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.35, 0.5), mat);
      b.position.set((i - 1) * 0.45, i * 0.28, 0);
      b.castShadow = true;
      g.add(b);
    }
    return g;
  }

  _buildWeapon() {
    this.weapon = new THREE.Group();
    const armMat = new THREE.MeshStandardMaterial({ color: 0x4a3828, roughness: 0.85 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0x9aa4ae, metalness: 0.75, roughness: 0.35 });
    const woodMat = new THREE.MeshStandardMaterial({ color: 0x6b4e28, roughness: 0.8 });

    const leftArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.28), armMat);
    leftArm.position.set(-0.18, -0.1, 0.1);
    const rightArm = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.55, 0.28), armMat);
    rightArm.position.set(0.28, -0.15, 0.15);

    const gloveL = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.24), steelMat);
    gloveL.position.set(-0.18, 0.18, 0.05);
    const gloveR = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.24), steelMat);
    gloveR.position.set(0.3, 0.12, 0.08);

    const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.05, 2.8, 8), woodMat);
    shaft.rotation.x = Math.PI / 2;
    shaft.position.set(0.15, 0.05, -1.2);

    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.35, 6), steelMat);
    tip.rotation.x = -Math.PI / 2;
    tip.position.set(0.15, 0.05, -2.55);

    const pennon = new THREE.Mesh(
      new THREE.PlaneGeometry(0.35, 0.5),
      new THREE.MeshStandardMaterial({ color: 0x8b1a1a, side: THREE.DoubleSide })
    );
    pennon.position.set(0.15, 0.2, -1.5);

    this.weapon.add(leftArm, rightArm, gloveL, gloveR, shaft, tip, pennon);
    this.weapon.position.set(0.35, -0.55, -0.15);
    this.weapon.rotation.set(-0.15, -0.08, 0.05);
    this.camera.add(this.weapon);
    this.scene.add(this.camera);
  }

  _buildOpponent() {
    this.opponent = new THREE.Group();
    const horseMat = new THREE.MeshStandardMaterial({ color: 0x3a2818, roughness: 0.9 });
    const armorMat = new THREE.MeshStandardMaterial({ color: 0x2a4a7a, metalness: 0.5, roughness: 0.45 });
    const helmMat = new THREE.MeshStandardMaterial({ color: 0x6a8ab8, metalness: 0.6, roughness: 0.35 });

    const horse = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.9, 2.2), horseMat);
    horse.position.y = 0.9;
    horse.castShadow = true;

    const knight = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.4, 1.2, 8), armorMat);
    knight.position.set(0, 1.7, 0);
    knight.castShadow = true;

    const helm = new THREE.Mesh(new THREE.SphereGeometry(0.32, 10, 10), helmMat);
    helm.position.set(0, 2.45, 0);

    const lance = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 3.5, 6), new THREE.MeshStandardMaterial({ color: 0x6b4e28 }));
    lance.rotation.x = Math.PI / 2;
    lance.position.set(0, 1.9, 1.8);

    this.opponent.add(horse, knight, helm, lance);
    this.opponent.position.set(0, 0, -55);
    this.scene.add(this.opponent);
  }

  _buildDust() {
    this.dust = [];
    const geo = new THREE.SphereGeometry(0.12, 4, 4);
    const mat = new THREE.MeshBasicMaterial({ color: 0xc4a060, transparent: true, opacity: 0.35 });
    for (let i = 0; i < 20; i++) {
      const p = new THREE.Mesh(geo, mat.clone());
      p.visible = false;
      this.scene.add(p);
      this.dust.push({ mesh: p, life: 0 });
    }
  }

  resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    if (w < 1 || h < 1) return;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  setState({ phase, x, height, chargeT, shake }) {
    this.phase = phase;
    this.aimX = x;
    this.aimHeight = height;
    this.chargeT = chargeT;
    if (shake > this.shake) this.shake = shake;
  }

  render() {
    const dt = this.clock.getDelta();
    this.bobPhase += dt * (this.phase === 'charge' ? 14 : 4);
    const bob = Math.sin(this.bobPhase) * (this.phase === 'charge' ? 0.06 : 0.02);
    const gallop = Math.sin(this.bobPhase * 2) * (this.phase === 'charge' ? 0.04 : 0.01);

    const shakeX = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.008 : 0;
    const shakeY = this.shake > 0 ? (Math.random() - 0.5) * this.shake * 0.005 : 0;
    if (this.shake > 0) this.shake *= 0.88;

    this.camera.position.set(
      (this.aimX - 0.5) * 1.2 + shakeX,
      1.65 + bob + shakeY,
      gallop * 0.3
    );

    const pitch = (this.aimHeight - 0.5) * -0.55;
    this.camera.rotation.set(pitch, 0, 0);

    const weaponPitch = (this.aimHeight - 0.5) * -0.7;
    this.weapon.rotation.set(-0.15 + weaponPitch, -0.08, 0.05);
    this.weapon.position.y = -0.55 + bob * 0.5;

    if (this.phase === 'charge' || this.phase === 'result') {
      const ease = this.chargeT * this.chargeT * (3 - 2 * this.chargeT);
      this.opponent.position.z = -55 + ease * 48;
      this.opponent.visible = true;
      this._spawnDust(ease);
    } else if (this.phase === 'aim' || this.phase === 'countdown' || this.phase === 'intro') {
      this.opponent.position.z = -55;
      this.opponent.visible = true;
    } else {
      this.opponent.visible = false;
    }

    this.opponent.position.x = -(this.aimX - 0.5) * 0.8;

    this.renderer.render(this.scene, this.camera);
  }

  _spawnDust(ease) {
    if (Math.random() > 0.4) return;
    const p = this.dust.find(d => d.life <= 0);
    if (!p) return;
    p.life = 1;
    p.mesh.visible = true;
    p.mesh.position.set((Math.random() - 0.5) * 2, 0.2, -2 - Math.random() * 3);
    p.mesh.material.opacity = 0.2 + ease * 0.4;
  }

  updateDust() {
    for (const p of this.dust) {
      if (p.life <= 0) continue;
      p.life -= 0.03;
      p.mesh.position.z += 0.15;
      p.mesh.material.opacity *= 0.95;
      if (p.life <= 0) p.mesh.visible = false;
    }
  }
}

window.FPSRenderer = FPSRenderer;
