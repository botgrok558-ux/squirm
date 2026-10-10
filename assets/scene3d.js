/* Squirm 3D scene (three.js r147 classic build, works from file://).
   A glass tank on a desk with Squirm inside, plus three original toy statues
   behind it (a chill dog guy, a squirrel with a nut, a sleepy frog).
   createScene3D(stage, brain, onEat) returns { buys(n), sells(n), vibe() }
   or null when WebGL is not available (app.js then uses the 2D fallback). */
(function () {
  window.createScene3D = function (stage, brain, onEat) {
    if (!window.THREE || !THREE.OrbitControls) return null;
    const probe = document.createElement("canvas");
    if (!(probe.getContext("webgl2") || probe.getContext("webgl"))) return null;
    if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;

    const T = THREE, clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v)), lerp = (a, b, k) => a + (b - a) * k;
    const coarse = window.matchMedia && matchMedia("(pointer:coarse)").matches;
    const V = (x, y, z) => new T.Vector3(x, y, z);

    /* ---------- renderer / scene / camera ---------- */
    const renderer = new T.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputEncoding = T.sRGBEncoding;
    renderer.toneMapping = T.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = T.PCFSoftShadowMap;
    stage.appendChild(renderer.domElement);

    const scene = new T.Scene();
    scene.background = new T.Color(0x0b3d3a);
    scene.fog = new T.Fog(0x0b3d3a, 22, 40);
    const pmrem = new T.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new T.RoomEnvironment(), 0.04).texture;

    const camera = new T.PerspectiveCamera(40, 1, 0.1, 80);
    const TARGET = V(0, 1.75, -1.75);
    const controls = new T.OrbitControls(camera, renderer.domElement);
    controls.target.copy(TARGET);
    controls.enableDamping = true; controls.dampingFactor = 0.08; controls.enablePan = false;
    controls.minPolarAngle = 0.55; controls.maxPolarAngle = 1.42;
    controls.minAzimuthAngle = -0.65; controls.maxAzimuthAngle = 0.65; // statues stand behind the tank, so no full circle
    controls.autoRotate = true; controls.autoRotateSpeed = 0.35;
    let lastTouch = 0;
    controls.addEventListener("start", () => { controls.autoRotate = false; lastTouch = performance.now(); });
    controls.addEventListener("end", () => { lastTouch = performance.now(); });

    /* ---------- lights ---------- */
    scene.add(new T.HemisphereLight(0xbff5e8, 0x0b3d3a, 0.3));
    const key = new T.DirectionalLight(0xfff1da, 0.9);
    key.position.set(4, 10, 6);
    key.castShadow = true;
    key.shadow.mapSize.set(coarse ? 1024 : 1024, coarse ? 1024 : 1024);
    Object.assign(key.shadow.camera, { left: -7, right: 7, top: 6, bottom: -5, near: 1, far: 28 });
    key.shadow.bias = -0.0006; key.shadow.radius = 4;
    scene.add(key);
    const warm = new T.SpotLight(0xffc77a, 1.2, 0, 0.75, 0.7, 1.1); // desk lamp feel, light only
    warm.position.set(-5, 7, 3); warm.target.position.set(0, 0.5, -0.5); scene.add(warm, warm.target);
    const rimL = new T.DirectionalLight(0x7fe3cf, 0.35); rimL.position.set(0, 5, -8); scene.add(rimL);

    /* ---------- shared helpers ---------- */
    const SPH_HI = new T.SphereGeometry(1, coarse ? 16 : 22, coarse ? 12 : 16), SPH_LO = new T.SphereGeometry(1, coarse ? 10 : 14, coarse ? 7 : 10);
    let SPH = SPH_HI; // crowd figures are built with the low-poly sphere
    const CYL = new T.CylinderGeometry(1, 1, 1, 14);
    const toon = (c, o = {}) => new T.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.55, metalness: 0.0, envMapIntensity: 0.6 }, o));
    function ball(parent, mat, p, s, rot) {
      const m = new T.Mesh(SPH, mat); m.position.set(p[0], p[1], p[2]);
      if (typeof s === "number") m.scale.setScalar(s); else m.scale.set(s[0], s[1], s[2]);
      if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
      m.castShadow = true; parent.add(m); return m;
    }
    function limb(parent, mat, r) { const m = new T.Mesh(CYL, mat); m.castShadow = true; m.userData.r = r; parent.add(m); return m; }
    const UP = V(0, 1, 0), tmpD = new T.Vector3();
    function setLimb(m, a, b) {
      tmpD.subVectors(b, a); const len = tmpD.length();
      m.position.copy(a).addScaledVector(tmpD, 0.5);
      m.quaternion.setFromUnitVectors(UP, tmpD.normalize());
      m.scale.set(m.userData.r, len, m.userData.r);
    }
    const LID = new T.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), CONE = new T.ConeGeometry(1, 1, 12);
    function lidFor(parent, mat, r, p) { // upper eyelid: hemisphere, rotation.x opens/closes it
      const g = new T.Mesh(LID, mat); g.scale.setScalar(r);
      g.position.set(p[0], p[1], p[2]); parent.add(g); return g;
    }
    const MATS = {}, M = (c, r = 0.65) => MATS[c + "/" + r] || (MATS[c + "/" + r] = toon(c, { roughness: r }));
    function cone(parent, mat, p, r, h, rot) { const m = new T.Mesh(CONE, mat); m.scale.set(r, h, r); m.position.set(p[0], p[1], p[2]); if (rot) m.rotation.set(rot[0], rot[1], rot[2]); m.castShadow = true; parent.add(m); return m; }
    const ink = toon(0x17172a, { roughness: 0.2 }), whiteM = toon(0xffffff, { roughness: 0.2 }), shineM = new T.MeshBasicMaterial({ color: 0xffffff });

    /* ---------- desk ---------- */
    const desk = new T.Mesh(new T.BoxGeometry(48, 0.5, 30), toon(0x1d5953, { roughness: 0.85, envMapIntensity: 0.25 }));
    desk.position.set(0, -0.25, -4); desk.receiveShadow = true; scene.add(desk);

    /* ---------- glass tank ---------- */
    const TW = 5, TD = 3, TH = 2.2, SURF = 0.38;
    const BX = TW / 2 - 0.42, BZ = TD / 2 - 0.38; // worm bounds
    const glassM = new T.MeshPhysicalMaterial({ color: 0xd8fff4, roughness: 0.04, transparent: true, opacity: 0.16, clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 2.2, side: T.DoubleSide, depthWrite: false });
    const frameM = toon(0x7fe3cf, { roughness: 0.3, emissive: 0x2a8f7f, emissiveIntensity: 0.25 });
    const tank = new T.Group(); scene.add(tank);
    const wall = (w, h, d, x, y, z) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), glassM); m.position.set(x, y, z); m.renderOrder = 3; tank.add(m); return m; };
    wall(TW, TH, 0.05, 0, TH / 2, TD / 2); wall(TW, TH, 0.05, 0, TH / 2, -TD / 2);
    wall(0.05, TH, TD, TW / 2, TH / 2, 0); wall(0.05, TH, TD, -TW / 2, TH / 2, 0);
    const base = new T.Mesh(new T.BoxGeometry(TW + 0.12, 0.14, TD + 0.12), frameM); base.position.y = 0.07; base.castShadow = base.receiveShadow = true; tank.add(base);
    const e = 0.07; // thin frame edges + lid rim
    [[TW + e, e, e, 0, TH, TD / 2], [TW + e, e, e, 0, TH, -TD / 2], [e, e, TD + e, TW / 2, TH, 0], [e, e, TD + e, -TW / 2, TH, 0],
     [e, TH, e, TW / 2, TH / 2, TD / 2], [e, TH, e, -TW / 2, TH / 2, TD / 2], [e, TH, e, TW / 2, TH / 2, -TD / 2], [e, TH, e, -TW / 2, TH / 2, -TD / 2]]
      .forEach(([w, h, d, x, y, z]) => { const m = new T.Mesh(new T.BoxGeometry(w, h, d), frameM); m.position.set(x, y, z); m.castShadow = true; tank.add(m); });
    const lidRim = new T.Mesh(new T.BoxGeometry(TW + 0.2, 0.05, 0.22), frameM); lidRim.position.set(0, TH + 0.06, -TD / 2 + 0.05); tank.add(lidRim);
    // glass highlights on the front pane
    const hlM = new T.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.12, depthWrite: false, side: T.DoubleSide });
    [[-1.2, 0.35], [-0.75, 0.14]].forEach(([x, w]) => { const m = new T.Mesh(new T.PlaneGeometry(w, TH * 0.9), hlM); m.position.set(x, TH / 2, TD / 2 + 0.03); m.rotation.z = 0.35; tank.add(m); });
    // sand / agar floor
    const sandM = toon(0xf6e2b8, { roughness: 0.75, emissive: 0xffa860, emissiveIntensity: 0.05, envMapIntensity: 0.35 });
    const sand = new T.Mesh(new T.BoxGeometry(TW - 0.06, SURF - 0.14, TD - 0.06), sandM);
    sand.position.y = 0.14 + (SURF - 0.14) / 2; sand.receiveShadow = true; tank.add(sand);
    const speck = new T.InstancedMesh(SPH, toon(0xe0b070, { roughness: 0.9 }), 60), dm = new T.Object3D();
    for (let i = 0; i < 60; i++) { const s = 0.02 + Math.random() * 0.045; dm.position.set((Math.random() - 0.5) * (TW - 0.3), SURF, (Math.random() - 0.5) * (TD - 0.3)); dm.scale.set(s, s * 0.35, s); dm.updateMatrix(); speck.setMatrixAt(i, dm.matrix); }
    tank.add(speck);
    // pebbles
    [[-2.0, -1.05, 0.2, 0xb8c4c2], [-1.7, -1.15, 0.14, 0xff9cc0], [2.05, 1.0, 0.18, 0x9fd8cb], [1.75, 1.15, 0.12, 0xd9c7a5], [-2.1, 1.05, 0.16, 0x9fb8c8], [0.6, -1.15, 0.12, 0xc9d6d3], [2.1, -0.4, 0.13, 0xffb3a1]]
      .forEach(([x, z, s, c]) => ball(tank, toon(c, { roughness: 0.4 }), [x, SURF + s * 0.25, z], [s, s * 0.6, s * 0.85], [0, Math.random() * 3, 0]));
    // tiny plant
    const plant = new T.Group(); plant.position.set(1.85, SURF, -0.95); tank.add(plant);
    const leafM = toon(0x4fbf7a, { roughness: 0.5 }), leaf2 = toon(0x3a9f62, { roughness: 0.5 });
    const leaves = [];
    for (let i = 0; i < 6; i++) {
      const g = new T.Group(); g.rotation.y = i * 1.05; plant.add(g);
      const l = ball(g, i % 2 ? leafM : leaf2, [0, 0.42 + (i % 3) * 0.06, 0.12], [0.07, 0.42 + (i % 3) * 0.08, 0.04], [0.35, 0, 0]);
      leaves.push(g);
    }
    ball(plant, toon(0xd9c7a5), [0, 0.05, 0], [0.18, 0.08, 0.18]);

    /* ---------- worm ---------- */
    const NMIN = 20, NMAX = 30, GAP = 0.165; let N = NMIN;
    const mkSkin = (c) => new T.MeshPhysicalMaterial({ color: c, roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.35, sheen: 0.25, sheenColor: new T.Color(0xffc2d7), emissive: 0xff3d7f, emissiveIntensity: 0.05 });
    const skinA = mkSkin(0xff4d92), skinB = mkSkin(0xe0367a), skinH = mkSkin(0xff5c9c);
    const skins = [skinA, skinB, skinH];
    const PINK = new T.Color(0xff4d92), PINK2 = new T.Color(0xe0367a), PINKH = new T.Color(0xff5c9c), DULL = new T.Color(0xc99aae);
    const segs = [], pts = [], radii = [];
    for (let i = 0; i < NMAX; i++) {
      const r = 0.2 * (0.6 + 0.4 * Math.sin(Math.PI * (i + 4) / (NMIN + 4)));
      radii.push(i === NMIN - 1 ? r * 0.8 : r);
      const m = new T.Mesh(SPH, i % 2 ? skinB : skinA); m.castShadow = true; m.scale.setScalar(radii[i]);
      scene.add(m); segs.push(m); pts.push(V(0.8 - i * GAP, 0, 0.2));
    }
    const head = new T.Group(); scene.add(head);
    const HR = 0.3;
    ball(head, skinH, [0, 0, 0], HR);
    const lids = [];
    [-1, 1].forEach(sd => {
      const eye = new T.Group(); eye.position.set(0.12 * sd, 0.09, 0.2); head.add(eye);
      ball(eye, whiteM, [0, 0, 0], 0.105).castShadow = false;
      ball(eye, ink, [0, 0, 0.045], 0.078).castShadow = false;
      ball(eye, shineM, [-0.025 * sd + 0.012, 0.035, 0.12], 0.024).castShadow = false;
      const lid = lidFor(eye, skinH, 0.112, [0, 0, 0]); lid.rotation.x = -1.45; lids.push(lid);
      const blush = ball(head, new T.MeshBasicMaterial({ color: 0xff3d7f, transparent: true, opacity: 0.55 }), [0.21 * sd, -0.04, 0.21], [0.055, 0.03, 0.02]);
      blush.castShadow = false; blush.lookAt(0.6 * sd, -0.1, 0.6);
    });
    const smile = new T.Mesh(new T.TorusGeometry(0.06, 0.013, 6, 18, Math.PI), ink);
    smile.position.set(0, -0.06, 0.29); smile.rotation.z = Math.PI; head.add(smile);
    const wormLight = new T.PointLight(0xff7fae, 0, 3.5, 2); scene.add(wormLight);

    /* ---------- statues (original toy figures built from primitives) ---------- */
    const pedM = toon(0x0f4743, { roughness: 0.4, metalness: 0.2 }), pedRim = toon(0x7fe3cf, { roughness: 0.3 });
    const PED = new T.CylinderGeometry(1, 1.08, 1, 32), RING = new T.TorusGeometry(1.02, 0.025, 6, 40);
    // pedestals are drawn for all figures at once by two InstancedMeshes (see layoutStatues)
    function pedestal(g, r, h = 0.22) { g.userData.ped = { r, h }; }

    // 1) the laid-back dog guy: grey sweater, jeans, hands in pockets, smirk
    function makeDog() {
      const g = new T.Group(); pedestal(g, 0.85);
      const body = new T.Group(); body.position.y = 0.22; g.add(body);
      const jeans = toon(0x40618f, { roughness: 0.8 }), sweater = toon(0x7f858d, { roughness: 0.95, envMapIntensity: 0.4 }), shoe = toon(0xe9e4da, { roughness: 0.6 }), sole = toon(0x2b2b33);
      const fur = toon(0xc98a52, { roughness: 0.75 }), furL = toon(0xe8c28f, { roughness: 0.75 }), furD = toon(0x8a5a32, { roughness: 0.8 });
      [-1, 1].forEach(sd => {
        ball(body, shoe, [0.24 * sd, 0.1, 0.1], [0.17, 0.11, 0.28]); ball(body, sole, [0.24 * sd, 0.03, 0.1], [0.18, 0.04, 0.29]);
        const leg = limb(body, jeans, 0.16); setLimb(leg, V(0.23 * sd, 0.15, 0.02), V(0.21 * sd, 1.15, 0));
      });
      ball(body, jeans, [0, 1.22, 0], [0.45, 0.26, 0.3]);
      const torso = new T.Group(); torso.position.y = 1.3; body.add(torso);
      ball(torso, sweater, [0, 0.42, 0], [0.5, 0.58, 0.36]);
      ball(torso, toon(0x6c7179, { roughness: 0.95 }), [0, -0.05, 0], [0.47, 0.12, 0.33]); // ribbed hem
      const collar = new T.Mesh(new T.TorusGeometry(0.17, 0.05, 8, 20), toon(0x6c7179, { roughness: 0.95 })); collar.rotation.x = Math.PI / 2; collar.position.y = 0.95; torso.add(collar);
      // pockets on the jeans front; arms go into them
      [-1, 1].forEach(sd => ball(body, toon(0x34507a, { roughness: 0.8 }), [0.27 * sd, 1.18, 0.24], [0.13, 0.1, 0.04]));
      const arms = [-1, 1].map(sd => ({ sd, up: limb(body, sweater, 0.12), lo: limb(body, sweater, 0.11), cuff: ball(body, toon(0x6c7179), [0, 0, 0], [0.12, 0.06, 0.12]) }));
      const headG = new T.Group(); headG.position.set(0, 2.32, 0.02); body.add(headG);
      ball(headG, fur, [0, 0.33, 0], [0.4, 0.38, 0.38]);
      ball(headG, furL, [0, 0.2, 0.3], [0.24, 0.17, 0.25]);
      ball(headG, ink, [0, 0.29, 0.54], [0.075, 0.06, 0.06]);
      ball(headG, furL, [0, 0.12, 0.2], [0.26, 0.12, 0.2]);
      const smirk = new T.Mesh(new T.TorusGeometry(0.085, 0.014, 6, 14, Math.PI * 0.55), ink);
      smirk.position.set(0.06, 0.12, 0.49); smirk.rotation.set(0.15, 0, Math.PI + 0.55); headG.add(smirk);
      const dlids = [];
      [-1, 1].forEach(sd => {
        ball(headG, whiteM, [0.15 * sd, 0.43, 0.3], [0.085, 0.085, 0.06]).castShadow = false;
        ball(headG, ink, [0.15 * sd + 0.015, 0.42, 0.35], 0.045).castShadow = false;
        const l = lidFor(headG, fur, 0.092, [0.15 * sd, 0.43, 0.3]); l.scale.z = 0.092 * 0.75; l.rotation.x = 0.35; dlids.push(l);
        ball(headG, furD, [0.15 * sd, 0.53, 0.33], [0.08, 0.018, 0.03], [0, 0, -0.15 * sd]); // relaxed brows
        const ear = new T.Group(); ear.position.set(0.33 * sd, 0.55, -0.02); headG.add(ear);
        ball(ear, furD, [0.05 * sd, -0.22, 0], [0.11, 0.27, 0.07], [0, 0, 0.25 * sd]); ear.userData.sd = sd; dlids.push(ear);
      });
      g.userData.update = (t, m) => {
        const breath = Math.sin(t * 1.6) * 0.5 + 0.5;
        torso.scale.set(1 + breath * 0.02, 1 + breath * 0.03, 1 + breath * 0.02);
        body.rotation.z = Math.sin(t * 0.6) * 0.035 - m.slump * 0.04;
        body.position.y = 0.22 + m.cheer * Math.abs(Math.sin(t * 9)) * 0.12;
        const shrug = Math.max(m.slump, 0) * 0.12 + breath * 0.02;
        arms.forEach(a => {
          const sh = V(0.5 * a.sd, 2.15 + shrug, 0.02), el = V(0.47 * a.sd, 1.62 + shrug * 0.5, 0.1), hand = V(0.3 * a.sd, 1.2, 0.2);
          setLimb(a.up, sh, el); setLimb(a.lo, el, hand); a.cuff.position.set(0.31 * a.sd, 1.25, 0.2);
        });
        headG.rotation.y = Math.sin(t * 0.35) * 0.45 + Math.sin(t * 1.3) * 0.05;
        headG.rotation.x = -0.05 + m.cheer * Math.sin(t * 9) * 0.12 + m.slump * 0.12;
        headG.rotation.z = Math.sin(t * 0.5 + 1) * 0.06;
        dlids.forEach(l => { if (l.userData.sd) l.rotation.z = Math.sin(t * 2 + l.userData.sd) * 0.06; else l.rotation.x = lerp(0.35, 0.65, m.slump) + (Math.sin(t * 0.9) > 0.985 ? 0.5 : 0); });
      };
      return g;
    }

    // 2) the squirrel: big fluffy tail, holding a nut, nibbles it
    function makeSquirrel() {
      const g = new T.Group(); pedestal(g, 0.9);
      const body = new T.Group(); body.position.y = 0.22; g.add(body);
      const fur = toon(0xd9773a, { roughness: 0.8 }), furL = toon(0xe99a5c, { roughness: 0.85 }), belly = toon(0xf6dcb5, { roughness: 0.85 }), dark = toon(0x5a3a22);
      [-1, 1].forEach(sd => { ball(body, fur, [0.28 * sd, 0.09, 0.28], [0.18, 0.09, 0.32]); ball(body, fur, [0.38 * sd, 0.42, 0.05], [0.24, 0.32, 0.36]); });
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, fur, [0, 0.82, 0], [0.58, 0.72, 0.52]);
      ball(trunk, belly, [0, 0.86, 0.26], [0.42, 0.58, 0.32]);
      // tail: chain of fluffy balls curling up behind
      const tail = [];
      for (let i = 0; i < 11; i++) {
        const s = i / 10, r = 0.28 + 0.3 * Math.sin(Math.PI * Math.min(1, 0.15 + s * 0.95));
        tail.push({ m: ball(body, i % 2 ? fur : furL, [0, 0, 0], r), s });
      }
      const headG = new T.Group(); headG.position.set(0, 1.62, 0.05); trunk.add(headG);
      ball(headG, fur, [0, 0.12, 0], [0.46, 0.42, 0.42]);
      [-1, 1].forEach(sd => {
        ball(headG, belly, [0.2 * sd, -0.02, 0.27], [0.2, 0.17, 0.16]);
        const eyeW = ball(headG, ink, [0.17 * sd, 0.2, 0.33], [0.1, 0.11, 0.07]); eyeW.castShadow = false;
        ball(headG, shineM, [0.17 * sd - 0.03, 0.24, 0.39], 0.025).castShadow = false;
        const ear = new T.Mesh(new T.ConeGeometry(0.11, 0.3, 12), fur); ear.position.set(0.24 * sd, 0.55, -0.02); ear.rotation.z = -0.25 * sd; ear.castShadow = true; headG.add(ear);
        const tuft = new T.Mesh(new T.ConeGeometry(0.05, 0.16, 8), dark); tuft.position.set(0.28 * sd, 0.73, -0.02); tuft.rotation.z = -0.3 * sd; headG.add(tuft);
      });
      ball(headG, belly, [0, 0.0, 0.36], [0.17, 0.12, 0.13]);
      ball(headG, dark, [0, 0.07, 0.48], [0.06, 0.045, 0.04]);
      const teeth = new T.Mesh(new T.BoxGeometry(0.08, 0.07, 0.02), whiteM); teeth.position.set(0, -0.1, 0.46); headG.add(teeth);
      const nut = new T.Group(); body.add(nut);
      ball(nut, toon(0xb06d34, { roughness: 0.4 }), [0, 0, 0], [0.12, 0.15, 0.12]);
      const cap = new T.Mesh(new T.SphereGeometry(0.135, 14, 8, 0, Math.PI * 2, 0, Math.PI / 2), toon(0x6b4423, { roughness: 0.9 })); cap.position.y = 0.04; nut.add(cap);
      const stem = limb(nut, toon(0x6b4423), 0.02); setLimb(stem, V(0, 0.15, 0), V(0.02, 0.22, 0));
      const arms = [-1, 1].map(sd => ({ sd, a: limb(body, fur, 0.085), paw: ball(body, fur, [0, 0, 0], 0.09) }));
      g.userData.update = (t, m) => {
        const hop = m.cheer * Math.abs(Math.sin(t * 8)) * 0.3;
        body.position.y = 0.22 + hop;
        trunk.scale.y = 1 + Math.sin(t * 2.2) * 0.02;
        const nib = Math.pow(Math.max(0, Math.sin(t * 0.9)), 6); // nibble every few seconds
        const nutP = V(0, lerp(1.2, 1.5, nib) + Math.sin(t * 2.2) * 0.01, lerp(0.62, 0.58, nib));
        nut.position.copy(nutP); nut.rotation.z = Math.sin(t * 14) * 0.15 * nib;
        arms.forEach(a => { const sh = V(0.33 * a.sd, 1.25, 0.28), paw = V(0.12 * a.sd, nutP.y, nutP.z - 0.04); setLimb(a.a, sh, paw); a.paw.position.copy(paw); });
        headG.rotation.x = lerp(0, 0.28, nib) + m.slump * 0.2;
        headG.rotation.z = Math.sin(t * 0.7) * 0.12;
        headG.rotation.y = Math.sin(t * 0.45 + 2) * 0.35;
        const droop = m.slump * 0.6, sway = Math.sin(t * 1.4);
        tail.forEach(({ m: b, s }) => {
          const y = 0.35 + 2.3 * Math.sin(s * Math.PI * 0.55) * (1 - droop * 0.4) + (s > 0.75 ? -(s - 0.75) * 1.2 : 0);
          const z = -0.55 - 0.55 * Math.sin(Math.PI * s * 0.7);
          const x = 0.15 + 0.75 * Math.sin(Math.PI * s * 0.6) + (s > 0.7 ? (s - 0.7) * 1.3 : 0);
          b.position.set(x + Math.sin(t * 1.4 - s * 2.2) * 0.12 * s + sway * 0.02, y, z);
        });
      };
      return g;
    }

    // 3) the sleepy frog: droopy eyes, big lips, blue shirt
    function makeFrog() {
      const g = new T.Group(); pedestal(g, 0.95);
      const body = new T.Group(); body.position.y = 0.22; g.add(body);
      const green = toon(0x5fae4e, { roughness: 0.55 }), greenD = toon(0x4a9640, { roughness: 0.6 }), shirt = toon(0x3f6fb5, { roughness: 0.85 }), lip = toon(0x9a4636, { roughness: 0.7, envMapIntensity: 0.3 });
      [-1, 1].forEach(sd => { ball(body, green, [0.3 * sd, 0.07, 0.18], [0.26, 0.07, 0.38]); const leg = limb(body, toon(0x2f3e5c, { roughness: 0.85 }), 0.17); setLimb(leg, V(0.27 * sd, 0.12, 0.05), V(0.25 * sd, 0.85, 0)); });
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, shirt, [0, 1.25, 0], [0.6, 0.62, 0.48]);
      const arms = [-1, 1].map(sd => ({ sd, up: limb(body, shirt, 0.13), lo: limb(body, green, 0.1), hand: ball(body, green, [0, 0, 0], [0.13, 0.11, 0.13]) }));
      const headG = new T.Group(); headG.position.set(0, 1.78, 0.05); trunk.add(headG);
      ball(headG, green, [0, 0.32, 0], [0.68, 0.48, 0.55]);
      ball(headG, toon(0xcfe3a0, { roughness: 0.6 }), [0, 0.12, 0.25], [0.52, 0.2, 0.35]); // pale chin
      const flids = [];
      [-1, 1].forEach(sd => {
        ball(headG, greenD, [0.29 * sd, 0.66, 0.12], 0.29);
        ball(headG, whiteM, [0.29 * sd, 0.68, 0.2], 0.255).castShadow = false;
        ball(headG, ink, [0.29 * sd + 0.04 * sd, 0.64, 0.42], [0.09, 0.09, 0.05]).castShadow = false;
        ball(headG, shineM, [0.29 * sd + 0.01 * sd, 0.68, 0.46], 0.02).castShadow = false;
        const l = lidFor(headG, green, 0.27, [0.29 * sd, 0.68, 0.2]); l.rotation.x = 0.35; flids.push(l);
        const lo = new T.Mesh(new T.SphereGeometry(0.265, 16, 8, 0, Math.PI * 2, Math.PI * 0.62, Math.PI * 0.38), green); lo.position.set(0.29 * sd, 0.68, 0.2); headG.add(lo);
      });
      const upperLip = ball(headG, lip, [0, 0.19, 0.5], [0.44, 0.095, 0.16]);
      const lowerLip = ball(headG, lip, [0, 0.07, 0.46], [0.36, 0.08, 0.14]);
      const mouthLine = new T.Mesh(new T.TorusGeometry(0.42, 0.012, 6, 30, Math.PI * 0.5), ink); mouthLine.position.set(0, 0.52, 0.55); mouthLine.rotation.z = Math.PI * 1.25; mouthLine.scale.set(1, 0.92, 1); headG.add(mouthLine);
      g.userData.update = (t, m) => {
        const breath = Math.sin(t * 1.3) * 0.5 + 0.5;
        trunk.scale.set(1 + breath * 0.025, 1 + breath * 0.015, 1 + breath * 0.025);
        body.rotation.z = Math.sin(t * 0.5 + 2) * 0.03;
        body.position.y = 0.22 + m.cheer * Math.abs(Math.sin(t * 7)) * 0.1;
        headG.rotation.y = Math.sin(t * 0.3 + 4) * 0.4;
        headG.rotation.x = 0.04 + m.slump * 0.18 - m.cheer * 0.1;
        const blink = Math.sin(t * 0.7 + 1) > 0.99 ? 0.5 : 0;
        flids.forEach(l => { l.rotation.x = clamp(lerp(0.35, 0.75, m.slump) - m.cheer * 0.35 + blink, -0.2, 1.2); });
        upperLip.position.y = 0.19 + Math.sin(t * 0.8) * 0.006; lowerLip.scale.y = 0.08 + m.slump * 0.02;
        arms.forEach(a => {
          const sh = V(0.55 * a.sd, 1.6, 0.02);
          const up = m.cheer;
          const el = V(lerp(0.72, 0.8, up) * a.sd, lerp(1.15, 1.95, up), lerp(0.12, 0.05, up));
          const hand = V(lerp(0.55, 0.85, up) * a.sd, lerp(0.85 + Math.sin(t * 1.3 + a.sd) * 0.03, 2.5, up), lerp(0.28, 0.1, up));
          setLimb(a.up, sh, el); setLimb(a.lo, el, hand); a.hand.position.copy(hand);
        });
      };
      return g;
    }


    /* ---------- side figures (original toy homages, built from primitives, shared materials) ---------- */
    // 4/5) shiba-type dogs: one smug side-eye, one in a pink knitted beanie
    function makeShiba(hat) {
      const g = new T.Group(), H = 0.22; pedestal(g, 0.78, H);
      const body = new T.Group(); body.position.y = H; g.add(body);
      const fur = M(hat ? 0xe0a86c : 0xd98f45), cream = M(0xf8ecd6, 0.75), furD = M(0xb06f30);
      const trunk = new T.Group(); body.add(trunk);
      [-1, 1].forEach(sd => {
        ball(body, fur, [0.3 * sd, 0.3, -0.12], [0.28, 0.3, 0.38]);
        ball(body, cream, [0.3 * sd, 0.06, 0.18], [0.13, 0.07, 0.2]);
        const leg = limb(body, fur, 0.095); setLimb(leg, V(0.17 * sd, 0.9, 0.18), V(0.18 * sd, 0.06, 0.34));
        ball(body, cream, [0.18 * sd, 0.06, 0.38], [0.11, 0.07, 0.14]);
      });
      ball(trunk, fur, [0, 0.72, 0], [0.46, 0.6, 0.4]);
      ball(trunk, cream, [0, 0.74, 0.2], [0.3, 0.48, 0.24]);
      const tail = new T.Group(); tail.position.set(0, 0.55, -0.42); body.add(tail);
      const tl = new T.Mesh(new T.TorusGeometry(0.17, 0.085, 8, 16, Math.PI * 1.6), fur); tl.castShadow = true; tl.rotation.y = Math.PI / 2; tail.add(tl);
      const headG = new T.Group(); headG.position.set(0, 1.42, 0.08); trunk.add(headG);
      ball(headG, fur, [0, 0, 0], [0.5, 0.44, 0.44]);
      ball(headG, cream, [0, -0.12, 0.2], [0.4, 0.24, 0.3]);
      ball(headG, cream, [0, -0.08, 0.38], [0.2, 0.14, 0.18]);
      ball(headG, ink, [0, -0.01, 0.55], [0.07, 0.05, 0.05]);
      const smileM = new T.Mesh(new T.TorusGeometry(0.09, 0.016, 6, 14, Math.PI), ink); smileM.position.set(0, -0.12, 0.5); smileM.rotation.z = Math.PI; headG.add(smileM);
      const ears = [], pupils = [], lidsS = [];
      [-1, 1].forEach(sd => {
        if (!hat) {
          const ear = new T.Group(); ear.position.set(0.26 * sd, 0.32, -0.02); ear.rotation.z = -0.3 * sd; headG.add(ear); ears.push(ear);
          cone(ear, fur, [0, 0.14, 0], 0.15, 0.32); cone(ear, cream, [0, 0.12, 0.05], 0.09, 0.22);
        }
        const ep = [0.17 * sd, 0.1, 0.37];
        ball(headG, hat ? ink : whiteM, ep, hat ? 0.07 : [0.085, 0.07, 0.05]).castShadow = false;
        if (hat) ball(headG, shineM, [ep[0] - 0.02, ep[1] + 0.03, ep[2] + 0.06], 0.02).castShadow = false;
        else { const pu = ball(headG, ink, [ep[0] + 0.045, ep[1], ep[2] + 0.04], 0.04); pu.castShadow = false; pupils.push(pu); }
        const l = lidFor(headG, fur, hat ? 0.078 : 0.09, ep); l.rotation.x = hat ? -1.45 : -0.1; lidsS.push(l);
        ball(headG, cream, [0.16 * sd, 0.24, 0.35], [0.05, 0.03, 0.03]); // brow dots
      });
      if (hat) { // knitted beanie: dome + ribbed band, slightly tilted
        const beanie = new T.Group(); beanie.position.set(0, 0.12, -0.03); beanie.rotation.z = 0.08; headG.add(beanie);
        const pinkK = M(0xf38db8, 0.95), pinkD = M(0xe0709f, 0.95);
        const dome = new T.Mesh(LID, pinkK); dome.scale.set(0.5, 0.46, 0.48); dome.castShadow = true; beanie.add(dome);
        const band = new T.Mesh(new T.TorusGeometry(0.47, 0.075, 8, 28), pinkD); band.rotation.x = Math.PI / 2; band.scale.set(1.03, 0.99, 1); beanie.add(band);
        for (let i = 0; i < 9; i++) { const a = Math.PI * (0.15 + i * 0.0875); const rib = limb(beanie, pinkD, 0.018); setLimb(rib, V(Math.cos(a) * 0.47, 0.04, Math.sin(a) * 0.45), V(Math.cos(a) * 0.12, 0.44, Math.sin(a) * 0.12)); }
      }
      g.userData.update = (t, m) => {
        const breath = Math.sin(t * 1.5 + (hat ? 1 : 0)) * 0.5 + 0.5;
        trunk.scale.set(1 + breath * 0.02, 1 + breath * 0.025, 1 + breath * 0.02);
        body.position.y = H + m.cheer * Math.abs(Math.sin(t * 8 + (hat ? 1 : 0))) * 0.22;
        body.rotation.z = Math.sin(t * 0.55 + (hat ? 2 : 0)) * 0.03;
        tail.rotation.z = Math.sin(t * (2 + m.cheer * 14)) * (0.15 + m.cheer * 0.35) - m.slump * 0.4;
        headG.rotation.x = m.slump * 0.25 - m.cheer * 0.12;
        if (hat) { headG.rotation.y = Math.sin(t * 0.4 + 1) * 0.35; headG.rotation.z = Math.sin(t * 0.7) * 0.06; }
        else { // side-eye: head tilted, eyes glance sideways, now and then a slow look over
          headG.rotation.z = 0.16 + Math.sin(t * 0.6) * 0.04; headG.rotation.y = -0.15 + Math.sin(t * 0.23) * 0.3;
          const glance = Math.sin(t * 0.5) > 0 ? 0.045 : -0.035; pupils.forEach(p => { p.position.x = lerp(p.position.x, (p.position.x > 0 ? 0.17 : -0.17) + glance, 0.1); });
          ears.forEach((e, i) => { e.rotation.x = -m.slump * 0.5 + Math.sin(t * 3 + i) * 0.03; });
        }
        const blink = Math.sin(t * 0.8 + (hat ? 2 : 0)) > 0.985 ? 1 : 0;
        lidsS.forEach(l => { l.rotation.x = blink ? 0.85 : lerp(hat ? -1.45 : -0.1, 0.45, m.slump); });
      };
      return g;
    }
    // 6) grey cat with a popping open mouth
    function makeCat() {
      const g = new T.Group(), H = 0.75; pedestal(g, 0.72, H);
      const body = new T.Group(); body.position.y = H; g.add(body);
      const grey = M(0x9aa1ab, 0.85), white = M(0xf4f1ec, 0.85), pinkC = M(0xff9cb8, 0.6), mouthM = M(0x3a1622, 0.5);
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, grey, [0, 0.6, 0], [0.44, 0.56, 0.38]); ball(trunk, white, [0, 0.58, 0.2], [0.28, 0.42, 0.22]);
      [-1, 1].forEach(sd => { ball(body, grey, [0.28 * sd, 0.24, -0.08], [0.24, 0.26, 0.34]); ball(body, white, [0.16 * sd, 0.06, 0.34], [0.11, 0.07, 0.15]); const lg = limb(body, grey, 0.08); setLimb(lg, V(0.16 * sd, 0.8, 0.14), V(0.16 * sd, 0.06, 0.3)); });
      const tail = []; for (let i = 0; i < 8; i++) tail.push(ball(body, i > 5 ? white : grey, [0, 0, 0], 0.075));
      const headG = new T.Group(); headG.position.set(0, 1.28, 0.06); trunk.add(headG);
      ball(headG, grey, [0, 0, 0], [0.52, 0.42, 0.44]);
      ball(headG, white, [0, -0.1, 0.3], [0.27, 0.18, 0.16]);
      ball(headG, pinkC, [0, -0.02, 0.45], [0.05, 0.035, 0.03]);
      const catLids = [];
      [-1, 1].forEach(sd => {
        cone(headG, grey, [0.29 * sd, 0.36, -0.02], 0.15, 0.3, [0, 0, -0.35 * sd]); cone(headG, pinkC, [0.28 * sd, 0.34, 0.04], 0.08, 0.2, [0, 0, -0.35 * sd]);
        const ep = [0.19 * sd, 0.08, 0.36];
        ball(headG, ink, ep, [0.09, 0.1, 0.05]).castShadow = false; ball(headG, shineM, [ep[0] - 0.025, 0.13, 0.41], 0.025).castShadow = false;
        const l = lidFor(headG, grey, 0.1, ep); l.rotation.x = -1.45; catLids.push(l);
        for (let w = -1; w <= 1; w++) { const wh = limb(headG, white, 0.008); setLimb(wh, V(0.16 * sd, -0.1 + w * 0.03, 0.4), V(0.48 * sd, -0.05 + w * 0.07, 0.34)); }
      });
      const mouth = new T.Group(); mouth.position.set(0, -0.2, 0.42); headG.add(mouth);
      const hole = ball(mouth, mouthM, [0, 0, 0], [0.1, 0.1, 0.06]); hole.castShadow = false;
      const tongue = ball(mouth, pinkC, [0, -0.04, 0.02], [0.06, 0.035, 0.04]); tongue.castShadow = false;
      let open = 0;
      g.userData.update = (t, m) => {
        const breath = Math.sin(t * 1.7 + 3) * 0.5 + 0.5;
        trunk.scale.set(1 + breath * 0.02, 1 + breath * 0.025, 1 + breath * 0.02);
        body.position.y = H + m.cheer * Math.abs(Math.sin(t * 9)) * 0.15;
        const pop = Math.sin(t * (1.6 + m.cheer * 6)) > 0.55 && m.slump < 0.5;
        open = lerp(open, pop ? 1 : 0.08, 0.35);
        mouth.scale.set(1 + open * 0.3, 0.12 + open * 1.1, 1); tongue.visible = open > 0.4;
        headG.rotation.x = -open * 0.12 + m.slump * 0.25; headG.rotation.y = Math.sin(t * 0.33 + 1) * 0.3; headG.rotation.z = Math.sin(t * 0.8) * 0.05;
        const blink = Math.sin(t * 0.9 + 1.3) > 0.985 ? 1 : 0; catLids.forEach(l => { l.rotation.x = blink ? 0.85 : lerp(-1.45, 0.3, m.slump); });
        tail.forEach((b, i) => { const s = i / 7; b.position.set(-0.3 - Math.sin(s * 1.6) * 0.25 + Math.sin(t * 1.8 - i * 0.6) * 0.06 * s, 0.1 + s * 0.85 * (1 - m.slump * 0.6), -0.35 - Math.cos(s * 1.6) * 0.1); });
      };
      return g;
    }
    // 7) chubby little penguin with a mint scarf
    function makePenguin() {
      const g = new T.Group(), H = 0.75; pedestal(g, 0.72, H);
      const body = new T.Group(); body.position.y = H; g.add(body);
      const navy = M(0x6f8fb3, 0.6), white = M(0xf7f7f2, 0.7), orange = M(0xffa63d, 0.5), scarf = M(0x7fe3cf, 0.9), blushM = M(0xff9cb8, 0.7);
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, navy, [0, 0.78, 0], [0.6, 0.76, 0.55]); ball(trunk, white, [0, 0.7, 0.2], [0.47, 0.6, 0.4]);
      [-1, 1].forEach(sd => ball(body, orange, [0.2 * sd, 0.05, 0.3], [0.17, 0.06, 0.23]));
      const eyes = [];
      [-1, 1].forEach(sd => {
        const e = ball(trunk, ink, [0.17 * sd, 1.18, 0.46], [0.075, 0.085, 0.05]); e.castShadow = false; eyes.push(e);
        ball(trunk, shineM, [0.17 * sd - 0.02, 1.22, 0.5], 0.02).castShadow = false;
        ball(trunk, blushM, [0.3 * sd, 1.06, 0.42], [0.07, 0.04, 0.03]).castShadow = false;
      });
      cone(trunk, orange, [0, 1.07, 0.6], 0.08, 0.16, [Math.PI / 2, 0, 0]);
      const sc = new T.Mesh(new T.TorusGeometry(0.47, 0.08, 8, 26), scarf); sc.rotation.x = Math.PI / 2; sc.position.y = 0.95; sc.scale.set(1, 0.92, 1); trunk.add(sc);
      const tailEnd = ball(trunk, scarf, [0.25, 0.75, 0.45], [0.08, 0.2, 0.05], [0, 0, 0.2]);
      const flips = [-1, 1].map(sd => { const p = new T.Group(); p.position.set(0.56 * sd, 0.95, 0); trunk.add(p); ball(p, navy, [0.05 * sd, -0.3, 0], [0.1, 0.36, 0.2]); p.userData.sd = sd; return p; });
      g.userData.update = (t, m) => {
        const breath = Math.sin(t * 1.8 + 5) * 0.5 + 0.5;
        trunk.scale.set(1 + breath * 0.025, 1 + breath * 0.015, 1 + breath * 0.025);
        body.rotation.z = Math.sin(t * 2.2) * 0.06 * (0.5 + m.cheer); // waddle
        body.rotation.x = m.slump * 0.15;
        body.position.y = H + m.cheer * Math.abs(Math.sin(t * 10)) * 0.2;
        flips.forEach(f => { f.rotation.z = f.userData.sd * (0.15 + m.cheer * (0.9 + Math.sin(t * 18) * 0.4) - m.slump * 0.1); });
        body.rotation.y = Math.sin(t * 0.4 + 2) * 0.3;
        tailEnd.rotation.z = 0.2 + Math.sin(t * 2.2) * 0.1;
        const blink = Math.sin(t * 0.75 + 0.4) > 0.985; eyes.forEach(e => { e.scale.y = blink ? 0.015 : lerp(0.085, 0.045, m.slump); });
      };
      return g;
    }
    // 8) chubby ape in sunglasses, vibing
    function makeApe() {
      const g = new T.Group(), H = 0.22; pedestal(g, 0.85, H);
      const body = new T.Group(); body.position.y = H; g.add(body);
      const brown = M(0x6b4a33, 0.9), face = M(0xdcb690, 0.7), shades = M(0x111118, 0.12), shadeF = M(0xffd23f, 0.35);
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, brown, [0, 0.75, 0], [0.62, 0.68, 0.52]); ball(trunk, face, [0, 0.68, 0.28], [0.44, 0.48, 0.3]);
      [-1, 1].forEach(sd => { ball(body, brown, [0.36 * sd, 0.22, 0.22], [0.25, 0.2, 0.34]); ball(body, face, [0.38 * sd, 0.1, 0.5], [0.14, 0.08, 0.13]); });
      const arms = [-1, 1].map(sd => ({ sd, up: limb(body, brown, 0.12), lo: limb(body, brown, 0.11), hand: ball(body, face, [0, 0, 0], 0.13) }));
      const headG = new T.Group(); headG.position.set(0, 1.58, 0.04); trunk.add(headG);
      ball(headG, brown, [0, 0, 0], [0.5, 0.47, 0.46]);
      ball(headG, face, [0, -0.04, 0.24], [0.38, 0.34, 0.26]); ball(headG, face, [0, -0.19, 0.36], [0.27, 0.17, 0.18]);
      [-1, 1].forEach(sd => { ball(headG, ink, [0.05 * sd, -0.13, 0.52], 0.022).castShadow = false; ball(headG, brown, [0.48 * sd, 0.02, 0], [0.14, 0.16, 0.08]); ball(headG, face, [0.5 * sd, 0.02, 0.03], [0.08, 0.1, 0.05]); });
      const mouthA = limb(headG, ink, 0.012); setLimb(mouthA, V(-0.11, -0.25, 0.5), V(0.11, -0.24, 0.5));
      ball(headG, brown, [0, 0.36, 0.1], [0.18, 0.1, 0.16], [0.3, 0, 0]); // tuft
      const glasses = new T.Group(); glasses.position.set(0, 0.09, 0.44); headG.add(glasses);
      [-1, 1].forEach(sd => { ball(glasses, shades, [0.15 * sd, 0, 0], [0.15, 0.1, 0.05]).castShadow = false; ball(glasses, shineM, [0.15 * sd - 0.05, 0.04, 0.045], [0.03, 0.015, 0.01]).castShadow = false;
        const arm = limb(glasses, shadeF, 0.015); setLimb(arm, V(0.27 * sd, 0.02, -0.02), V(0.44 * sd, 0.02, -0.3)); });
      const bridge = limb(glasses, shadeF, 0.016); setLimb(bridge, V(-0.06, 0.03, 0.02), V(0.06, 0.03, 0.02));
      g.userData.update = (t, m) => {
        const breath = Math.sin(t * 1.2 + 1) * 0.5 + 0.5;
        trunk.scale.set(1 + breath * 0.03, 1 + breath * 0.02, 1 + breath * 0.03);
        const vibe = Math.sin(t * 4.2);
        headG.position.y = 1.58 + Math.abs(vibe) * 0.03; headG.rotation.z = vibe * 0.06; headG.rotation.y = Math.sin(t * 0.3 + 3) * 0.35;
        headG.rotation.x = m.slump * 0.25 - m.cheer * 0.1; glasses.position.y = 0.09 - m.slump * 0.04;
        body.position.y = H + m.cheer * Math.abs(Math.sin(t * 7)) * 0.12;
        arms.forEach(a => {
          const up = m.cheer, sh = V(0.56 * a.sd, 1.18, 0.02);
          const el = V(lerp(0.66, 0.8, up) * a.sd, lerp(0.8, 1.7, up), lerp(0.3, 0.05, up));
          const hand = V(lerp(0.22, 0.85, up) * a.sd, lerp(0.72 + Math.sin(t * 4.2 + a.sd) * 0.02, 2.3, up), lerp(0.5, 0.15, up));
          setLimb(a.up, sh, el); setLimb(a.lo, el, hand); a.hand.position.copy(hand);
        });
      };
      return g;
    }

    /* ---------- the crowd: more meme-legend homages (original toys; smaller, low-poly, baked) ---------- */
    function stand(r, H) { const g = new T.Group(); pedestal(g, r, H); const body = new T.Group(); body.position.y = H; g.add(body); return [g, body]; }
    const bounce = (t, m, f) => m.cheer * Math.abs(Math.sin(t * f)) ;
    function eyes(parent, mat, sp, y, z, s, lidMat) { // simple round eyes with shine (+ optional blink lids)
      const lids = [];
      [-1, 1].forEach(sd => { ball(parent, mat || ink, [sp * sd, y, z], s).castShadow = false; ball(parent, shineM, [sp * sd - s[0] * 0.3, y + s[1] * 0.35, z + s[2] * 0.9], s[0] * 0.3).castShadow = false;
        if (lidMat) { const l = lidFor(parent, lidMat, s[0] * 1.15, [sp * sd, y, z - s[2] * 0.2]); l.rotation.x = -1.5; lids.push(l); } });
      return lids;
    }
    const blinkAt = (t, k) => Math.sin(t * 0.8 + k) > 0.985;
    // little green cloud puff with a happy face
    function makePuff() {
      const [g, body] = stand(0.6, 0.22), c1 = M(0xa6e59a, 0.8), c2 = M(0x8fd682, 0.8), cloud = new T.Group(); body.add(cloud);
      [[0, 0.75, 0, 0.5], [-0.42, 0.62, 0, 0.36], [0.42, 0.6, 0.02, 0.38], [-0.2, 1.05, -0.05, 0.36], [0.25, 1.02, -0.05, 0.34], [0, 0.55, 0.15, 0.36]].forEach(([x, y, z, r], i) => ball(cloud, i % 2 ? c2 : c1, [x, y, z], r));
      eyes(cloud, ink, 0.15, 0.82, 0.44, [0.06, 0.075, 0.04]);
      ball(cloud, M(0xff9cb8, 0.7), [-0.3, 0.68, 0.4], [0.07, 0.04, 0.03]); ball(cloud, M(0xff9cb8, 0.7), [0.3, 0.68, 0.4], [0.07, 0.04, 0.03]);
      const sm = new T.Mesh(new T.TorusGeometry(0.07, 0.016, 5, 10, Math.PI), ink); sm.rotation.z = Math.PI; sm.position.set(0, 0.68, 0.48); cloud.add(sm);
      const puffs = [0, 1, 2].map(i => ball(body, c1, [0, 0, 0], 0.08));
      g.userData.update = (t, m) => {
        cloud.position.y = -0.08 + Math.sin(t * 1.6) * 0.06 + bounce(t, m, 7) * 0.25 - m.slump * 0.12;
        cloud.scale.set(1 + Math.sin(t * 3.2) * 0.03, 1 - Math.sin(t * 3.2) * 0.03 - m.slump * 0.1, 1);
        cloud.rotation.z = Math.sin(t * 0.9) * 0.08;
        puffs.forEach((p, i) => { const k = (t * 0.5 + i / 3) % 1; p.position.set(-0.55 - k * 0.4, 0.5 + k * 0.9, -0.1); p.scale.setScalar(0.12 * (1 - k)); });
      };
      return g;
    }
    // round baby pygmy hippo, glossy and bouncy
    function makeHippo() {
      const [g, body] = stand(0.7, 0.22), skin = M(0x6f6876, 0.3), pinkS = M(0xd89aa0, 0.35), mouthM = M(0x8a3a4a, 0.5);
      ball(body, skin, [0, 0.5, -0.05], [0.55, 0.45, 0.62]); ball(body, pinkS, [0, 0.35, 0.1], [0.42, 0.28, 0.5]);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => ball(body, skin, [0.3 * sx, 0.12, 0.3 * sz], [0.14, 0.14, 0.14]));
      const head = new T.Group(); head.position.set(0, 0.72, 0.5); body.add(head);
      ball(head, skin, [0, 0.12, 0], [0.38, 0.33, 0.33]); ball(head, pinkS, [0, -0.04, 0.22], [0.36, 0.22, 0.24]);
      [-1, 1].forEach(sd => { ball(head, skin, [0.27 * sd, 0.4, -0.08], [0.08, 0.1, 0.05]); ball(head, ink, [0.1 * sd, 0.04, 0.45], 0.025).castShadow = false; ball(head, M(0xff8fae, 0.6), [0.28 * sd, 0.0, 0.25], [0.07, 0.04, 0.03]).castShadow = false; });
      const lids = eyes(head, ink, 0.16, 0.24, 0.27, [0.055, 0.06, 0.04], skin);
      const jaw = new T.Group(); jaw.position.set(0, -0.14, 0.18); head.add(jaw);
      ball(jaw, mouthM, [0, 0, 0.12], [0.24, 0.08, 0.12]).castShadow = false; ball(jaw, pinkS, [0, -0.06, 0.1], [0.3, 0.1, 0.18]);
      g.userData.update = (t, m) => {
        const hop = (Math.max(0, Math.sin(t * 2.4)) * 0.08 + bounce(t, m, 9) * 0.3) * (1 - m.slump);
        body.position.y = 0.22 + hop; body.scale.y = 1 - hop * 0.3; body.rotation.z = Math.sin(t * 1.2) * 0.05;
        head.rotation.y = Math.sin(t * 0.7) * 0.4 + Math.sin(t * 7) * 0.08 * m.cheer; head.rotation.x = m.slump * 0.3;
        jaw.rotation.x = 0.1 + (Math.sin(t * 1.3) > 0.6 ? 0.35 : 0) + m.cheer * 0.3;
        lids.forEach(l => { l.rotation.x = blinkAt(t, 2) ? 0.9 : lerp(-1.5, 0.2, m.slump); });
      };
      return g;
    }
    // open book with a face across the pages
    function makeBook() {
      const [g, body] = stand(0.65, 0.22), cover = M(0x2a8f7f, 0.5), paper = M(0xfff6e4, 0.8), lineM = M(0xd9c7a5, 0.8);
      const book = new T.Group(); book.position.set(0, 0.85, 0); book.rotation.x = -0.25; body.add(book);
      const pages = [-1, 1].map(sd => {
        const pg = new T.Group(); pg.rotation.y = -sd * 0.35; book.add(pg);
        const cv = new T.Mesh(new T.BoxGeometry(0.62, 0.86, 0.05), cover); cv.position.set(0.33 * sd, 0, -0.03); cv.castShadow = true; pg.add(cv);
        const pp = new T.Mesh(new T.BoxGeometry(0.56, 0.8, 0.07), paper); pp.position.set(0.31 * sd, 0, 0.03); pp.castShadow = true; pg.add(pp);
        for (let i = 0; i < 4; i++) { const ln = new T.Mesh(new T.BoxGeometry(0.36, 0.025, 0.01), lineM); ln.position.set(0.31 * sd, -0.12 - i * 0.07, 0.07); pg.add(ln); }
        ball(pg, ink, [0.3 * sd, 0.15, 0.08], [0.07, 0.09, 0.03]).castShadow = false; ball(pg, shineM, [0.3 * sd - 0.02, 0.18, 0.1], 0.02).castShadow = false;
        ball(pg, M(0xff9cb8, 0.7), [0.42 * sd, 0.0, 0.075], [0.06, 0.035, 0.01]).castShadow = false;
        return pg;
      });
      const sm = new T.Mesh(new T.TorusGeometry(0.1, 0.022, 5, 12, Math.PI), ink); sm.rotation.z = Math.PI; sm.position.set(0, 0.02, 0.12); book.add(sm);
      const easel = limb(body, M(0xd9c7a5, 0.6), 0.05); setLimb(easel, V(0, 0, -0.1), V(0, 0.6, -0.15));
      g.userData.update = (t, m) => {
        const flap = Math.sin(t * (1.5 + m.cheer * 10)) * (0.06 + m.cheer * 0.25);
        pages.forEach((pg, i) => { pg.rotation.y = -(i ? 1 : -1) * (0.35 + flap - m.slump * 0.2); });
        book.position.y = 0.85 + Math.sin(t * 1.4) * 0.04 + bounce(t, m, 7) * 0.2; book.rotation.x = -0.25 + m.slump * 0.3;
      };
      return g;
    }
    // shiba-ish puppy: helmet (viking style) or a bat (bonk style)
    function makePup(kind) {
      const helmet = kind === "helmet", [g, body] = stand(helmet ? 0.6 : 0.75, 0.22);
      const fur = M(helmet ? 0xe39a50 : 0xf2b04a, 0.75), cream = M(0xfbefd9, 0.8);
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, fur, [0, 0.55, 0], [0.38, 0.45, 0.34]); ball(trunk, cream, [0, 0.55, 0.16], [0.25, 0.36, 0.22]);
      [-1, 1].forEach(sd => { ball(body, fur, [0.24 * sd, 0.2, -0.05], [0.2, 0.2, 0.28]); ball(body, cream, [0.15 * sd, 0.06, 0.3], [0.1, 0.06, 0.13]); });
      const tail = new T.Mesh(new T.TorusGeometry(0.13, 0.065, 6, 12, Math.PI * 1.6), fur); tail.position.set(0, 0.45, -0.34); tail.rotation.y = Math.PI / 2; body.add(tail);
      const head = new T.Group(); head.position.set(0, 1.12, 0.06); trunk.add(head);
      ball(head, fur, [0, 0, 0], [0.46, 0.4, 0.4]); ball(head, cream, [0, -0.12, 0.2], [0.34, 0.2, 0.26]); ball(head, ink, [0, -0.02, 0.48], [0.06, 0.045, 0.045]);
      const lids = eyes(head, ink, 0.15, 0.08, 0.33, [0.06, 0.065, 0.04], fur);
      [-1, 1].forEach(sd => { if (!helmet) { cone(head, fur, [0.24 * sd, 0.38, -0.02], 0.13, 0.28, [0, 0, -0.3 * sd]); cone(head, cream, [0.23 * sd, 0.36, 0.03], 0.07, 0.18, [0, 0, -0.3 * sd]); } });
      if (helmet) {
        const metal = M(0xc5ced6, 0.3), brass = M(0xe0b04a, 0.35), hornM = M(0xfff1da, 0.5);
        const hm = new T.Mesh(LID, metal); hm.scale.set(0.47, 0.4, 0.44); hm.position.y = 0.08; head.add(hm);
        const band = new T.Mesh(new T.TorusGeometry(0.46, 0.05, 6, 22), brass); band.rotation.x = Math.PI / 2; band.position.y = 0.1; head.add(band);
        [-1, 1].forEach(sd => cone(head, hornM, [0.5 * sd, 0.33, 0], 0.08, 0.36, [0, 0, -0.9 * sd]));
        ball(head, brass, [0, 0.47, 0.05], 0.05);
      } else { // big grin + tongue
        ball(head, M(0x5a2430, 0.5), [0, -0.2, 0.36], [0.16, 0.07, 0.08]).castShadow = false; ball(head, M(0xff8fae, 0.5), [0, -0.24, 0.38], [0.08, 0.04, 0.05]).castShadow = false;
      }
      if (helmet) { const sm = new T.Mesh(new T.TorusGeometry(0.07, 0.014, 5, 10, Math.PI), ink); sm.rotation.z = Math.PI; sm.position.set(0, -0.13, 0.45); head.add(sm); }
      let arm = null, bat = null;
      if (!helmet) { // bat over the shoulder, swings on buys
        arm = new T.Group(); arm.position.set(0.32, 0.8, 0.12); trunk.add(arm);
        const a = limb(arm, fur, 0.08); setLimb(a, V(0, 0, 0), V(0.05, -0.05, 0.3)); ball(arm, cream, [0.05, -0.05, 0.32], 0.09);
        bat = new T.Mesh(new T.CylinderGeometry(0.09, 0.04, 1.1, 10), M(0xc98a52, 0.6)); bat.position.set(0.05, 0.4, 0.3); bat.rotation.z = -0.3; bat.castShadow = true; arm.add(bat);
      }
      g.userData.update = (t, m) => {
        const s = helmet ? 0 : 1.7;
        trunk.scale.y = 1 + Math.sin(t * 1.9 + s) * 0.025;
        body.position.y = 0.22 + bounce(t, m, 8 + s) * 0.25;
        head.rotation.y = Math.sin(t * 0.5 + s) * 0.35; head.rotation.z = Math.sin(t * 0.8 + s) * 0.08; head.rotation.x = m.slump * 0.3;
        tail.rotation.z = Math.sin(t * (3 + m.cheer * 12)) * 0.3;
        lids.forEach(l => { l.rotation.x = blinkAt(t, s) ? 0.9 : lerp(-1.5, 0.25, m.slump); });
        if (arm) arm.rotation.x = -0.2 - Math.max(0, Math.sin(t * 9)) * 1.3 * m.cheer + m.slump * 0.4;
      };
      return g;
    }
    // a wholesome goat
    function makeGoat() {
      const [g, body] = stand(0.75, 0.22), wool = M(0xf3f0ea, 0.9), hoof = M(0x5a4a3a, 0.6), hornM = M(0xc9b48f, 0.5), pinkG = M(0xffb3c0, 0.7);
      ball(body, wool, [0, 0.82, -0.05], [0.42, 0.4, 0.58]);
      [[-1, 1], [1, 1], [-1, -1], [1, -1]].forEach(([sx, sz]) => { const l = limb(body, wool, 0.07); setLimb(l, V(0.2 * sx, 0.6, 0.32 * sz - 0.05), V(0.2 * sx, 0.06, 0.32 * sz - 0.05)); ball(body, hoof, [0.2 * sx, 0.05, 0.32 * sz - 0.05], [0.08, 0.05, 0.09]); });
      const tl = ball(body, wool, [0, 1.0, -0.6], [0.08, 0.12, 0.06]);
      const head = new T.Group(); head.position.set(0, 1.32, 0.42); body.add(head);
      ball(head, wool, [0, 0, 0], [0.26, 0.28, 0.26]); ball(head, wool, [0, -0.12, 0.22], [0.17, 0.15, 0.2]); ball(head, pinkG, [0, -0.1, 0.4], [0.06, 0.04, 0.03]).castShadow = false;
      const beard = cone(head, M(0xe6e1d6, 0.9), [0, -0.33, 0.25], 0.07, 0.22, [Math.PI, 0, 0]);
      [-1, 1].forEach(sd => {
        ball(head, wool, [0.3 * sd, 0.06, -0.02], [0.17, 0.06, 0.08], [0, 0, 0.3 * sd]);
        ball(head, M(0xffe08a, 0.4), [0.14 * sd, 0.08, 0.2], [0.055, 0.055, 0.03]).castShadow = false;
        const pu = new T.Mesh(new T.BoxGeometry(0.06, 0.02, 0.01), ink); pu.position.set(0.14 * sd, 0.08, 0.235); head.add(pu); // sideways pupils
        const horn = new T.Mesh(new T.TorusGeometry(0.16, 0.04, 6, 12, Math.PI * 1.1), hornM); horn.position.set(0.1 * sd, 0.24, -0.08); horn.rotation.set(0, Math.PI / 2, 0.4 * sd); horn.castShadow = true; head.add(horn);
      });
      g.userData.update = (t, m) => {
        body.position.y = 0.22 + bounce(t, m, 6) * 0.35;
        head.rotation.y = Math.sin(t * 0.45 + 1) * 0.45; head.rotation.x = m.slump * 0.35 + Math.sin(t * 6) * 0.03; // chewing nod
        beard.rotation.z = Math.sin(t * 6) * 0.08; tl.rotation.z = Math.sin(t * 8) * 0.4;
        body.rotation.x = -bounce(t, m, 6) * 0.15;
      };
      return g;
    }
    // cream cat in pixel sunglasses
    function makeShadesCat() {
      const [g, body] = stand(0.68, 0.22), fur = M(0xf0e2cc, 0.85), furD = M(0xd8bf9c, 0.85), pinkC = M(0xff9cb8, 0.6), pix = M(0x101014, 0.25);
      ball(body, fur, [0, 0.55, 0], [0.4, 0.5, 0.36]); [-1, 1].forEach(sd => { ball(body, fur, [0.25 * sd, 0.2, -0.05], [0.2, 0.22, 0.3]); ball(body, furD, [0.14 * sd, 0.06, 0.28], [0.1, 0.06, 0.13]); });
      const tail = []; for (let i = 0; i < 6; i++) tail.push(ball(body, i % 2 ? furD : fur, [0, 0, 0], 0.07));
      const head = new T.Group(); head.position.set(0, 1.15, 0.05); body.add(head);
      ball(head, fur, [0, 0, 0], [0.46, 0.38, 0.4]); ball(head, M(0xfffaf0, 0.85), [0, -0.12, 0.26], [0.24, 0.15, 0.15]); ball(head, pinkC, [0, -0.04, 0.4], [0.045, 0.03, 0.03]);
      [-1, 1].forEach(sd => { cone(head, fur, [0.26 * sd, 0.33, -0.02], 0.13, 0.26, [0, 0, -0.35 * sd]); cone(head, pinkC, [0.25 * sd, 0.31, 0.03], 0.07, 0.17, [0, 0, -0.35 * sd]); });
      const smug = new T.Mesh(new T.TorusGeometry(0.06, 0.013, 5, 10, Math.PI), ink); smug.rotation.z = Math.PI + 0.25; smug.position.set(0.04, -0.16, 0.39); head.add(smug);
      // pixel shades: a bar plus stepped lenses built from small boxes
      const shades = new T.Group(); shades.position.set(0, 0.1, 0.4); head.add(shades);
      const PX = 0.055, pb = new T.BoxGeometry(PX, PX, 0.03);
      const pixAt = (x, y, mat) => { const b = new T.Mesh(pb, mat); b.position.set(x * PX, y * PX, 0); shades.add(b); };
      for (let x = -7; x <= 7; x++) pixAt(x, 1, pix);
      [-1, 1].forEach(sd => { for (let x = 1; x <= 5; x++) { pixAt(sd * x, 0, pix); if (x < 5) pixAt(sd * x, -1, pix); if (x > 1 && x < 4) pixAt(sd * x, -2, pix); } pixAt(sd * 3, 0, whiteM); pixAt(sd * 2, -1, whiteM); });
      g.userData.update = (t, m) => {
        body.position.y = 0.22 + bounce(t, m, 8) * 0.2; body.scale.y = 1 + Math.sin(t * 1.6) * 0.02;
        head.rotation.y = Math.sin(t * 0.35 + 2) * 0.3; head.rotation.z = 0.1 + Math.sin(t * 0.7) * 0.05; head.rotation.x = m.slump * 0.25;
        shades.position.y = 0.1 - m.slump * 0.05 + (m.cheer > 0.5 ? Math.abs(Math.sin(t * 8)) * 0.04 : 0);
        tail.forEach((b, i) => { const s = i / 5; b.position.set(0.35 + Math.sin(s * 1.5) * 0.2, 0.1 + s * 0.7, -0.3 + Math.sin(t * 2 - i) * 0.05 * s); });
      };
      return g;
    }
    // simple bald guy with a sad face
    function makeSadGuy() {
      const [g, body] = stand(0.7, 0.22), skinW = M(0xf1ebe2, 0.7), shirt = M(0x2b2b33, 0.85), pants = M(0x4a4f5a, 0.85), shoe = M(0x1d1d22, 0.6);
      [-1, 1].forEach(sd => { const l = limb(body, pants, 0.13); setLimb(l, V(0.16 * sd, 0.08, 0), V(0.16 * sd, 0.95, 0)); ball(body, shoe, [0.16 * sd, 0.07, 0.08], [0.13, 0.08, 0.2]); });
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, shirt, [0, 1.35, 0], [0.38, 0.5, 0.28]);
      const arms = [-1, 1].map(sd => { const a = new T.Group(); a.position.set(0.36 * sd, 1.7, 0); trunk.add(a); const l = limb(a, shirt, 0.09); setLimb(l, V(0, 0, 0), V(0.08 * sd, -0.7, 0.05)); ball(a, skinW, [0.08 * sd, -0.76, 0.05], 0.09); a.userData.sd = sd; return a; });
      const head = new T.Group(); head.position.set(0, 2.1, 0.02); trunk.add(head);
      ball(head, skinW, [0, 0.12, 0], [0.33, 0.4, 0.34]); ball(head, skinW, [0, 0.0, 0.3], [0.06, 0.08, 0.06]);
      [-1, 1].forEach(sd => { ball(head, skinW, [0.33 * sd, 0.08, 0], [0.06, 0.1, 0.05]); ball(head, ink, [0.12 * sd, 0.14, 0.31], [0.035, 0.03, 0.02]).castShadow = false;
        const br = limb(head, M(0x6b6560, 0.8), 0.014); setLimb(br, V(0.04 * sd, 0.26, 0.31), V(0.2 * sd, 0.2, 0.28)); }); // brows slant down outward = sad
      const mouth = new T.Mesh(new T.TorusGeometry(0.06, 0.012, 5, 10, Math.PI), ink); mouth.position.set(0, -0.14, 0.32); head.add(mouth); // arch = frown
      ball(head, M(0x9fd8ff, 0.2), [0.18, 0.04, 0.31], [0.02, 0.035, 0.015]).castShadow = false; // a single tear
      g.userData.update = (t, m) => {
        trunk.scale.y = 1 + Math.sin(t * 1.1) * 0.015; body.position.y = 0.22 + bounce(t, m, 7) * 0.15;
        head.rotation.x = 0.12 + m.slump * 0.25 - m.cheer * 0.15; head.rotation.y = Math.sin(t * 0.3 + 5) * 0.25;
        mouth.rotation.z = m.cheer > 0.5 ? Math.PI : 0; mouth.position.y = m.cheer > 0.5 ? -0.1 : -0.14; // cheer = rare smile
        arms.forEach(a => { a.rotation.z = a.userData.sd * (0.05 + m.cheer * 2.4 * (0.8 + Math.sin(t * 9) * 0.2)); });
      };
      return g;
    }
    // chubby blue frog-ish blob with a pink tongue
    function makeBlob() {
      const [g, body] = stand(0.72, 0.22), blue = M(0x3f7fe0, 0.45), blueL = M(0x9cc4ff, 0.6), pinkT = M(0xff7fae, 0.4);
      const trunk = new T.Group(); body.add(trunk);
      ball(trunk, blue, [0, 0.62, 0], [0.55, 0.58, 0.48]); ball(trunk, blueL, [0, 0.5, 0.26], [0.38, 0.4, 0.26]);
      [-1, 1].forEach(sd => { ball(trunk, blue, [0.25 * sd, 1.12, 0.12], 0.2); ball(trunk, whiteM, [0.25 * sd, 1.15, 0.24], 0.15).castShadow = false; ball(trunk, ink, [0.25 * sd + 0.02 * sd, 1.14, 0.36], 0.065).castShadow = false; ball(trunk, shineM, [0.25 * sd - 0.01, 1.18, 0.41], 0.02).castShadow = false; ball(body, blue, [0.25 * sd, 0.06, 0.2], [0.16, 0.06, 0.2]); });
      const lidsB = [-1, 1].map(sd => { const l = lidFor(trunk, blue, 0.16, [0.25 * sd, 1.15, 0.24]); l.rotation.x = -1.5; return l; });
      const ml = new T.Mesh(new T.TorusGeometry(0.28, 0.016, 5, 18, Math.PI * 0.6), ink); ml.position.set(0, 1.0, 0.36); ml.rotation.z = Math.PI * 1.2; trunk.add(ml);
      const tongue = ball(trunk, pinkT, [0.05, 0.74, 0.46], [0.09, 0.12, 0.05]);
      const arms = [-1, 1].map(sd => { const a = new T.Group(); a.position.set(0.5 * sd, 0.7, 0.05); trunk.add(a); ball(a, blue, [0.08 * sd, -0.15, 0.05], [0.1, 0.22, 0.1]); a.userData.sd = sd; return a; });
      g.userData.update = (t, m) => {
        trunk.scale.set(1 + Math.sin(t * 1.4) * 0.03, 1 - Math.sin(t * 1.4) * 0.02 - m.slump * 0.06, 1);
        body.position.y = 0.22 + bounce(t, m, 7) * 0.25; trunk.rotation.y = Math.sin(t * 0.4 + 3) * 0.3; trunk.rotation.z = Math.sin(t * 0.9) * 0.04;
        tongue.position.y = 0.74 - Math.max(0, Math.sin(t * 1.1)) * 0.06; tongue.scale.y = 0.12 + Math.max(0, Math.sin(t * 1.1)) * 0.06;
        arms.forEach(a => { a.rotation.z = a.userData.sd * (0.2 + m.cheer * 2.2 + (a.userData.sd > 0 ? Math.max(0, Math.sin(t * 2.5)) * 0.8 : 0)); });
        lidsB.forEach(l => { l.rotation.x = blinkAt(t, 4) ? 0.9 : lerp(-1.5, 0.3, m.slump); });
      };
      return g;
    }

    // Bake: merge every mesh that never moves relative to its parent into one mesh per material.
    // Moving parts are found by running each figure's animation over many times/moods and watching transforms.
    function mergeMeshes(list) {
      let total = 0; list.forEach(m => { total += m.geometry.attributes.position.count; });
      const pos = new Float32Array(total * 3), nor = new Float32Array(total * 3), idx = []; let off = 0;
      const v = new T.Vector3(), nm = new T.Matrix3();
      list.forEach(m => {
        m.updateMatrix(); nm.getNormalMatrix(m.matrix);
        const gp = m.geometry.attributes.position, gn = m.geometry.attributes.normal, gi = m.geometry.index;
        for (let i = 0; i < gp.count; i++) {
          v.fromBufferAttribute(gp, i).applyMatrix4(m.matrix); pos.set([v.x, v.y, v.z], (off + i) * 3);
          v.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize(); nor.set([v.x, v.y, v.z], (off + i) * 3);
        }
        if (gi) for (let j = 0; j < gi.count; j++) idx.push(gi.getX(j) + off); else for (let i = 0; i < gp.count; i++) idx.push(i + off);
        off += gp.count;
      });
      const g = new T.BufferGeometry(); g.setAttribute("position", new T.BufferAttribute(pos, 3)); g.setAttribute("normal", new T.BufferAttribute(nor, 3)); g.setIndex(idx);
      g.computeBoundingSphere(); return g;
    }
    function bakeStatic(root, update) {
      const meshes = []; root.traverse(o => { if (o.isMesh && !o.isInstancedMesh && !o.userData.noBake) meshes.push(o); });
      const key = o => [o.position.x, o.position.y, o.position.z, o.quaternion.x, o.quaternion.y, o.quaternion.z, o.quaternion.w, o.scale.x, o.scale.y, o.scale.z, o.visible, o.material.uuid].join();
      const start = new Map(meshes.map(m => [m, key(m)])), dyn = new Set();
      if (update) {
        const moods = [{ cheer: 0, slump: 0 }, { cheer: 1, slump: 0 }, { cheer: 0, slump: 1 }, { cheer: 0.5, slump: 0.5 }, { cheer: 0.8, slump: 0.2 }];
        for (let i = 0; i < 240; i++) { update(i * 0.293 + (i % 5) * 0.011, moods[i % 5]); meshes.forEach(m => { if (!dyn.has(m) && key(m) !== start.get(m)) dyn.add(m); }); }
        update(0, { cheer: 0, slump: 0 });
      }
      const groups = new Map();
      meshes.forEach(m => {
        if (dyn.has(m) || m.children.length || Array.isArray(m.material) || !m.geometry.attributes.normal) return;
        const k = m.parent.uuid + "|" + m.material.uuid + "|" + m.castShadow + "|" + m.renderOrder;
        if (!groups.has(k)) groups.set(k, []); groups.get(k).push(m);
      });
      groups.forEach(list => {
        if (list.length < 2) return;
        const parent = list[0].parent, mm = new T.Mesh(mergeMeshes(list), list[0].material);
        mm.castShadow = list[0].castShadow; mm.receiveShadow = list.some(x => x.receiveShadow); mm.renderOrder = list[0].renderOrder;
        list.forEach(x => parent.remove(x)); parent.add(mm);
      });
    }
    const statues = [
      Object.assign(makeDog(), {}),
      Object.assign(makeFrog(), {}),
      Object.assign(makeSquirrel(), {}),
      makeShiba(false), makeShiba(true), makeCat(), makePenguin(), makeApe()   // 3..7: side figures
    ];
    SPH = SPH_LO; // 8..16: the crowd (low-poly spheres)
    statues.push(makePuff(), makeHippo(), makeBook(), makePup("helmet"), makePup("bat"), makeGoat(), makeShadesCat(), makeSadGuy(), makeBlob());
    SPH = SPH_HI;
    statues.forEach(s => bakeStatic(s, s.userData.update));
    bakeStatic(tank);
    const SC = 1.35, SIDE_K = [1, 1, 1, 0.95, 0.95, 0.9, 0.9, 1.0, 0.8, 0.85, 0.85, 0.8, 0.95, 1.1, 1.05, 1.05, 1.1];
    const NO_LOD = /[?&]lod=off/.test(location.search); // test helper: keep the back rows on phones for screenshots
    const CROWD_BACK = new Set([13, 14, 16]); // hidden on phones at the lowest quality step
    if (coarse) statues.forEach((s, i) => { if (i >= 8) s.traverse(o => { if (o.isMesh) o.castShadow = false; }); });
    const pedInst = new T.InstancedMesh(PED, pedM, statues.length), ringInst = new T.InstancedMesh(RING, pedRim, statues.length);
    pedInst.castShadow = pedInst.receiveShadow = true; pedInst.frustumCulled = ringInst.frustumCulled = false; scene.add(pedInst, ringInst);
    const pm = new T.Matrix4(), pl = new T.Matrix4(), pq = new T.Quaternion(), ringQ = new T.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2);
    function updatePedestals() {
      statues.forEach((s, i) => {
        const { r, h } = s.userData.ped; s.updateMatrixWorld(true);
        pl.compose(V(0, h / 2, 0), pq.identity(), V(r, h, r)); pm.multiplyMatrices(s.matrixWorld, pl); pedInst.setMatrixAt(i, s.visible ? pm : pl.makeScale(0, 0, 0));
        pl.compose(V(0, h, 0), ringQ, V(r, r, 1)); pm.multiplyMatrices(s.matrixWorld, pl); ringInst.setMatrixAt(i, s.visible ? pm : pl.makeScale(0, 0, 0));
      });
      pedInst.instanceMatrix.needsUpdate = ringInst.instanceMatrix.needsUpdate = true;
    }
    statues.forEach((s, i) => { s.userData.k = SIDE_K[i]; s.scale.setScalar(SC * s.userData.k); scene.add(s); });
    // fixed-size desk props: they never grow, so they show how big everything else got
    const mug = new T.Group(); scene.add(mug);
    const mugM = toon(0xfff1da, { roughness: 0.35 });
    const mugBody = new T.Mesh(new T.CylinderGeometry(0.3, 0.27, 0.6, 24), mugM); mugBody.position.y = 0.3; mugBody.castShadow = true; mug.add(mugBody);
    const band = new T.Mesh(new T.CylinderGeometry(0.305, 0.29, 0.14, 24), toon(0xff4d92, { roughness: 0.4 })); band.position.y = 0.36; mug.add(band);
    const coffee = new T.Mesh(new T.CircleGeometry(0.26, 20), toon(0x5a3a22, { roughness: 0.3 })); coffee.rotation.x = -Math.PI / 2; coffee.position.y = 0.56; mug.add(coffee);
    const handle = new T.Mesh(new T.TorusGeometry(0.15, 0.045, 8, 16), mugM); handle.position.set(0.32, 0.32, 0); handle.castShadow = true; mug.add(handle);
    const books = new T.Group(); scene.add(books);
    [[1.3, 0.2, 0.9, 0x2a8f7f, 0], [1.15, 0.18, 0.8, 0xff7fae, 0.12], [1.0, 0.16, 0.72, 0xffd23f, -0.08]].reduce((y, [w, h, d, c, r]) => {
      const b = new T.Mesh(new T.BoxGeometry(w, h, d), toon(c, { roughness: 0.6 })); b.position.y = y + h / 2; b.rotation.y = r; b.castShadow = b.receiveShadow = true; books.add(b); return y + h;
    }, 0);
    bakeStatic(mug);
    const mood = { cheer: 0, slump: 0 };

    /* ---------- signs: always 3 different texts, every 60 s all boards flip to new ones ---------- */
    function drawDiamond(g, cx, cy, s, fill, line) {
      g.save(); g.translate(cx, cy);
      g.beginPath(); g.moveTo(-s, -s * 0.35); g.lineTo(-s * 0.55, -s * 0.8); g.lineTo(s * 0.55, -s * 0.8); g.lineTo(s, -s * 0.35); g.lineTo(0, s * 0.9); g.closePath();
      g.fillStyle = fill; g.fill(); g.lineWidth = s * 0.12; g.strokeStyle = line; g.lineJoin = "round"; g.stroke();
      g.beginPath(); g.moveTo(-s, -s * 0.35); g.lineTo(s, -s * 0.35); g.moveTo(-s * 0.3, -s * 0.35); g.lineTo(0, s * 0.9); g.lineTo(s * 0.3, -s * 0.35); g.stroke();
      g.restore();
    }
    function signTexture(text, bg, fg, icon) {
      const c = document.createElement("canvas"); c.width = 512; c.height = 256;
      const tex = new T.CanvasTexture(c); tex.encoding = T.sRGBEncoding; tex.anisotropy = 4;
      const FONT = s => `700 ${s}px Fredoka, "Baloo 2", sans-serif`, MAXW = 452, MAXH = 196;
      const draw = () => {
        const g = c.getContext("2d");
        g.fillStyle = bg; g.fillRect(0, 0, 512, 256);
        g.strokeStyle = "#B5175A"; g.lineWidth = 14; g.strokeRect(14, 14, 484, 228);
        g.fillStyle = fg; g.textAlign = "center"; g.textBaseline = "middle";
        const iconW = s => icon ? s * 0.95 : 0;
        // 1) one line, as big as possible (down to 92 px)
        let size = 170; g.font = FONT(size);
        while (size > 92 && g.measureText(text).width + iconW(size) > MAXW) { size -= 4; g.font = FONT(size); }
        let lines = [text];
        // 2) otherwise two balanced lines
        if (g.measureText(text).width + iconW(size) > MAXW && text.includes(" ")) {
          const w = text.split(" "); let best = null;
          for (let i = 1; i < w.length; i++) { const l = [w.slice(0, i).join(" "), w.slice(i).join(" ")], d = Math.abs(l[0].length - l[1].length); if (!best || d < best.d) best = { l, d }; }
          lines = best.l; size = 120; g.font = FONT(size);
          while (size > 40 && (Math.max(...lines.map(l => g.measureText(l).width)) + iconW(size) > MAXW || size * 2 > MAXH)) { size -= 3; g.font = FONT(size); }
        } else {
          while (size > 40 && g.measureText(text).width + iconW(size) > MAXW) { size -= 3; g.font = FONT(size); }
        }
        const lh = size * 0.98, y0 = 136 - (lines.length - 1) * lh / 2;
        const shift = iconW(size) / 2;
        lines.forEach((l, i) => g.fillText(l, 256 + shift, y0 + i * lh));
        if (icon === "diamond") {
          const wMax = Math.max(...lines.map(l => g.measureText(l).width));
          drawDiamond(g, 256 + shift - wMax / 2 - size * 0.5, 128, size * 0.36, "#9FE8FF", fg);
        }
        tex.needsUpdate = true;
      };
      draw();
      if (document.fonts && document.fonts.load) document.fonts.load('700 100px Fredoka').then(draw).catch(() => {});
      return tex;
    }
    const PALETTES = [["#FFF1DA", "#FF4D92"], ["#7FE3CF", "#0E4F4B"], ["#FF4D92", "#FFF1DA"], ["#FFD23F", "#0E4F4B"], ["#0E4F4B", "#7FE3CF"]];
    // no price or profit claims in here
    const SIGN_TEXTS = ["$SQUIRM", "LFG", "BUY", "HOLD", "DIAMOND HANDS", "WAGMI", "GM", "SEND IT", "FEED THE WORM", "WIGGLE ON", "NO PAPER HANDS", "SQUIRM GANG"];
    const signMats = SIGN_TEXTS.map((txt, i) => {
      const [bg, fg] = i === 0 ? PALETTES[0] : PALETTES[i % PALETTES.length];
      return new T.MeshStandardMaterial({ map: signTexture(txt, bg, fg, txt === "DIAMOND HANDS" ? "diamond" : null), roughness: 0.5, envMapIntensity: 0.4 });
    });
    const signEdge = toon(0x7fe3cf, { roughness: 0.35 }), postM = toon(0xd9c7a5, { roughness: 0.7 });
    const BOARD_W = 1.15, BOARD_H = 0.575, signs = [];
    function makeSign(parent, x, z, rotY, slot, offX) {
      const g = new T.Group(); g.position.set(x, 0.22, z); g.rotation.y = rotY; parent.add(g);
      const post = limb(g, postM, 0.035); setLimb(post, V(0, 0, 0), V(0, 2.5, 0));
      const arm = limb(g, postM, 0.03); setLimb(arm, V(0, 2.5, 0), V(offX, 2.5, 0));
      const board = new T.Group(); board.position.set(offX, 2.78, 0); g.add(board);
      const edge = new T.Mesh(new T.BoxGeometry(BOARD_W + 0.06, BOARD_H + 0.06, 0.05), signEdge); edge.castShadow = true; board.add(edge);
      const pf = new T.PlaneGeometry(BOARD_W, BOARD_H);
      const front = new T.Mesh(pf, signMats[0]); front.position.z = 0.027; board.add(front);
      const back = new T.Mesh(pf, signMats[0]); back.position.z = -0.027; back.rotation.y = Math.PI; board.add(back);
      signs.push({ board, faces: [front, back], slot, g, post, arm, x, z, rotY, offX, baseY: 2.78 }); // slot: 0 dog, 1 frog, 2 squirrel
    }
    // each sign stands on its statue's base, on the side away from the tank / tail
    // boards hang off to the side of each figure so heads never cover the text
    makeSign(statues[0], -0.8, 0.3, 0.1, 0, -0.42);  // dog guy starts with "$SQUIRM"
    makeSign(statues[1], -0.85, 0.25, 0.1, 1, -0.4); // frog starts with "LFG"
    makeSign(statues[2], -0.82, 0.3, -0.1, 2, -0.4); // squirrel starts with "BUY"
    makeSign(statues[7], -0.85, 0.2, 0.1, 3, -0.4);  // sunglasses ape starts with "HOLD"
    makeSign(statues[4], 0.7, 0.3, -0.1, 4, 0.4);  // beanie shiba starts with "DIAMOND HANDS"
    makeSign(statues[15], 0.62, 0.25, -0.1, 5, 0.4); // sad guy starts with "WAGMI"
    const SIGN_PERIOD = 60, FLIP_TIME = 0.8;
    // Schedule: "$SQUIRM" moves dog -> frog -> squirrel each step (5 signs total, all different); the other two signs walk through the
    // remaining 11 texts five at a time (6 signs). Start: dog "$SQUIRM", frog "LFG", squirrel "BUY". Never two the same.
    function textAt(slot, step) {
      const holder = step % 3;
      if (slot === holder) return 0;
      const others = [0, 1, 2, 3, 4, 5].filter(s => s !== holder), n = SIGN_TEXTS.length - 1;
      return 1 + ((5 * step + others.indexOf(slot)) % n);
    }
    const ease = k => k < 0.5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
    function updateSigns(t) {
      const step = Math.floor(t / SIGN_PERIOD), p = t - step * SIGN_PERIOD;
      const flipping = step >= 1 && p < FLIP_TIME;
      signs.forEach(({ board, faces, slot }, i) => {
        // face (step % 2) shows the current text, the other face holds the previous (while flipping) or next text
        const other = flipping ? step - 1 : step + 1;
        faces[step % 2].material = signMats[textAt(slot, step)];
        faces[(step + 1) % 2].material = signMats[textAt(slot, other)];
        const turn = flipping ? (step - 1) + ease(p / FLIP_TIME) : step;
        board.rotation.y = turn * Math.PI + Math.sin(t * 0.8 + i * 2) * 0.05;
        board.rotation.z = Math.sin(t * 1.1 + i) * 0.02;
        board.position.y = signs[i].baseY + (flipping ? Math.sin(Math.PI * p / FLIP_TIME) * 0.15 : 0);
      });
      return step >= 1 && p < FLIP_TIME + 1.6; // cheer window
    }

    /* ---------- snacks + salt + hearts ---------- */
    const crumbGeo = new T.DodecahedronGeometry(0.09, 0);
    const crumbMat = new T.MeshStandardMaterial({ color: 0xffd23f, roughness: 0.45, emissive: 0x8a5a00, emissiveIntensity: 0.35, flatShading: true });
    const crumbs = [];
    const inTank = (mx, mz) => [(Math.random() * 2 - 1) * mx, (Math.random() * 2 - 1) * mz];
    const SALT = 160;
    const salt = new T.InstancedMesh(new T.BoxGeometry(0.045, 0.045, 0.045), new T.MeshStandardMaterial({ color: 0xe4ecff, roughness: 0.2, emissive: 0x9fb8ff, emissiveIntensity: 0.25 }), SALT);
    salt.instanceMatrix.setUsage(T.DynamicDrawUsage);
    const grains = Array.from({ length: SALT }, () => ({ x: 0, y: -9, z: 0, vy: 0, life: 0, rx: 0 }));
    let saltIdx = 0; scene.add(salt);
    const hc = document.createElement("canvas"); hc.width = hc.height = 64; const hg = hc.getContext("2d");
    hg.fillStyle = "#ff3d7f"; hg.font = "56px sans-serif"; hg.textAlign = "center"; hg.textBaseline = "middle"; hg.fillText("\u2665", 32, 36);
    const heartTex = new T.CanvasTexture(hc); heartTex.encoding = T.sRGBEncoding;
    const hearts = [];

    /* ---------- back wall with a big chart screen ---------- */
    const backWall = new T.Mesh(new T.PlaneGeometry(90, 40), toon(0x0d4844, { roughness: 0.95, envMapIntensity: 0.15 }));
    backWall.position.y = 19.5; backWall.receiveShadow = true; scene.add(backWall);
    const screen = new T.Group(); scene.add(screen);
    const CW = 1024, CH = 512, chartCanvas = document.createElement("canvas"); chartCanvas.width = CW; chartCanvas.height = CH;
    const chartTex = new T.CanvasTexture(chartCanvas); chartTex.encoding = T.sRGBEncoding; chartTex.anisotropy = 8;
    const SW = 7.2, SH = SW / 2;
    const glowC = document.createElement("canvas"); glowC.width = glowC.height = 128;
    { const g = glowC.getContext("2d"), gr = g.createRadialGradient(64, 64, 10, 64, 64, 64); gr.addColorStop(0, "rgba(127,227,207,0.55)"); gr.addColorStop(1, "rgba(127,227,207,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
    const glowTex = new T.CanvasTexture(glowC); glowTex.encoding = T.sRGBEncoding;
    const glowPlane = new T.Mesh(new T.PlaneGeometry(SW * 1.5, SH * 1.7), new T.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false }));
    glowPlane.position.z = -0.02; screen.add(glowPlane);
    const bezel = new T.Mesh(new T.BoxGeometry(SW + 0.22, SH + 0.22, 0.12), toon(0x08201f, { roughness: 0.4, metalness: 0.3 }));
    bezel.position.z = 0.02; bezel.castShadow = true; screen.add(bezel);
    const bezelEdge = new T.Mesh(new T.BoxGeometry(SW + 0.3, SH + 0.3, 0.06), toon(0x7fe3cf, { roughness: 0.3, emissive: 0x2a8f7f, emissiveIntensity: 0.6 }));
    bezelEdge.position.z = -0.02; screen.add(bezelEdge);
    const panel = new T.Mesh(new T.PlaneGeometry(SW, SH), new T.MeshBasicMaterial({ map: chartTex, toneMapped: false }));
    panel.position.z = 0.085; screen.add(panel);

    /* ---------- room decor: posters (our own art only), shelves, soft rim lights ---------- */
    function posterTex(kind) {
      const c = document.createElement("canvas"); c.width = 256; c.height = 340; const g = c.getContext("2d");
      const bg = g.createLinearGradient(0, 0, 0, 340);
      if (kind === 0) { bg.addColorStop(0, "#7FE3CF"); bg.addColorStop(1, "#3fb8a3"); } else { bg.addColorStop(0, "#FF6FA3"); bg.addColorStop(1, "#e0367a"); }
      g.fillStyle = bg; g.fillRect(0, 0, 256, 340);
      g.fillStyle = "rgba(255,255,255,0.18)"; for (let i = 0; i < 7; i++) { g.beginPath(); g.arc(30 + i * 37, 40 + (i % 2) * 22, 6, 0, 6.283); g.fill(); }
      if (kind === 0) { // a wiggly worm + GM
        for (let i = 9; i >= 0; i--) { g.fillStyle = i % 2 ? "#e0367a" : "#FF4D92"; g.beginPath(); g.arc(50 + i * 17, 170 + Math.sin(i * 0.9) * 22, i === 0 ? 30 : 22 + Math.sin(i / 9 * 3) * 4, 0, 6.283); g.fill(); }
        g.fillStyle = "#fff"; g.beginPath(); g.arc(40, 160, 9, 0, 6.283); g.arc(62, 160, 9, 0, 6.283); g.fill(); g.fillStyle = "#17172a"; g.beginPath(); g.arc(42, 162, 5, 0, 6.283); g.arc(64, 162, 5, 0, 6.283); g.fill();
        g.fillStyle = "#0E4F4B"; g.font = "700 70px Fredoka, sans-serif"; g.textAlign = "center"; g.fillText("GM", 128, 300);
      } else {   // diamond + $SQUIRM
        drawDiamond(g, 128, 150, 70, "#7FE3CF", "#FFF1DA");
        g.fillStyle = "#FFF1DA"; g.font = "700 46px Fredoka, sans-serif"; g.textAlign = "center"; g.fillText("$SQUIRM", 128, 295);
      }
      const tx = new T.CanvasTexture(c); tx.encoding = T.sRGBEncoding; return tx;
    }
    const decor = new T.Group(); scene.add(decor);
    const posters = [0, 1].map(k => {
      const p = new T.Group(); decor.add(p);
      const fr = new T.Mesh(new T.BoxGeometry(2.1, 2.75, 0.08), M(0xfff1da, 0.5)); fr.castShadow = true; p.add(fr);
      const art = new T.Mesh(new T.PlaneGeometry(1.9, 2.55), new T.MeshStandardMaterial({ map: posterTex(k), roughness: 0.6, envMapIntensity: 0.3 })); art.position.z = 0.045; p.add(art);
      return p;
    });
    const shelfItems = [[[0.22, 0.5, 0.3, 0x2a8f7f], [0.18, 0.42, 0.3, 0xffd23f], [0.2, 0.55, 0.3, 0xff7fae]], [[0.2, 0.46, 0.3, 0x7fe3cf], [0.24, 0.38, 0.3, 0xfff1da]]];
    const shelves = [-1, 1].map(sd => {
      const s = new T.Group(); decor.add(s);
      [0, 1].forEach(row => {
        const y = row * 1.25;
        const plank = new T.Mesh(new T.BoxGeometry(2.4, 0.1, 0.6), M(0xd9c7a5, 0.7)); plank.position.set(0, y, 0.3); plank.castShadow = plank.receiveShadow = true; s.add(plank);
        [-1, 1].forEach(b => { const br = new T.Mesh(new T.BoxGeometry(0.06, 0.3, 0.4), M(0x7fe3cf, 0.4)); br.position.set(b * 0.9, y - 0.18, 0.2); s.add(br); });
        if (row === 0) { // books + a little potted plant / plush worm
          let x = sd < 0 ? -1.0 : 0.25; shelfItems[sd < 0 ? 0 : 1].forEach(([w, h, d, c]) => { const bk = new T.Mesh(new T.BoxGeometry(w, h, d), M(c, 0.6)); bk.position.set(x, y + 0.05 + h / 2, 0.3); bk.castShadow = true; s.add(bk); x += w + 0.03; });
          if (sd < 0) { ball(s, M(0xff4d92, 0.5), [0.55, y + 0.2, 0.3], 0.15); ball(s, M(0xe0367a, 0.5), [0.8, y + 0.16, 0.3], 0.13); ball(s, M(0xff4d92, 0.5), [1.0, y + 0.13, 0.3], 0.1); }
          else { const pot = new T.Mesh(CYL, M(0xffa63d, 0.6)); pot.scale.set(0.16, 0.3, 0.16); pot.position.set(-0.7, y + 0.2, 0.3); s.add(pot); ball(s, leafM, [-0.7, y + 0.5, 0.3], [0.2, 0.26, 0.2]); ball(s, leaf2, [-0.6, y + 0.62, 0.32], [0.12, 0.16, 0.12]); }
        } else { // top shelf: a trophy cup + a tiny globe
          const cup = new T.Mesh(CONE, M(0xffd23f, 0.25)); cup.scale.set(0.2, 0.35, 0.2); cup.rotation.x = Math.PI; cup.position.set(sd * -0.5, y + 0.38, 0.3); s.add(cup);
          const st = new T.Mesh(CYL, M(0xffd23f, 0.25)); st.scale.set(0.04, 0.2, 0.04); st.position.set(sd * -0.5, y + 0.12, 0.3); s.add(st);
          ball(s, M(0x7fe3cf, 0.4), [sd * 0.45, y + 0.25, 0.3], 0.2);
        }
      });
      return s;
    });
    // tiered risers so the back rows of the crowd stand higher (static: merged into one mesh per material)
    const risers = [-1, 1].map(sd => {
      const r = new T.Group(); scene.add(r);
      const parts = new T.Group();
      [[0.8, -0.8], [1.6, -2.4]].forEach(([h, z]) => {
        const b = new T.Mesh(new T.BoxGeometry(6.4, h, 1.6), M(0x175f58, 0.75)); b.position.set(0, h / 2, z); parts.add(b);
        const tr = new T.Mesh(new T.BoxGeometry(6.4, 0.06, 0.06), M(0x7fe3cf, 0.35)); tr.position.set(0, h, z + 0.8); parts.add(tr);
        const tr2 = new T.Mesh(new T.BoxGeometry(6.4, 0.04, 0.04), M(0xff6fa3, 0.4)); tr2.position.set(0, h * 0.5, z + 0.81); parts.add(tr2);
      });
      bakeStatic(parts); parts.children.forEach(c => { c.castShadow = !coarse; c.receiveShadow = true; }); r.add(parts); r.userData.sd = sd;
      return r;
    });
    // banner across the top: our own text only
    const bannerC = document.createElement("canvas"); bannerC.width = 1024; bannerC.height = 160;
    const bannerTex = new T.CanvasTexture(bannerC); bannerTex.encoding = T.sRGBEncoding; bannerTex.anisotropy = 4;
    function drawBanner() {
      const g = bannerC.getContext("2d"); g.clearRect(0, 0, 1024, 160);
      const cols = ["#FF6FA3", "#7FE3CF", "#FFD23F"];
      g.fillStyle = "#0E4F4B"; g.beginPath(); g.roundRect ? g.roundRect(40, 30, 944, 96, 48) : g.rect(40, 30, 944, 96); g.fill();
      g.lineWidth = 6; g.strokeStyle = "#7FE3CF"; g.stroke();
      for (let i = 0; i < 18; i++) { g.fillStyle = cols[i % 3]; const x = 60 + i * 52; g.beginPath(); g.moveTo(x, 132); g.lineTo(x + 40, 132); g.lineTo(x + 20, 158); g.closePath(); g.fill(); }
      g.textAlign = "center"; g.textBaseline = "middle"; g.font = "700 60px Fredoka, sans-serif";
      g.textAlign = "left";
      const parts = [["MEME LEGENDS", "#FFF1DA"], ["  ×  ", "#FFD23F"], ["SQUIRM", "#FF6FA3"]], wTot = parts.reduce((s, [p]) => s + g.measureText(p).width, 0);
      let x = 512 - wTot / 2; parts.forEach(([p, c]) => { g.fillStyle = c; g.fillText(p, x, 80); x += g.measureText(p).width; });
      bannerTex.needsUpdate = true;
    }
    drawBanner(); if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawBanner);
    const banner = new T.Mesh(new T.PlaneGeometry(9.6, 1.5), new T.MeshBasicMaterial({ map: bannerTex, transparent: true, toneMapped: false }));
    scene.add(banner);
    shelves.forEach(s => bakeStatic(s));
    const rimLights = [[-1, 0xff6fa3], [1, 0x7fe3cf]].map(([sd, c]) => { const l = new T.PointLight(c, 0.9, 16, 2); l.userData.sd = sd; scene.add(l); return l; });

    const fmtMoney = v => v >= 1e9 ? "$" + (v / 1e9).toFixed(2) + "B" : v >= 1e6 ? "$" + (v / 1e6).toFixed(v >= 1e7 ? 1 : 2) + "M" : v >= 1e3 ? "$" + (v / 1e3).toFixed(v >= 1e5 ? 0 : 1) + "k" : "$" + Math.round(v);
    function drawChart(m) {
      const g = chartCanvas.getContext("2d"), F = (w, s) => `${w} ${s}px Fredoka, "Baloo 2", sans-serif`, MONO = s => `${s}px DMMono, monospace`;
      g.fillStyle = "#071f1e"; g.fillRect(0, 0, CW, CH);
      const grd = g.createLinearGradient(0, 0, 0, CH); grd.addColorStop(0, "rgba(127,227,207,0.07)"); grd.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = grd; g.fillRect(0, 0, CW, CH);
      const c = m.candles || [], last = c[c.length - 1], mc = last ? last.c : (m.mc || 0);
      // header
      g.textBaseline = "alphabetic"; g.textAlign = "left";
      g.fillStyle = "#FF6FA3"; g.font = F(700, 70); g.fillText("SQUIRM", 30, 76);
      let x = 30 + g.measureText("SQUIRM").width + 24;
      g.fillStyle = "#FFF1DA"; g.font = F(600, 54); const mcText = fmtMoney(mc); g.fillText(mcText, x, 74); x += g.measureText(mcText).width + 20;
      if (m.change != null) { const up = m.change >= 0; g.fillStyle = up ? "#4BE38B" : "#FF5A6E"; g.font = F(600, 44); g.fillText(`${up ? "▲" : "▼"} ${Math.abs(m.change).toFixed(1)}%`, x, 72); x += g.measureText(`▲ ${Math.abs(m.change).toFixed(1)}%`).width + 10;
        g.font = MONO(22); g.fillStyle = "rgba(255,241,218,0.55)"; g.fillText(m.changeLabel || "", x, 72); }
      g.textAlign = "right"; g.fillStyle = (m.source || "").startsWith("test") ? "#FFD23F" : "rgba(127,227,207,0.9)"; g.font = MONO(24); g.fillText(m.source || "", CW - 30, 36);
      // plot area
      const L = 30, R = CW - 160, Tp = 106, B = CH - 50;
      g.strokeStyle = "rgba(127,227,207,0.12)"; g.lineWidth = 1; g.strokeRect(L, Tp, R - L, B - Tp);
      if (!c.length) { g.textAlign = "center"; g.fillStyle = "rgba(255,241,218,0.6)"; g.font = F(500, 34); g.fillText("waiting for market data…", (L + R) / 2, (Tp + B) / 2); chartTex.needsUpdate = true; return; }
      let lo = Infinity, hi = 0; c.forEach(k => { lo = Math.min(lo, k.l); hi = Math.max(hi, k.h); });
      // keep candles readable: level lines widen the range only up to ~2x beyond the candles; further ones pin to the edge
      const cLo = lo, cHi = hi;
      if (m.nextAt) hi = Math.max(hi, Math.min(m.nextAt, cHi * 3.3)); if (m.levelAt && m.levelAt < lo) lo = Math.max(m.levelAt, cLo / 1.6);
      const lgLo = Math.log(lo * 0.93), lgHi = Math.log(hi * 1.07), Y = v => B - (Math.log(v) - lgLo) / (lgHi - lgLo) * (B - Tp);
      // y grid (log ticks at 1-2-5)
      g.font = MONO(22); g.textAlign = "left";
      for (let d = Math.pow(10, Math.floor(Math.log10(lo))); d < hi * 2; d *= 10) [1, 2, 5].forEach(k => { const v = d * k; if (v < lo * 0.93 || v > hi * 1.07) return; const y = Y(v);
        g.strokeStyle = "rgba(127,227,207,0.08)"; g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.fillStyle = "rgba(255,241,218,0.45)"; g.fillText(fmtMoney(v), R + 12, y + 6); });
      // level lines
      const hline = (v, col, dash, label) => { const y = Math.max(Tp + 2, Math.min(B - 2, Y(v))); if (v > hi * 1.07) label = "↑ " + label; if (v < lo * 0.93) label = "↓ " + label; g.save(); g.strokeStyle = col; g.lineWidth = 2.5; g.setLineDash(dash); g.beginPath(); g.moveTo(L, y); g.lineTo(R, y); g.stroke(); g.restore();
        g.fillStyle = col; g.font = F(600, 28); g.textAlign = "left"; g.fillText(label, L + 12, y < Tp + 40 ? y + 32 : y - 10); };
      if (m.levelAt) hline(m.levelAt, "rgba(127,227,207,0.55)", [], `Level ${m.level} · ${fmtMoney(m.levelAt)}`);
      if (m.nextAt) hline(m.nextAt, "#FFD23F", [14, 10], `next growth ${fmtMoney(m.nextAt)} (3x)`);
      // candles / line (index spaced, like trading charts)
      const n = c.length, step = (R - L - 10) / Math.max(n, 30), bw = Math.max(2, step * 0.62), X = i => L + 5 + step * (i + 0.5) + (Math.max(n, 30) - n) * step;
      if (m.kind === "line" || n < 3) {
        g.strokeStyle = "#7FE3CF"; g.lineWidth = 3; g.beginPath(); c.forEach((k, i) => { const px = X(i), py = Y(k.c); i ? g.lineTo(px, py) : g.moveTo(px, py); }); g.stroke();
        c.forEach((k, i) => { g.fillStyle = "#7FE3CF"; g.beginPath(); g.arc(X(i), Y(k.c), 3, 0, 6.283); g.fill(); });
      } else c.forEach((k, i) => {
        const up = k.c >= k.o, col = up ? "#4BE38B" : "#FF5A6E", px = X(i);
        g.strokeStyle = col; g.lineWidth = Math.max(1, bw * 0.18); g.beginPath(); g.moveTo(px, Y(k.h)); g.lineTo(px, Y(k.l)); g.stroke();
        const y1 = Y(Math.max(k.o, k.c)), y2 = Y(Math.min(k.o, k.c)); g.fillStyle = col; g.fillRect(px - bw / 2, y1, bw, Math.max(2, y2 - y1));
      });
      // last price marker
      const ly = Y(mc), upLast = !last || last.c >= last.o;
      g.save(); g.setLineDash([4, 6]); g.strokeStyle = "rgba(255,241,218,0.7)"; g.lineWidth = 1.5; g.beginPath(); g.moveTo(L, ly); g.lineTo(R, ly); g.stroke(); g.restore();
      g.fillStyle = upLast ? "#4BE38B" : "#FF5A6E"; g.fillRect(R + 4, ly - 20, CW - R - 10, 40);
      g.fillStyle = "#071f1e"; g.font = F(700, 28); g.textAlign = "center"; g.fillText(fmtMoney(mc), (R + 4 + CW - 8) / 2, ly + 8);
      // time labels
      g.fillStyle = "rgba(255,241,218,0.5)"; g.font = MONO(22);
      [0, 0.5, 1].forEach(f => { const i = Math.min(n - 1, Math.round(f * (n - 1))); const d = new Date(c[i].t); g.textAlign = f === 0 ? "left" : f === 1 ? "right" : "center";
        g.fillText(d.getHours().toString().padStart(2, "0") + ":" + d.getMinutes().toString().padStart(2, "0"), X(i), CH - 16); });
      chartTex.needsUpdate = true;
    }
    drawChart({ candles: [], source: "" });
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => lastChart && drawChart(lastChart));
    let lastChart = null;

    /* ---------- growth with market cap ----------
       g goes 0 (level 1) .. 1 (level 8), then only a little more. Everything below reads the
       smoothed value `grow`, so sizes never jump. */
    let level = 1, growTarget = 0, grow = 0;
    const gOf = lv => Math.min(lv - 1, 7) / 7 + Math.min(Math.max(lv - 8, 0) * 0.03, 0.15);
    const G = { ts: 1, th: 1, ws: 1, fs: 1 };
    let framingDirty = true, fitCur = 13;
    function applyGrowth() {
      G.ts = 1 + grow * 1.0;             // tank width/depth up to ~2x
      G.th = 1 + grow * 0.6;             // tank height
      G.ws = 1 + grow * 0.7;             // worm thickness (length also grows via more segments)
      G.fs = 1 + grow * 0.6;             // statues up to ~1.6x
      N = Math.round(NMIN + (NMAX - NMIN) * Math.min(grow, 1));
      tank.scale.set(G.ts, G.th, G.ts);
      head.scale.setScalar(G.ws);
      for (let i = 0; i < NMAX; i++) {
        segs[i].visible = i < N;
        const r = 0.2 * G.ws * (0.6 + 0.4 * Math.sin(Math.PI * (i + 4) / (N + 4)));
        radii[i] = i === N - 1 ? r * 0.8 : r;
        segs[i].scale.setScalar(radii[i]);
      }
      layoutStatues();
      const k = Math.max(G.ts, G.fs);
      Object.assign(key.shadow.camera, { left: -7.5 * k, right: 7.5 * k, top: 7 * k, bottom: -6 * k, far: 30 * k });
      key.shadow.camera.updateProjectionMatrix(); key.position.set(4 * k, 10 * k, 6 * k);
    }
    const walk = { on: false }; // holder walk mode state (see 'walk mode' below)
    let rowLayout = false; // phones: statues in a row behind the tank, so the scene can be framed tighter
    function signMode(row) { // row layout: boards go straight up above the heads so neighbours never overlap
      signs.forEach(s => {
        if (row) { s.g.position.set(s.slot === 3 ? 0.75 : s.slot === 5 ? -0.75 : 0, 0.22, -0.4); // the outermost (ape, sad guy) boards lean inward so it stays on screen
          s.g.rotation.y = 0; setLimb(s.post, V(0, 0, 0), V(0, 3.3, 0)); s.arm.visible = false; s.board.position.set(0, 3.6, 0); s.baseY = 3.6; }
        else { s.g.position.set(s.x, 0.22, s.z); s.g.rotation.y = s.rotY; setLimb(s.post, V(0, 0, 0), V(0, 2.5, 0)); s.arm.visible = true; s.board.position.set(s.offX, 2.78, 0); s.baseY = 2.78; }
      });
    }
    function layoutStatues() {
      if (signs.length) signMode(rowLayout);
      const { ts, fs } = G, s = SC * fs;
      statues.forEach(st => st.scale.setScalar(s * st.userData.k));
      mug.position.set(-(2.5 * ts) + 0.2, 0, 1.5 * ts + 0.6); mug.rotation.y = -0.6;
      books.position.set(2.5 * ts - 0.4, 0, 1.5 * ts + 0.7); books.rotation.y = 0.25;
      const place = (i, x, z, r, y = 0) => { statues[i].position.set(x, y, z); statues[i].rotation.y = r; statues[i].userData.baseRot = r; };
      let rx, zf;
      if (rowLayout) {
        const z = -(1.5 * ts + 1.25 * fs), dx = 2.5 * fs;
        place(0, -dx, z, 0.15); place(1, 0.15 * fs, z - 0.35 * fs, 0); place(2, dx, z, -0.2);
        // crowd around the row; the outer ones may be cropped on narrow screens
        place(3, -(dx + 2.15 * fs), z + 1.1 * fs, 0.35); place(4, dx + 2.15 * fs, z + 1.1 * fs, -0.35);
        place(7, -(dx + 4.3 * fs), z + 0.2 * fs, 0.4); place(12, dx + 4.3 * fs, z + 0.2 * fs, -0.4);
        place(8, -(2.5 * ts + 0.95 * fs), 1.5 * ts + 1.3 * fs, 0.3); place(10, 2.5 * ts + 0.95 * fs, 1.5 * ts + 1.3 * fs, -0.3);
        place(9, -(2.5 * ts + 3.0 * fs), 1.5 * ts + 0.5 * fs, 0.45); place(11, 2.5 * ts + 3.0 * fs, 1.5 * ts + 0.5 * fs, -0.45);
        rx = dx + 3.6 * fs; zf = z - 1.3 * fs;
      } else {
        const xs = 2.5 * ts, zm = -1.6 - (ts - 1) * 0.9;
        place(0, -(xs + 1.35 * fs), zm, 0.45); place(1, 0.2 * fs, -(1.5 * ts + 1.8 * fs), 0); place(2, xs + 1.35 * fs, zm, -0.5);
        place(3, -(xs + 3.2 * fs), 0.6 * ts + 0.3 * fs, 0.55); place(4, xs + 3.4 * fs, 0.6 * ts + 0.3 * fs, -0.55);
        place(7, -(xs + 6.3 * fs), -(0.2 * ts + 0.6 * fs), 0.7); place(12, xs + 6.3 * fs, -(0.2 * ts + 0.6 * fs), -0.7);
        // front row: small figures beside the tank front
        place(8, -(xs + 1.45 * fs), 1.5 * ts + 1.4 * fs, 0.3); place(10, xs + 1.45 * fs, 1.5 * ts + 1.4 * fs, -0.3);
        place(9, -(xs + 4.9 * fs), 1.5 * ts + 1.1 * fs, 0.5); place(11, xs + 5.0 * fs, 1.5 * ts + 1.1 * fs, -0.5);
        rx = xs + 5.7 * fs; zf = -(1.5 * ts + 1.6 * fs);
      }
      // risers (left/right); lx > 0 = toward the centre
      risers.forEach(r => { r.position.set(r.userData.sd * rx, 0, zf); r.scale.setScalar(fs); });
      const onRiser = (i, sd, lx, tier, rot) => place(i, sd * rx - sd * lx * fs, zf - (tier === 1 ? 0.8 : 2.4) * fs, rot, (tier === 1 ? 0.8 : 1.6) * fs);
      onRiser(5, -1, 2.0, 1, 0.35); onRiser(14, -1, 1.5, 2, 0.3); onRiser(13, -1, -1.5, 2, 0.45);
      onRiser(6, 1, 0.9, 1, -0.35); onRiser(15, 1, -2.4, 1, -0.4); onRiser(16, 1, -0.8, 2, -0.3); // right side: outer spots (the squirrel tail covers the inner ones)
      // wall + chart screen behind the statues, above the sign tops
      const wallZ = zf - 3.45 * fs;
      const sScale = (rowLayout ? 1.25 : 1.25) * (0.75 + 0.25 * fs), bottom = rowLayout ? 5.6 * fs + 0.2 : 4.1 * fs + 0.2;
      backWall.position.z = wallZ - 0.06;
      screen.scale.setScalar(sScale); screen.position.set(0, bottom + (SH / 2 + 0.15) * sScale, wallZ);
      // posters beside the screen, shelves further out (same scale family as the screen)
      const hw = (SW / 2 + 0.15) * sScale, cy = screen.position.y, dk = 0.75 + 0.25 * fs;
      posters.forEach((p, i) => { const sd = i ? 1 : -1; p.scale.setScalar(dk); p.position.set(sd * (hw + 1.7 * dk), cy + 0.2 * dk, wallZ + 0.05); });
      shelves.forEach((s, i) => { const sd = i ? 1 : -1; s.scale.setScalar(dk); s.position.set(sd * (hw + 4.6 * dk), cy - 1.3 * dk, wallZ); });
      banner.scale.setScalar(sScale); banner.position.set(0, cy + (SH / 2 + 1.05) * sScale, wallZ + 0.1);
      rimLights.forEach(l => { l.position.set(l.userData.sd * (hw + 3.5 * dk), cy - 0.5, wallZ + 3.5 * dk); l.distance = 16 * dk; });
      updatePedestals();
      framingDirty = true;
    }
    // sparkle burst for level ups
    const SPARK = 90, sparkPos = new Float32Array(SPARK * 3), sparkVel = new Float32Array(SPARK * 3), sparkCol = new Float32Array(SPARK * 3);
    const sparkGeo = new T.BufferGeometry();
    sparkGeo.setAttribute("position", new T.BufferAttribute(sparkPos, 3)); sparkGeo.setAttribute("color", new T.BufferAttribute(sparkCol, 3));
    const sparkMat = new T.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0, depthWrite: false, blending: T.AdditiveBlending });
    const sparks = new T.Points(sparkGeo, sparkMat); sparks.frustumCulled = false; scene.add(sparks);
    let sparkLife = 0;
    const SPARK_COLS = [new T.Color(0xffd23f), new T.Color(0xff6fa3), new T.Color(0x7fe3cf), new T.Color(0xffffff)];
    function sparkleBurst() {
      const cy = 2.2 * G.th;
      for (let i = 0; i < SPARK; i++) {
        sparkPos.set([(Math.random() - 0.5) * 5 * G.ts, cy * (0.4 + Math.random() * 0.6), (Math.random() - 0.5) * 3 * G.ts], i * 3);
        const a = Math.random() * 6.283, sp = 1.5 + Math.random() * 3;
        sparkVel.set([Math.cos(a) * sp, 2 + Math.random() * 4, Math.sin(a) * sp], i * 3);
        const c = SPARK_COLS[i % 4]; sparkCol.set([c.r, c.g, c.b], i * 3);
      }
      sparkGeo.attributes.color.needsUpdate = true; sparkLife = 1;
    }

    /* ---------- motion ---------- */
    let ang = 0.3, blinkT = 2 + Math.random() * 3, blink = 0;
    const tmp = new T.Vector3();
    function update(dt, t) {
      // ease toward the target size: grow over a few seconds, shrink slower
      const dG = growTarget - grow;
      if (Math.abs(dG) > 0.0005) { grow += dG * Math.min(1, dt * (dG > 0 ? 0.9 : 0.3)); applyGrowth(); }
      const SURFw = SURF * G.th, ws = G.ws, GAPw = GAP * ws;
      const BXw = (TW / 2) * G.ts - 0.42 * ws, BZw = (TD / 2) * G.ts - 0.38 * ws;
      const wig = brain.wiggle, sulk = brain.sulk, glow = brain.glow, sun = brain.sunshine == null ? 0.5 : brain.sunshine;
      const speed = Math.max(0.15, 0.45 + wig * 1.5 - sulk * 0.45) * (0.8 + 0.4 * ws);
      const hp = pts[0];
      let target = null, best = 1e9;
      if (brain.appetite > 0.25) crumbs.forEach(c => { if (c.landed && !c.eat) { const d = Math.hypot(c.m.position.x - hp.x, c.m.position.z - hp.z); if (d < best) { best = d; target = c; } } });
      let want = ang + Math.sin(t * 0.7) * 0.6 + Math.sin(t * 2.3) * 0.5 * wig;
      if (target) want = Math.atan2(target.m.position.z - hp.z, target.m.position.x - hp.x);
      if (walk.on && walk.call) { const dx = walk.call.x - hp.x, dz = walk.call.z - hp.z; if (dx * dx + dz * dz > 0.15) want = Math.atan2(dz, dx); }
      if (Math.abs(hp.x) > BXw - 0.3 * ws || Math.abs(hp.z) > BZw - 0.25 * ws) want = Math.atan2(-hp.z * 1.6, -hp.x);
      const d = ((want - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      ang += clamp(d, -2.6 * dt, 2.6 * dt);
      hp.x = clamp(hp.x + Math.cos(ang) * speed * dt, -BXw, BXw); hp.z = clamp(hp.z + Math.sin(ang) * speed * dt, -BZw, BZw);
      for (let i = 1; i < NMAX; i++) {
        const p = pts[i], q = pts[i - 1], a = Math.atan2(p.z - q.z, p.x - q.x);
        p.x = q.x + Math.cos(a) * GAPw; p.z = q.z + Math.sin(a) * GAPw;
      }
      for (let i = 0; i < N; i++) {
        const wave = Math.sin(t * (3 + wig * 5) - i * 0.55) * 0.045 * ws * (0.3 + wig);
        segs[i].position.set(pts[i].x, SURFw + radii[i] * 0.82 + Math.max(0, wave) - sulk * 0.02 * ws, pts[i].z);
      }
      const fwd = tmp.set(Math.cos(ang), 0, Math.sin(ang));
      const bob = Math.sin(t * (4 + wig * 6)) * 0.05 * wig * ws;
      head.position.set(hp.x + fwd.x * 0.16 * ws, SURFw + (HR * 0.95 + 0.06 - sulk * 0.08) * ws + bob, hp.z + fwd.z * 0.16 * ws);
      head.lookAt(head.position.x + fwd.x, head.position.y - sulk * 0.35 + 0.05, head.position.z + fwd.z);
      head.rotateZ(Math.sin(t * 3) * 0.12 * wig);
      blinkT -= dt; if (blinkT < 0) { blink = 1; blinkT = 2.5 + Math.random() * 4; }
      blink = Math.max(0, blink - dt * 7);
      const lidOpen = lerp(-1.45, 0.05, clamp((sulk - 0.3) / 0.4));
      lids.forEach(l => { l.rotation.x = lerp(lidOpen, 0.85, blink); });
      smile.rotation.z = sulk > 0.55 ? 0 : Math.PI; smile.position.y = sulk > 0.55 ? -0.11 : -0.06;
      const em = 0.03 + glow * 0.22;
      skins.forEach(s => { s.emissiveIntensity = lerp(s.emissiveIntensity, em, 0.05); });
      skinA.color.copy(PINK).lerp(DULL, sulk * 0.6); skinB.color.copy(PINK2).lerp(DULL, sulk * 0.6); skinH.color.copy(PINKH).lerp(DULL, sulk * 0.5);
      wormLight.position.copy(head.position).y += 0.4 * ws; wormLight.distance = 3.5 * ws; wormLight.intensity = 0.2 + glow * 2.2;
      key.intensity = lerp(key.intensity, 0.6 + sun * 0.5, 0.03);
      warm.intensity = lerp(warm.intensity, 0.7 + sun * 1.4, 0.03);
      sandM.emissiveIntensity = lerp(sandM.emissiveIntensity, 0.03 + sun * 0.1 + glow * 0.06, 0.03);
      leaves.forEach((l, i) => { l.rotation.z = Math.sin(t * 1.2 + i) * 0.08; });
      // statues: cheer on buys, slump on sells / sulky worm
      mood.cheer = Math.max(0, mood.cheer - dt * 0.45);
      mood.slump = lerp(mood.slump, Math.max(clamp((sulk - 0.4) / 0.4), mood.slumpPulse || 0), 0.05);
      mood.slumpPulse = Math.max(0, (mood.slumpPulse || 0) - dt * 0.35);
      if (updateSigns(t)) mood.cheer = Math.max(mood.cheer, 0.8); // statues cheer while the signs flip
      statues.forEach(s => { if (!s.visible) return; const n = s.userData.near || 0;
        if (!n) { s.userData.update(t, mood); return; }
        const pm = s.userData.pm || (s.userData.pm = { cheer: 0, slump: 0 }); pm.cheer = Math.max(mood.cheer, 0.75 * n); pm.slump = mood.slump * (1 - n); s.userData.update(t, pm); });
      // crumbs fall in from above the open tank
      for (let i = crumbs.length - 1; i >= 0; i--) {
        const c = crumbs[i], p = c.m.position;
        if (!c.landed) {
          c.vy -= 9.8 * dt; p.y += c.vy * dt; c.m.rotation.x += dt * 4; c.m.rotation.y += dt * 3;
          if (p.y < SURFw + 0.07) { p.y = SURFw + 0.07; c.vy *= -0.35; if (Math.abs(c.vy) < 0.6) c.landed = true; }
        } else p.y = SURFw + 0.07 + Math.sin(t * 2 + i) * 0.01;
        if (c.eat) { c.eat -= dt * 5; c.m.scale.setScalar(Math.max(0.01, c.eat) * Math.sqrt(G.ws)); if (c.eat <= 0) { scene.remove(c.m); crumbs.splice(i, 1); } continue; }
        if (c.landed && Math.hypot(p.x - head.position.x, p.z - head.position.z) < 0.32 * ws) { c.eat = 1; onEat && onEat(); }
      }
      for (let i = 0; i < SALT; i++) {
        const g = grains[i];
        if (g.life <= 0) { dm.position.set(0, -9, 0); dm.scale.setScalar(0.0001); }
        else {
          if (g.y > SURFw + 0.025) { g.vy -= 12 * dt; g.y = Math.max(SURFw + 0.025, g.y + g.vy * dt); } else g.life -= dt * 0.25;
          dm.position.set(g.x, g.y, g.z); dm.rotation.set(g.rx, g.rx * 2, 0); dm.scale.setScalar(clamp(g.life * 1.5));
        }
        dm.updateMatrix(); salt.setMatrixAt(i, dm.matrix);
      }
      salt.instanceMatrix.needsUpdate = true;
      for (let i = hearts.length - 1; i >= 0; i--) {
        const h = hearts[i]; h.life -= dt * 0.6; h.s.position.y += dt * 0.6; h.s.material.opacity = clamp(h.life);
        if (h.life <= 0) { scene.remove(h.s); h.s.material.dispose(); hearts.splice(i, 1); }
      }
      if (sparkLife > 0) {
        sparkLife = Math.max(0, sparkLife - dt * 0.45); sparkMat.opacity = Math.min(1, sparkLife * 1.6);
        for (let i = 0; i < SPARK; i++) { sparkVel[i * 3 + 1] -= 5 * dt; for (let a = 0; a < 3; a++) sparkPos[i * 3 + a] += sparkVel[i * 3 + a] * dt; }
        sparkGeo.attributes.position.needsUpdate = true; sparkMat.size = 0.16 * G.fs;
      }
      if (walk.on) { walkUpdate(dt, t); return; }
      // gentle back-and-forth auto orbit inside the azimuth limits (desktop only)
      if (!rowLayout) {
        const az = controls.getAzimuthalAngle();
        if (az > 0.3) controls.autoRotateSpeed = Math.abs(controls.autoRotateSpeed);
        if (az < -0.3) controls.autoRotateSpeed = -Math.abs(controls.autoRotateSpeed);
        if (!controls.autoRotate && performance.now() - lastTouch > 5000) controls.autoRotate = true;
      }
      frame(dt);
      controls.update();
    }

    /* ---------- framing, size, visibility, loop ---------- */
    let fitDist = 13, userZoom = 1, aspect = 1;
    const tv = () => Math.tan(T.MathUtils.degToRad(camera.fov / 2));
    let dragging = false; controls.addEventListener("start", () => { dragging = true; });
    controls.addEventListener("end", () => { dragging = false; userZoom = clamp(camera.position.distanceTo(controls.target) / fitDist, 0.55, 1.3); });
    const tgt = new T.Vector3();
    // Fit = smallest camera distance at which every object's bounding-box corners are inside the view.
    const fitPts = [], box = new T.Box3(), fitObjs = () => rowLayout ? [tank, ...statues.slice(0, 3), mug, books, bezelEdge] : [tank, ...statues, mug, books, bezelEdge, banner, ...risers];
    function collectPoints() {
      fitPts.length = 0;
      fitObjs().forEach(o => { o.updateMatrixWorld(true); box.setFromObject(o);
        for (let i = 0; i < 8; i++) fitPts.push(V(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z)); });
    }
    const dirFor = az => { const el = rowLayout ? 0.4 : 0.26; return V(Math.sin(az), el, Math.cos(az)).normalize(); };
    function distFor(dir, center, shift) {
      const tvv = tv() * 0.94, th = tvv * aspect, f = dir.clone().negate(), r = new T.Vector3().crossVectors(f, V(0, 1, 0)).normalize(), u = new T.Vector3().crossVectors(r, f);
      let D = 0; const ext = [Infinity, -Infinity, Infinity, -Infinity];
      for (let pass = 0; pass < 2; pass++) {
        if (pass) { ext.fill(0); ext[0] = Infinity; ext[1] = -Infinity; ext[2] = Infinity; ext[3] = -Infinity; }
        fitPts.forEach(p => { const q = p.clone().sub(center), x = q.dot(r), y = q.dot(u), z = q.dot(f);
          if (!pass) D = Math.max(D, Math.abs(x) / th - z, Math.abs(y) / tvv - z);
          else { const d = D + z; ext[0] = Math.min(ext[0], x / d); ext[1] = Math.max(ext[1], x / d); ext[2] = Math.min(ext[2], y / d); ext[3] = Math.max(ext[3], y / d); } });
        if (pass) { // recentre on the projected extents, then measure again
          center.addScaledVector(r, (ext[0] + ext[1]) / 2 * D).addScaledVector(u, (ext[2] + ext[3]) / 2 * D);
          D = 0; fitPts.forEach(p => { const q = p.clone().sub(center); D = Math.max(D, Math.abs(q.dot(r)) / th - q.dot(f), Math.abs(q.dot(u)) / tvv - q.dot(f)); });
        }
      }
      if (shift) shift.copy(center);
      return D;
    }
    const G_MAX = { ts: 2.0, th: 1.6, fs: 1.6 }; // size at level 8 (later levels add only a little)
    function framing() {
      if (framingDirty) {
        collectPoints(); framingDirty = false;
        box.makeEmpty(); fitPts.forEach(p => box.expandByPoint(p));
        const c0 = box.getCenter(new T.Vector3());
        const azs = rowLayout ? [0] : [-0.3, 0, 0.3];
        fitCur = 0; azs.forEach(az => { const c = c0.clone(); const d = distFor(dirFor(az), c, az === 0 ? tgt : null); fitCur = Math.max(fitCur, d); });
      }
      // partial compensation: the camera backs off less than the scene grows, so growth stays visible
      fitDist = fitCur * Math.pow((G_MAX.ts + G_MAX.fs) / (G.ts + G.fs), 0.4);
    }
    function frame(dt) {
      framing();
      controls.target.lerp(tgt, Math.min(1, dt * 3));
      const dir = camera.position.clone().sub(controls.target).normalize();
      const want = fitDist * userZoom, cur = camera.position.distanceTo(controls.target);
      if (Math.abs(want - cur) > 0.01 && !dragging) camera.position.copy(controls.target).addScaledVector(dir, lerp(cur, want, Math.min(1, dt * 3)));
      controls.minDistance = fitDist * 0.55; controls.maxDistance = fitDist * 1.3;
      scene.fog.near = fitDist * 1.6; scene.fog.far = fitDist * 3.2;
    }
    function resize() {
      const w = stage.clientWidth || 600, h = stage.clientHeight || w; aspect = w / h;
      renderer.setSize(w, h, false); camera.aspect = aspect; camera.updateProjectionMatrix();
      if (walk.on) return; // walk mode keeps the room layout and its own follow camera
      const wasRow = rowLayout; rowLayout = aspect < 0.95 || w < 560;
      if (rowLayout) { controls.autoRotate = false; controls.minAzimuthAngle = -0.45; controls.maxAzimuthAngle = 0.45; }
      else { controls.minAzimuthAngle = -0.5; controls.maxAzimuthAngle = 0.5; }
      if (wasRow !== rowLayout || !resize.done) layoutStatues();
      framingDirty = true; framing(); controls.target.copy(tgt);
      const dir = camera.position.clone().sub(controls.target);
      if (!resize.done || dir.lengthSq() < 0.01) dir.copy(dirFor(0));
      camera.position.copy(controls.target).addScaledVector(dir.normalize(), fitDist * userZoom);
      resize.done = true;
    }
    applyGrowth();
    resize();
    if (window.ResizeObserver) new ResizeObserver(resize).observe(stage); else addEventListener("resize", resize);
    let visible = true;
    if (window.IntersectionObserver) new IntersectionObserver(es => { visible = es[0].isIntersecting; }).observe(stage);

    // adaptive quality: step down (pixel ratio, then shadows) if the device can't keep up
    // lightweight stats for testing (draw calls / object counts), read via stage.__squirmStats
    const stats = stage.__squirmStats = { calls: 0, tris: 0, get meshes() { let n = 0; scene.traverse(o => { if (o.isMesh) n++; }); return n; }, get quality() { return quality; }, get player() { return walk.on ? [P.x, P.y, P.z].map(v => +v.toFixed(2)) : null; }, get near() { return statues.map(s => +(s.userData.near || 0).toFixed(2)).join(","); }, get figs() { return statues.map(s => { let n = 0; s.traverse(o => { if (o.isMesh) n++; }); return n; }).join(","); } };
    const clock = new T.Clock();
    let elapsed = 0, qFrames = 0, qTime = 0, quality = 2;
    function degrade() {
      quality--;
      if (quality === 1) renderer.setPixelRatio(1);
      if (quality === 0) { rimLights.forEach(l => { l.intensity = 0; }); if (coarse && !NO_LOD) { statues.forEach((s, i) => { if (CROWD_BACK.has(i)) s.visible = false; }); updatePedestals(); } key.castShadow = false; renderer.shadowMap.enabled = false; scene.traverse(o => { if (o.material) o.material.needsUpdate = true; }); }
    }
    renderer.setAnimationLoop(() => {
      const raw = clock.getDelta(), dt = Math.min(raw, 0.1);
      if (!visible || document.hidden) return;
      if (quality > 0 && raw < 1) { qFrames++; qTime += raw; if (qTime > 2.5) { if (qFrames / qTime < 40) degrade(); qFrames = 0; qTime = 0; } }
      elapsed += dt; update(dt, elapsed); renderer.render(scene, camera);
      stats.calls = renderer.info.render.calls; stats.tris = renderer.info.render.triangles;
    });


    /* ======================================================================
       WALK MODE (holders): a room around the scene, a little worm-buddy avatar,
       third-person follow camera, keyboard / mouse / touch controls,
       simple circle + box collision, speech bubbles, floor snacks.
       ====================================================================== */
    const ROOM = { x: 23.4, zFront: 10.4, ceil: 17 };
    // room shell (only visible in walk mode so the overview stays as it was)
    const shell = new T.Group(); shell.visible = false; scene.add(shell);
    {
      const wallM = M(0x0f4a45, 0.95), ceilM = M(0x0c3936, 0.95), stripeM = M(0x7fe3cf, 0.4), lampM = new T.MeshBasicMaterial({ color: 0xfff6e0 });
      const parts = new T.Group();
      [-1, 1].forEach(sd => { const w = new T.Mesh(new T.BoxGeometry(0.4, 18, 40), wallM); w.position.set(sd * 24.2, 9, -9); parts.add(w);
        const s = new T.Mesh(new T.BoxGeometry(0.1, 0.12, 40), stripeM); s.position.set(sd * 23.98, 1.2, -9); parts.add(s); });
      const fw = new T.Mesh(new T.BoxGeometry(49, 18, 0.4), wallM); fw.position.set(0, 9, 11.2); parts.add(fw);
      const fs2 = new T.Mesh(new T.BoxGeometry(48, 0.12, 0.1), stripeM); fs2.position.set(0, 1.2, 10.98); parts.add(fs2);
      const ce = new T.Mesh(new T.BoxGeometry(49, 0.4, 40), ceilM); ce.position.set(0, ROOM.ceil + 0.2, -9); parts.add(ce);
      for (let ix = -1; ix <= 1; ix++) for (let iz = 0; iz < 3; iz++) { const l = new T.Mesh(new T.BoxGeometry(5, 0.08, 1.4), lampM); l.position.set(ix * 13, ROOM.ceil - 0.05, 6 - iz * 9); parts.add(l); }
      bakeStatic(parts); parts.children.forEach(c => { c.receiveShadow = true; }); shell.add(parts);
    }
    // the player: a little upright worm-buddy
    const player = new T.Group(); player.visible = false; scene.add(player);
    const pBody = new T.Group(); player.add(pBody);
    const pPink = M(0xff6fa3, 0.4), pPink2 = M(0xe0367a, 0.45), pMint = M(0x7fe3cf, 0.4);
    const pSegs = [[0.32, 0.36, pPink2], [0.78, 0.33, pPink], [1.2, 0.3, pPink2]].map(([y, r, m]) => ball(pBody, m, [0, y, 0], r));
    const pHead = new T.Group(); pHead.position.y = 1.62; pBody.add(pHead);
    ball(pHead, pPink, [0, 0, 0], 0.42);
    [-1, 1].forEach(sd => { ball(pHead, whiteM, [0.15 * sd, 0.07, 0.33], 0.12).castShadow = false; ball(pHead, ink, [0.15 * sd, 0.06, 0.42], 0.075).castShadow = false; ball(pHead, shineM, [0.15 * sd - 0.03, 0.1, 0.48], 0.025).castShadow = false; ball(pHead, M(0xff3d7f, 0.6), [0.28 * sd, -0.08, 0.3], [0.06, 0.035, 0.03]).castShadow = false; });
    const pSmile = new T.Mesh(new T.TorusGeometry(0.08, 0.018, 5, 12, Math.PI), ink); pSmile.rotation.z = Math.PI; pSmile.position.set(0, -0.1, 0.4); pHead.add(pSmile);
    const sprout = limb(pHead, pMint, 0.03); setLimb(sprout, V(0, 0.38, 0), V(0.05, 0.68, 0)); ball(pHead, pMint, [0.05, 0.72, 0], [0.12, 0.08, 0.12]);
    const pFeet = [-1, 1].map(sd => ball(player, pPink2, [0.17 * sd, 0.06, 0.08], [0.13, 0.07, 0.18]));
    const P = { x: 0, y: 0, z: 8, vy: 0, heading: Math.PI, ground: true, walkT: 0, land: 0 };
    const cam = { yaw: 0, pitch: 0.32, dist: 7.2, pos: new T.Vector3(), look: new T.Vector3() };
    const PR = 0.45, STEP = 0.42, GRAV = 22, JUMP = 8.2;
    const input = { keys: {}, jx: 0, jy: 0, jump: false, run: false };

    // floor snacks to collect (one instanced draw call)
    const NSNACK = 10, snackInst = new T.InstancedMesh(crumbGeo, crumbMat, NSNACK);
    snackInst.visible = false; snackInst.castShadow = !coarse; scene.add(snackInst);
    const snacks = Array.from({ length: NSNACK }, () => ({ x: 0, z: 0, on: false, back: 0 }));
    let snackCount = 0;

    // figure lines (our own text; no prices, no promises)
    const LINES = ["just vibing next to the tank.", "feels good to be here, fren.", "nuts for the worm!", "much tank. very wiggle.", "the hat stays on.", "POP! welcome in!",
      "huddle up, worm gang!", "shades on, stress off.", "pfft... oh hi there!", "*happy little hippo noises*", "page one: feed the worm.", "to the great hall... I mean, the tank!",
      "bonk! no paper hands in here.", "baa. greatest of all tanks.", "too cool to blink.", "...okay, this room is actually nice.", "hey fren! jump on the steps!"];

    // HUD (built on first use)
    let hud = null;
    function buildHud() {
      hud = document.createElement("div"); hud.className = "walkhud";
      hud.innerHTML = `<button class="wexit" type="button">Exit room</button>
        <div class="wcount">snacks found <b>0</b></div>
        <div class="whint">${coarse ? "left stick to walk · drag to look · jump button" : "WASD / arrows to walk · drag to look · Shift run · Space jump"}</div>
        <div class="wbubble" hidden></div>
        <div class="wjoy" aria-label="move"><i></i></div><button class="wjump" type="button" aria-label="jump">jump</button>`;
      stage.appendChild(hud);
      hud.querySelector(".wexit").addEventListener("click", () => { exitWalk(); walk.onExit && walk.onExit(); });
      const joy = hud.querySelector(".wjoy"), knob = joy.querySelector("i");
      let jid = null, jc = null;
      joy.addEventListener("pointerdown", e => { jid = e.pointerId; const r = joy.getBoundingClientRect(); jc = [r.left + r.width / 2, r.top + r.height / 2]; joy.setPointerCapture(e.pointerId); moveJoy(e); e.preventDefault(); });
      const moveJoy = e => { if (e.pointerId !== jid) return; const R = 46; let dx = e.clientX - jc[0], dy = e.clientY - jc[1]; const l = Math.hypot(dx, dy); if (l > R) { dx *= R / l; dy *= R / l; }
        knob.style.transform = `translate(${dx}px,${dy}px)`; input.jx = dx / R; input.jy = -dy / R; input.run = l > R * 0.95; };
      joy.addEventListener("pointermove", moveJoy);
      const endJoy = e => { if (e.pointerId !== jid) return; jid = null; input.jx = input.jy = 0; input.run = false; knob.style.transform = ""; };
      joy.addEventListener("pointerup", endJoy); joy.addEventListener("pointercancel", endJoy);
      const jb = hud.querySelector(".wjump"); jb.addEventListener("pointerdown", e => { input.jump = true; e.preventDefault(); });
    }
    // look: drag on the canvas (mouse or finger)
    let lookId = null, lookLast = null;
    renderer.domElement.addEventListener("pointerdown", e => { if (!walk.on) return; lookId = e.pointerId; lookLast = [e.clientX, e.clientY]; });
    addEventListener("pointermove", e => { if (!walk.on || e.pointerId !== lookId) return;
      cam.yaw -= (e.clientX - lookLast[0]) * 0.006; cam.pitch = clamp(cam.pitch + (e.clientY - lookLast[1]) * 0.004, 0.05, 1.1); lookLast = [e.clientX, e.clientY]; });
    addEventListener("pointerup", e => { if (e.pointerId === lookId) lookId = null; });
    renderer.domElement.addEventListener("wheel", e => { if (walk.on) { cam.dist = clamp(cam.dist + e.deltaY * 0.005, 3.5, 11); e.preventDefault(); } }, { passive: false });
    const KEYMAP = { KeyW: "f", ArrowUp: "f", KeyS: "b", ArrowDown: "b", KeyA: "l", ArrowLeft: "l", KeyD: "r", ArrowRight: "r" };
    addEventListener("keydown", e => { if (!walk.on) return; if (KEYMAP[e.code]) { input.keys[KEYMAP[e.code]] = true; e.preventDefault(); }
      if (e.code === "Space") { input.jump = true; e.preventDefault(); } if (e.key === "Shift") input.run = true; if (e.code === "Escape") { exitWalk(); walk.onExit && walk.onExit(); } });
    addEventListener("keyup", e => { if (KEYMAP[e.code]) input.keys[KEYMAP[e.code]] = false; if (e.key === "Shift") input.run = false; });
    addEventListener("blur", () => { input.keys = {}; input.run = false; });

    // collision world, rebuilt each frame from the current (growing) layout: circles + boxes
    function obstacles() {
      const circ = [], boxes = [];
      statues.forEach(s => { if (!s.visible) return; const k = s.scale.x; circ.push({ x: s.position.x, z: s.position.z, r: s.userData.ped.r * k * 1.02, i: statues.indexOf(s) }); });
      circ.push({ x: mug.position.x, z: mug.position.z, r: 0.42 }, { x: books.position.x, z: books.position.z, r: 0.75 });
      boxes.push({ x0: -2.5 * G.ts - 0.08, x1: 2.5 * G.ts + 0.08, z0: -1.5 * G.ts - 0.08, z1: 1.5 * G.ts + 0.08, top: TH * G.th + 0.2, tank: true });
      risers.forEach(r => { const f = r.scale.x, x = r.position.x, z = r.position.z;
        boxes.push({ x0: x - 3.2 * f, x1: x + 3.2 * f, z0: z - 1.6 * f, z1: z, top: 0.8 * f }, { x0: x - 3.2 * f, x1: x + 3.2 * f, z0: z - 3.2 * f, z1: z - 1.6 * f, top: 1.6 * f }); });
      return { circ, boxes };
    }
    function collide(w) {
      let ground = 0;
      w.boxes.forEach(b => {
        const cx = clamp(P.x, b.x0, b.x1), cz = clamp(P.z, b.z0, b.z1), dx = P.x - cx, dz = P.z - cz, d = Math.hypot(dx, dz);
        if (b.top <= P.y + STEP && !b.tank) { if (d < PR * 0.6) ground = Math.max(ground, b.top); return; } // walkable top
        if (d >= PR) return;
        if (d > 1e-4) { P.x = cx + dx / d * PR; P.z = cz + dz / d * PR; }
        else { const pen = [[P.x - b.x0, -1, 0], [b.x1 - P.x, 1, 0], [P.z - b.z0, 0, -1], [b.z1 - P.z, 0, 1]].sort((a, c) => a[0] - c[0])[0]; P.x += pen[1] * (pen[0] + PR); P.z += pen[2] * (pen[0] + PR); }
      });
      w.circ.forEach(c => { const dx = P.x - c.x, dz = P.z - c.z, d = Math.hypot(dx, dz), m = c.r + PR; if (d < m && d > 1e-4) { P.x = c.x + dx / d * m; P.z = c.z + dz / d * m; } });
      const wallZ = backWall.position.z + 0.5;
      P.x = clamp(P.x, -ROOM.x, ROOM.x); P.z = clamp(P.z, wallZ, ROOM.zFront);
      return ground;
    }
    function freeSpot(w) {
      for (let k = 0; k < 60; k++) {
        const x = (Math.random() * 2 - 1) * (ROOM.x - 2), z = backWall.position.z + 2 + Math.random() * (ROOM.zFront - backWall.position.z - 3);
        if (w.boxes.some(b => x > b.x0 - 1 && x < b.x1 + 1 && z > b.z0 - 1 && z < b.z1 + 1)) continue;
        if (w.circ.some(c => Math.hypot(x - c.x, z - c.z) < c.r + 1)) continue;
        return [x, z];
      }
      return [0, 8];
    }
    const _p = new T.Vector3(), _m = new T.Object3D();
    function walkUpdate(dt, t) {
      const w = obstacles();
      // movement in camera space
      let ix = (input.keys.r ? 1 : 0) - (input.keys.l ? 1 : 0) + input.jx, iy = (input.keys.f ? 1 : 0) - (input.keys.b ? 1 : 0) + input.jy;
      const il = Math.hypot(ix, iy); if (il > 1) { ix /= il; iy /= il; }
      const sp = (input.run ? 8.5 : 4.6) * Math.min(1, il);
      const fx = -Math.sin(cam.yaw), fz = -Math.cos(cam.yaw), rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
      const mx = (fx * iy + rx * ix), mz = (fz * iy + rz * ix);
      if (il > 0.05) {
        P.x += mx / Math.max(1e-4, Math.hypot(mx, mz)) * sp * dt; P.z += mz / Math.max(1e-4, Math.hypot(mx, mz)) * sp * dt;
        const want = Math.atan2(mx, mz), d = ((want - P.heading + Math.PI * 3) % (Math.PI * 2)) - Math.PI; P.heading += d * Math.min(1, dt * 10);
        P.walkT += dt * sp * 1.6;
      }
      const ground = collide(w);
      if (input.jump && P.ground) { P.vy = JUMP; P.ground = false; }
      input.jump = false;
      P.vy -= GRAV * dt; P.y += P.vy * dt;
      if (P.y <= ground) { if (!P.ground && P.vy < -4) P.land = 1; P.y = ground; P.vy = 0; P.ground = true; } else if (P.y > ground + 0.05) P.ground = false;
      // avatar pose
      player.position.set(P.x, P.y, P.z); player.rotation.y = P.heading;
      const moving = il > 0.05 && P.ground, wob = moving ? Math.sin(P.walkT) : 0;
      P.land = Math.max(0, P.land - dt * 4);
      pBody.scale.set(1 + P.land * 0.15, 1 - P.land * 0.2 + (P.ground ? 0 : 0.06), 1 + P.land * 0.15);
      pSegs.forEach((s, i) => { s.position.x = Math.sin(P.walkT - i * 0.9) * 0.06 * (moving ? 1 : 0.2); });
      pHead.position.set(Math.sin(P.walkT - 2.7) * 0.07 * (moving ? 1 : 0.2), 1.62 + Math.abs(wob) * 0.06 + Math.sin(t * 2) * 0.02, 0);
      pHead.rotation.z = Math.sin(t * 1.3) * 0.06;
      pFeet.forEach((f, i) => { f.position.z = 0.08 + (moving ? Math.sin(P.walkT + i * Math.PI) * 0.18 : 0); f.position.y = 0.06 + (moving ? Math.max(0, Math.sin(P.walkT + i * Math.PI)) * 0.08 : 0); });
      // follow camera (kept inside the room)
      const cp = Math.cos(cam.pitch), look = _p.set(P.x, P.y + 1.4, P.z);
      const want = V(look.x + Math.sin(cam.yaw) * cp * cam.dist, look.y + Math.sin(cam.pitch) * cam.dist, look.z + Math.cos(cam.yaw) * cp * cam.dist);
      want.x = clamp(want.x, -ROOM.x + 0.3, ROOM.x - 0.3); want.z = clamp(want.z, backWall.position.z + 0.5, ROOM.zFront + 0.5); want.y = clamp(want.y, 0.6, ROOM.ceil - 0.6);
      if (walk.snap) { cam.pos.copy(want); cam.look.copy(look); walk.snap = false; }
      cam.pos.lerp(want, Math.min(1, dt * 8)); cam.look.lerp(look, Math.min(1, dt * 12));
      camera.position.copy(cam.pos); camera.lookAt(cam.look);
      // nearest figure: speech bubble + wave + turn to the player
      let near = -1, nd = 1e9;
      w.circ.forEach(c => { if (c.i == null) return; const d = Math.hypot(P.x - c.x, P.z - c.z) - c.r; if (d < 2.4 && d < nd) { nd = d; near = c.i; } });
      statues.forEach((s, i) => {
        s.userData.near = lerp(s.userData.near || 0, i === near ? 1 : 0, Math.min(1, dt * 4));
        const base = s.userData.baseRot || 0, face = Math.atan2(P.x - s.position.x, P.z - s.position.z);
        const d = ((face - base + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        s.rotation.y = base + d * s.userData.near * 0.8;
      });
      const bub = hud && hud.querySelector(".wbubble");
      if (bub) {
        if (near >= 0) {
          const s = statues[near]; _p.set(s.position.x, (s.userData.top || 4) + 0.3, s.position.z).project(camera);
          if (_p.z < 1) { bub.hidden = false; if (bub.dataset.i != near) { bub.textContent = LINES[near] || "hi!"; bub.dataset.i = near; }
            bub.style.left = ((_p.x * 0.5 + 0.5) * 100).toFixed(2) + "%"; bub.style.top = ((-_p.y * 0.5 + 0.5) * 100).toFixed(2) + "%"; } else bub.hidden = true;
        } else bub.hidden = true;
      }
      // the worm swims to the glass when you come close
      const tb = w.boxes[0], gx = clamp(P.x, tb.x0, tb.x1), gz = clamp(P.z, tb.z0, tb.z1);
      walk.call = Math.hypot(P.x - gx, P.z - gz) < 2.6 ? { x: clamp(P.x, -(TW / 2) * G.ts + 0.5, (TW / 2) * G.ts - 0.5), z: clamp(P.z, -(TD / 2) * G.ts + 0.5, (TD / 2) * G.ts - 0.5) } : null;
      if (walk.call && Math.hypot(pts[0].x - walk.call.x, pts[0].z - walk.call.z) < 0.8 && (walk.heartT = (walk.heartT || 0) - dt) < 0) { walk.heartT = 1.4; vibeHeart(); }
      // snacks
      snacks.forEach((s, i) => {
        if (!s.on) { s.back -= dt; if (s.back <= 0) { [s.x, s.z] = freeSpot(w); s.on = true; } }
        else if (Math.hypot(P.x - s.x, P.z - s.z) < 0.9 && P.y < 1.5) { s.on = false; s.back = 10; snackCount++; const c = hud && hud.querySelector(".wcount b"); if (c) c.textContent = snackCount; }
        _m.position.set(s.x, s.on ? 0.45 + Math.sin(t * 2 + i) * 0.12 : -50, s.z); _m.rotation.set(t * 1.3 + i, t * 1.7, 0); _m.scale.setScalar(2.4); _m.updateMatrix(); snackInst.setMatrixAt(i, _m.matrix);
      });
      snackInst.instanceMatrix.needsUpdate = true;
    }
    function vibeHeart() {
      const s = new T.Sprite(new T.SpriteMaterial({ map: heartTex, transparent: true, depthWrite: false }));
      s.scale.setScalar(0.32 * G.ws); s.position.copy(head.position).add(V((Math.random() - 0.5) * 0.4, 0.4 * G.ws, 0));
      scene.add(s); hearts.push({ s, life: 1.3 });
    }
    function enterWalk(o = {}) {
      if (walk.on) return;
      if (!hud) buildHud();
      walk.on = true; walk.snap = true; stage.classList.add("walking"); document.body.classList.add("walking");
      hud.hidden = false; hud.classList.toggle("touch", coarse);
      controls.enabled = false; controls.autoRotate = false;
      walk.wasRow = rowLayout; rowLayout = false; layoutStatues(); updatePedestals();
      statues.forEach(s => { s.updateMatrixWorld(true); box.setFromObject(s); s.userData.top = box.max.y; });
      shell.visible = true; player.visible = true; snackInst.visible = true; mug.visible = books.visible = true;
      camera.far = 160; camera.fov = 55; scene.fog.near = 30; scene.fog.far = 90; camera.updateProjectionMatrix();
      if (coarse && quality >= 2) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      P.x = o.x ?? 0; P.z = o.z ?? 8.5; P.y = 0; P.vy = 0; P.heading = o.heading ?? Math.PI; cam.yaw = o.yaw ?? 0; cam.pitch = o.pitch ?? 0.32; cam.dist = o.dist ?? 7.2;
      snacks.forEach(s => { s.on = false; s.back = Math.random() * 0.5; });
      requestAnimationFrame(() => { resize(); walk.snap = true; });
    }
    function exitWalk() {
      if (!walk.on) return;
      walk.on = false; walk.call = null; stage.classList.remove("walking"); document.body.classList.remove("walking");
      if (hud) hud.hidden = true;
      shell.visible = false; player.visible = false; snackInst.visible = false;
      statues.forEach(s => { s.userData.near = 0; });
      controls.enabled = true; camera.fov = 40; camera.far = 80; camera.updateProjectionMatrix();
      if (quality >= 2) renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      resize.done = false; requestAnimationFrame(() => resize());
    }
    return {
      // level from the market cap (app.js). snap = jump straight there (first value on load).
      setGrowth(lv, snap) {
        const up = lv > level; level = lv; growTarget = gOf(lv);
        if (snap) { grow = growTarget; applyGrowth(); }
        else if (up) { mood.cheer = 1; sparkleBurst(); }
      },
      setChart(m) { lastChart = m; drawChart(m); },
      enterWalk, exitWalk, get walking() { return walk.on; }, set onWalkExit(f) { walk.onExit = f; },
      // test hook for screenshots (?t=SECONDS): fast-forward the simulation
      fastForward(sec) { for (let s = 0; s < sec; s += 1 / 30) { elapsed += 1 / 30; update(1 / 30, elapsed); } },
      buys(n) {
        mood.cheer = Math.min(1, mood.cheer + 0.5 + n * 0.15);
        for (let i = 0; i < n && crumbs.length < 25; i++) {
          const m = new T.Mesh(crumbGeo, crumbMat); const [x, z] = inTank((TW / 2) * G.ts - 0.5 * G.ws, (TD / 2) * G.ts - 0.5 * G.ws);
          m.scale.setScalar(Math.sqrt(G.ws)); m.position.set(x, TH * G.th + 0.6 + Math.random() * 1.2, z); m.castShadow = true; scene.add(m);
          crumbs.push({ m, vy: 0, landed: false, eat: 0 });
        }
      },
      sells(n) {
        mood.slumpPulse = Math.min(1, (mood.slumpPulse || 0) + 0.4 + n * 0.1);
        for (let k = 0; k < n * 6; k++) {
          const g = grains[saltIdx]; saltIdx = (saltIdx + 1) % SALT;
          const [x, z] = inTank((TW / 2) * G.ts - 0.15, (TD / 2) * G.ts - 0.15); Object.assign(g, { x, z, y: TH * G.th + 0.3 + Math.random() * 1.0, vy: 0, life: 1, rx: Math.random() * 3 });
        }
      },
      vibe: vibeHeart
    };
  };
})();
