import * as THREE from 'three';
import { chapters } from './chapters/index.js';
import { loadChapterAssets } from './assets.js';
import { createBystander, createCompanion, createTraveler } from './characters/rig.js';

const LOGICAL_HEIGHT = 720;
const GROUND_Y = 154;
// 前景淡出：主角左右各留多少寬度、淡到原本的幾成。
const FOREGROUND_CLEARANCE = 40;
const FOREGROUND_FADED = 0.28;
const DEPART_SECONDS = 3.4;

// 角色的繪製座標以秒為單位追上流程座標。鳥的反應較慢，會在主角停下後補位。
const TRAVELER_GLIDE = 21;
const COMPANION_GLIDE = 6;
const CHARACTER_SPEED_DAMPING = 22;
const MAX_CHARACTER_FRAME = 0.05;
const CHARACTER_STOP_DISTANCE = 0.12;
const COMPANION_GAP = 96;
const RIDE_COMPANION_GAP = 150;

function characterSample(x) {
  return { x, speed: 0, phase: 0, moving: false };
}

function glideCharacter(current, target, damping, deltaSeconds) {
  if (deltaSeconds === 0) return current;
  const next = THREE.MathUtils.damp(current, target, damping, deltaSeconds);
  return Math.abs(target - next) <= CHARACTER_STOP_DISTANCE ? target : next;
}

function disposeGroup(group) {
  group.traverse((node) => {
    if (!node.isMesh && !node.isPoints) return;
    node.geometry?.dispose();
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      if (material?.map) material.map.dispose();
      material?.dispose();
    }
  });
}

function shapeGeometry(item) {
  const { shape, width, height } = item;
  if (shape === 'ellipse' || shape === 'circle') {
    return { geometry: new THREE.CircleGeometry(0.5, 28), scale: [width, height] };
  }
  if (shape === 'triangle') {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0], 3));
    geometry.computeVertexNormals();
    return { geometry, scale: [width, height] };
  }
  if (shape === 'mountain') {
    const points = [[0, 0], [0, height * 0.34], [width * 0.15, height * 0.43], [width * 0.32, height * 0.26], [width * 0.52, height * 0.9], [width * 0.73, height * 0.33], [width * 0.88, height * 0.47], [width, height * 0.31], [width, 0]];
    const path = new THREE.Shape();
    path.moveTo(...points[0]);
    points.slice(1).forEach(([x, y]) => path.lineTo(x, y));
    path.closePath();
    return { geometry: new THREE.ShapeGeometry(path), position: 'bottom-left' };
  }
  if (shape === 'arch') {
    const radius = width / 2;
    const springY = Math.max(radius, height - radius);
    const path = new THREE.Shape();
    path.moveTo(0, 0);
    path.lineTo(0, springY);
    path.absarc(radius, springY, radius, Math.PI, 0, true);
    path.lineTo(width, 0);
    path.closePath();
    return { geometry: new THREE.ShapeGeometry(path), position: 'bottom-left' };
  }
  if (shape === 'trapezoid') {
    const path = new THREE.Shape();
    path.moveTo(-width * 0.46, -height / 2);
    path.lineTo(width * 0.46, -height / 2);
    path.lineTo(width * 0.35, height / 2);
    path.lineTo(-width * 0.35, height / 2);
    path.closePath();
    return { geometry: new THREE.ShapeGeometry(path) };
  }
  if (shape === 'roundRect') {
    const radius = Math.min(width, height) * 0.12;
    const path = new THREE.Shape();
    path.moveTo(-width / 2 + radius, -height / 2);
    path.lineTo(width / 2 - radius, -height / 2);
    path.quadraticCurveTo(width / 2, -height / 2, width / 2, -height / 2 + radius);
    path.lineTo(width / 2, height / 2 - radius);
    path.quadraticCurveTo(width / 2, height / 2, width / 2 - radius, height / 2);
    path.lineTo(-width / 2 + radius, height / 2);
    path.quadraticCurveTo(-width / 2, height / 2, -width / 2, height / 2 - radius);
    path.lineTo(-width / 2, -height / 2 + radius);
    path.quadraticCurveTo(-width / 2, -height / 2, -width / 2 + radius, -height / 2);
    return { geometry: new THREE.ShapeGeometry(path) };
  }
  return { geometry: new THREE.PlaneGeometry(width, height) };
}

function addItem(item, parent, assets, order, parentSize = null) {
  const [width, height] = [item.width, item.height];
  const asset = assets.get(item.id);
  const descriptor = asset
    ? { geometry: new THREE.PlaneGeometry(width, height) }
    : shapeGeometry(item);
  const texture = asset ? new THREE.Texture(asset) : null;
  if (texture) {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.needsUpdate = true;
  }
  const material = new THREE.MeshBasicMaterial({
    color: asset ? '#ffffff' : item.color,
    map: texture,
    // 全部走透明通道，繪製順序才會完全依 renderOrder（不透明物件會先畫，被背景貼圖蓋掉）。
    transparent: true,
    opacity: item.opacity ?? 1,
    depthTest: false,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(descriptor.geometry, material);
  const parentOffsetX = parentSize ? -parentSize.width / 2 : 0;
  const parentOffsetY = parentSize ? -parentSize.height / 2 : 0;
  if (descriptor.position === 'bottom-left') {
    mesh.position.set(item.x + parentOffsetX, item.y + parentOffsetY, order * 0.01);
  } else {
    mesh.position.set(item.x + parentOffsetX + width / 2, item.y + parentOffsetY + height / 2, order * 0.01);
    mesh.scale.set(...(descriptor.scale ?? [1, 1]), 1);
  }
  mesh.rotation.z = item.rotation ?? 0;
  mesh.renderOrder = order;
  parent.add(mesh);

  if (!asset && item.parts?.length) {
    const detailGroup = new THREE.Group();
    detailGroup.position.set(item.x + width / 2 + parentOffsetX, item.y + height / 2 + parentOffsetY, order * 0.01 + 0.012);
    parent.add(detailGroup);
    for (const [index, part] of item.parts.entries()) addItem(part, detailGroup, assets, order + index + 1, { width, height });
  }
  return mesh;
}

function makeParticleField(count, color, seed) {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const value = Math.sin((index + 1) * (seed + 12.9898)) * 43758.5453;
    const random = value - Math.floor(value);
    positions[index * 3] = random * 3600;
    positions[index * 3 + 1] = 180 + ((index * 83 + seed * 17) % 520);
    positions[index * 3 + 2] = 1;
    phases[index] = random * Math.PI * 2;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(geometry, new THREE.PointsMaterial({ color, size: 4, transparent: true, opacity: 0.56, depthWrite: false }));
  points.userData.phases = phases;
  points.userData.origin = positions.slice();
  return points;
}

export class StageRenderer {
  constructor(host, fallback, sheet) {
    this.host = host;
    this.fallback = fallback;
    // 可視寬度依舞台尺寸決定；讀題時由實際面板高度決定取景下緣。
    this.sheet = sheet;
    this.viewWidth = LOGICAL_HEIGHT;
    this.viewBottom = 0;
    this.chapter = null;
    this.assets = new Map();
    this.assetPromises = new Map();
    this.version = 0;
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.camX = 640;
    this.playerX = 640;
    this.root = null;
    this.layerGroups = [];
    this.kindnessEffects = [];
    this.contextAvailable = false;

    try {
      this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.className = 'stage-canvas';
      this.host.append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-this.viewWidth / 2, this.viewWidth / 2, LOGICAL_HEIGHT, 0, 0.1, 5000);
      this.camera.position.set(0, 0, 1000);
      this.camera.lookAt(0, 0, 0);
      this.contextAvailable = true;
      this.renderer.domElement.addEventListener('webglcontextlost', (event) => {
        event.preventDefault();
        this.contextAvailable = false;
        this.showFallback(true);
      });
      this.renderer.domElement.addEventListener('webglcontextrestored', () => {
        this.contextAvailable = true;
        if (this.chapter) this.setChapter(this.chapter.id);
      });
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onMotionChange = (event) => {
        this.reducedMotion = event.matches;
        if (this.chapter) this.setChapter(this.chapter.id);
      };
      this.motionQuery.addEventListener('change', this.onMotionChange);
      this.showFallback(false);
    } catch {
      this.renderer?.dispose();
      this.renderer?.domElement?.remove();
      this.renderer = null;
      this.contextAvailable = false;
      this.showFallback(true);
    }
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => this.resize());
      this.resizeObserver.observe(this.host);
      if (this.sheet) this.resizeObserver.observe(this.sheet, { box: 'border-box' });
    }
    this.resize();
  }

  async getAssets(chapterId) {
    if (!chapterId || chapterId > chapters.length) return new Map();
    if (this.assets.has(chapterId)) return this.assets.get(chapterId);
    if (!this.assetPromises.has(chapterId)) {
      this.assetPromises.set(chapterId, loadChapterAssets(chapterId).then((assets) => {
        this.assets.set(chapterId, assets);
        this.assetPromises.delete(chapterId);
        return assets;
      }));
    }
    return this.assetPromises.get(chapterId);
  }

  keepCurrentAndNext(currentId) {
    for (const [id] of this.assets) {
      if (id !== currentId && id !== currentId + 1) this.assets.delete(id);
    }
  }

  async setChapter(chapterId) {
    const nextChapter = chapters[chapterId - 1];
    if (!nextChapter) return;
    // 同章貼圖或場景重建時沿用角色位置；換章才重新設定站位。
    const sameChapter = this.chapter?.id === chapterId;
    if (!sameChapter) this.characterMotion = null;
    this.chapter = nextChapter;
    this.version += 1;
    const currentVersion = this.version;
    this.showFallback(!this.contextAvailable);
    this.disposeStage();
    this.applyPalette();
    if (!this.contextAvailable || !this.renderer || !this.scene) return;

    // Draw the color-block world immediately; optional registered WebP art may replace it later.
    this.buildStage(nextChapter, new Map());
    this.update({ x: sameChapter ? this.playerX : nextChapter.stops.start });
    this.resize();
    const assets = await this.getAssets(chapterId);
    if (currentVersion !== this.version) return;
    this.assets = new Map([[chapterId, assets], ...((chapterId < chapters.length && this.assets.has(chapterId + 1)) ? [[chapterId + 1, this.assets.get(chapterId + 1)]] : [])]);
    this.keepCurrentAndNext(chapterId);
    if (assets.size) {
      this.disposeStage();
      this.buildStage(nextChapter, assets);
      // 重建後立刻套用鏡頭與各層位移，避免下一格之前閃出未對位的畫面。
      this.update({ x: this.playerX });
    }
    if (chapterId < chapters.length) this.getAssets(chapterId + 1).then(() => this.keepCurrentAndNext(chapterId));
    this.applyPalette();
    this.resize();
  }

  buildStage(chapter, assets) {
    this.scene.clear();
    this.scene.background = new THREE.Color(chapter.palette.sky);
    this.root = new THREE.Group();
    this.worldRoot = new THREE.Group();
    this.root.add(this.worldRoot);
    this.scene.add(this.root);
    this.stageMeshes = new Map();
    this.departT0 = null;
    this.departing = false;
    this.layerGroups = chapter.layers.map((layer) => {
      const group = new THREE.Group();
      group.position.z = 50 - layer.depth * 8;
      group.userData.scroll = layer.scroll;
      group.userData.depth = layer.depth;
      this.worldRoot.add(group);
      for (const [index, item] of layer.items.entries()) {
        const mesh = addItem(item, group, assets, layer.depth * 100 + index * 2 + 1);
        if (item.flip) mesh.scale.x *= -1;
        // 遠景是一幅完整的畫，縮放留給取景邏輯，章節擺位表可繼續共用。
        if (layer.name === 'far' && item.id === 'background') this.backdrop = mesh;
        if (layer.name === 'stage') {
          mesh.userData.baseX = mesh.position.x;
          mesh.userData.baseY = mesh.position.y;
          mesh.userData.itemWidth = item.width;
          if (!this.stageMeshes.has(item.id)) this.stageMeshes.set(item.id, []);
          this.stageMeshes.get(item.id).push(mesh);
        }
      }
      return group;
    });

    const characterLayer = this.layerGroups.find((layer) => layer.userData.depth === 4);
    this.shadows = new THREE.Group();
    characterLayer.add(this.shadows);
    for (const [x, width, opacity] of [[0, 54, 0.2], [-COMPANION_GAP, 36, 0.15]]) {
      const shadow = new THREE.Mesh(new THREE.CircleGeometry(1, 24), new THREE.MeshBasicMaterial({ color: '#24302f', transparent: true, opacity, depthWrite: false }));
      shadow.position.set(x, GROUND_Y - 3, -5);
      shadow.scale.set(width, 11, 1);
      shadow.renderOrder = 490;
      this.shadows.add(shadow);
    }
    this.traveler = createTraveler(assets);
    this.traveler.root.position.y = GROUND_Y;
    this.traveler.baseY = GROUND_Y;
    characterLayer.add(this.traveler.root);
    this.companion = createCompanion(assets);
    this.companion.root.position.y = GROUND_Y;
    this.companion.baseY = GROUND_Y;
    characterLayer.add(this.companion.root);
    this.bystander = createBystander(assets);
    this.bystander.root.position.y = GROUND_Y;
    this.bystander.baseY = GROUND_Y;
    this.bystander.root.visible = !chapter.hideBystander;
    characterLayer.add(this.bystander.root);

    const particleCount = this.reducedMotion ? Math.ceil(chapter.ambience.particleCount / 4) : chapter.ambience.particleCount;
    this.particles = makeParticleField(particleCount, chapter.palette.warm, chapter.id);
    this.layerGroups[0].add(this.particles);
    this.kindnessEffects = [];
  }

  disposeStage() {
    if (this.root) disposeGroup(this.root);
    if (this.scene) this.scene.clear();
    this.root = null;
    this.worldRoot = null;
    this.backdrop = null;
    this.stageMeshes = null;
    this.layerGroups = [];
    this.kindnessEffects = [];
  }

  applyPalette() {
    if (!this.chapter) return;
    this.fallback.style.setProperty('--scene-sky', this.chapter.palette.sky);
    this.fallback.style.setProperty('--scene-far', this.chapter.palette.far);
    this.fallback.style.setProperty('--scene-main', this.chapter.palette.primary);
    this.fallback.style.setProperty('--scene-warm', this.chapter.palette.warm);
    this.fallback.style.setProperty('--scene-ground', this.chapter.palette.ground);
    this.fallback.dataset.chapter = String(this.chapter.id);
  }

  showFallback(show) {
    this.fallback.hidden = !show;
    if (this.renderer) this.renderer.domElement.style.visibility = show ? 'hidden' : 'visible';
  }

  resize() {
    const rect = this.host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    const scale = rect.height / LOGICAL_HEIGHT;
    this.viewWidth = rect.width / scale;
    this.viewBottom = -Math.max(0, ((this.sheet?.offsetHeight ?? 0) + 8) / scale - GROUND_Y);
    if (this.camera) {
      this.camera.left = -this.viewWidth / 2;
      this.camera.right = this.viewWidth / 2;
      this.camera.bottom = this.viewBottom;
      this.camera.top = this.viewBottom + LOGICAL_HEIGHT;
      this.camera.updateProjectionMatrix();
    }
    if (this.renderer && this.contextAvailable) {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      if (this.renderer.getPixelRatio() !== dpr) this.renderer.setPixelRatio(dpr);
      const canvas = this.renderer.domElement;
      if (canvas.width !== Math.floor(rect.width * dpr) || canvas.height !== Math.floor(rect.height * dpr)) {
        this.renderer.setSize(rect.width, rect.height, false);
      }
    }
    if (this.chapter) {
      this.fitScenery();
      this.follow(this.departing ? this.departCamX ?? this.playerX : this.playerX);
    }
    this.render();
  }

  fitScenery() {
    const width = this.viewWidth;
    const length = this.chapter.length;
    if (this.backdrop) {
      // 涵蓋兩端夾限位置之間的完整視差行程。減少動態時各層同行，也要填滿路尾。
      const scroll = this.reducedMotion ? 1 : this.backdrop.parent.userData.scroll;
      const span = width + Math.max(0, length - width) * scroll;
      const zoom = Math.max(1, span / this.backdrop.geometry.parameters.width);
      this.backdrop.scale.set(zoom, zoom, 1);
      this.backdrop.position.x = length * scroll / 2;
    }
    // 保留地面上緣的接點；鏡頭為面板抬高主角時，下方仍由當章地面鋪滿。
    for (const id of ['road-base', 'ground-a', 'ground-b']) {
      for (const mesh of this.stageMeshes?.get(id) ?? []) {
        const height = mesh.geometry.parameters.height;
        mesh.scale.y = 1 - this.viewBottom / height;
        mesh.position.y = mesh.userData.baseY + this.viewBottom / 2;
        if (id === 'road-base') mesh.scale.x = Math.max(1, width / length);
      }
    }
  }

  follow(x) {
    const half = this.viewWidth / 2;
    // 在前方保留視野；視窗比整條路更寬時，鏡頭固定在路的中央。
    this.camX = half * 2 >= this.chapter.length ? this.chapter.length / 2
      : Math.max(half, Math.min(x + this.viewWidth * 0.14, this.chapter.length - half));
    if (this.worldRoot) this.worldRoot.position.x = -this.camX;
    for (const layer of this.layerGroups) {
      const scroll = this.reducedMotion ? 1 : layer.userData.scroll;
      layer.position.x = this.camX * (1 - scroll);
    }
  }

  // 速度用每格實際位移估算，相位也由同一段位移累積，放開按鍵後的滑行仍會走完。
  animateCharacter(figure, sample, x, timeSeconds, deltaSeconds, canWalk, pose = 'walk', pedals = true) {
    if (deltaSeconds > 0) {
      const distance = Math.max(0, x - sample.x);
      const moving = canWalk && distance > 0;
      const speed = moving ? distance / deltaSeconds : 0;
      sample.speed = THREE.MathUtils.damp(sample.speed, speed, CHARACTER_SPEED_DAMPING, deltaSeconds);
      if (moving) sample.phase = (sample.moving ? sample.phase : 0) + distance / figure.definition.strideLength;
      sample.moving = moving;
    }
    sample.x = x;
    figure.update(x, timeSeconds, canWalk && sample.moving, pose, {
      phase: sample.phase,
      speed: sample.speed,
      reducedMotion: this.reducedMotion,
      pedals,
    });
  }

  update({ x = this.playerX, timeSeconds = this.characterTime ?? 0, pose = this.characterPose ?? 'walk' } = {}) {
    if (!this.chapter) return;
    if (!this.root) {
      this.playerX = x;
      this.follow(x);
      return;
    }
    const elapsed = timeSeconds - (this.characterTime ?? timeSeconds);
    // 重玩、初始跳章等座標重設，不把跨場景位移當成一步。
    if (!this.characterMotion || elapsed < 0 || x < this.playerX || (elapsed === 0 && x !== this.playerX)) {
      this.characterMotion = { traveler: characterSample(x), companion: characterSample(x - COMPANION_GAP) };
    }
    const deltaSeconds = Math.max(0, Math.min(elapsed, MAX_CHARACTER_FRAME));
    this.characterTime = timeSeconds;
    this.characterPose = pose;
    this.playerX = x;
    const departed = this.applyDeparture(x, timeSeconds, deltaSeconds);
    if (!departed) {
      const { traveler, companion } = this.characterMotion;
      const heroX = glideCharacter(traveler.x, x, TRAVELER_GLIDE, deltaSeconds);
      const birdX = glideCharacter(companion.x, heroX - COMPANION_GAP, COMPANION_GLIDE, deltaSeconds);
      this.animateCharacter(this.traveler, traveler, heroX, timeSeconds, deltaSeconds, true, pose);
      this.animateCharacter(this.companion, companion, birdX, timeSeconds, deltaSeconds, true);
      this.shadows.visible = true;
      this.shadows.children[0].position.x = heroX;
      this.shadows.children[1].position.x = birdX;
    }
    // 減少動態效果沿用直接對準流程座標的鏡頭，角色動畫仍保有起停。
    const cameraTarget = departed ? this.departCamX : this.reducedMotion ? x : this.traveler.root.position.x;
    this.follow(cameraTarget);
    this.fadeForeground(this.traveler.root.position.x, deltaSeconds);
    // 手機直式仍要看得見交談對象，站距最多占可視寬度的一半。
    const bystanderX = this.chapter.stops.chat + Math.min(210, this.viewWidth / 2);
    this.bystander.update(bystanderX, timeSeconds, false, pose === 'wave' ? 'wave' : 'stand');
    if (this.particles) {
      const attribute = this.particles.geometry.getAttribute('position');
      const origin = this.particles.userData.origin;
      const phases = this.particles.userData.phases;
      for (let index = 0; index < phases.length; index += 1) {
        attribute.array[index * 3] = origin[index * 3] + (this.reducedMotion ? 0 : Math.sin(timeSeconds * 0.34 + phases[index]) * 14);
        attribute.array[index * 3 + 1] = origin[index * 3 + 1] + (this.reducedMotion ? 0 : Math.cos(timeSeconds * 0.42 + phases[index]) * 9);
      }
      attribute.needsUpdate = true;
    }
    this.kindnessEffects = this.kindnessEffects.filter((effect) => {
      const progress = (performance.now() - effect.started) / 780;
      if (progress >= 1) {
        effect.mesh.parent?.remove(effect.mesh);
        effect.mesh.geometry.dispose();
        effect.mesh.material.dispose();
        return false;
      }
      effect.mesh.scale.set(36 + progress * 90, 24 + progress * 55, 1);
      effect.mesh.material.opacity = (1 - progress) * 0.75;
      return true;
    });
    if (this.contextAvailable) this.renderer.render(this.scene, this.camera);
  }

  // 前景剪影擋到主角時淡出，離開後再淡回來。
  fadeForeground(heroX, deltaSeconds) {
    const layer = this.layerGroups.find((group) => group.userData.depth === 5);
    if (!layer) return;
    for (const mesh of layer.children) {
      if (!mesh.isMesh || !mesh.material) continue;
      mesh.userData.baseOpacity ??= mesh.material.opacity;
      const width = mesh.geometry.parameters?.width ?? 0;
      const left = mesh.position.x + layer.position.x - width / 2;
      const covers = left < heroX + FOREGROUND_CLEARANCE && left + width > heroX - FOREGROUND_CLEARANCE;
      const target = covers ? mesh.userData.baseOpacity * FOREGROUND_FADED : mesh.userData.baseOpacity;
      mesh.material.opacity = deltaSeconds > 0 ? THREE.MathUtils.damp(mesh.material.opacity, target, 6, deltaSeconds) : target;
    }
  }

  // 離場：主角依該章的方式離開畫面。減少動態效果時不播放。
  startDeparture() {
    this.departing = !this.reducedMotion && Boolean(this.chapter?.departure);
    this.departT0 = null;
  }

  applyDeparture(x, timeSeconds, deltaSeconds) {
    if (!this.departing || !this.chapter?.departure) return false;
    if (this.departT0 === null) this.departT0 = timeSeconds;
    // departFreeze 只給除錯用：把離場定格在指定進度。
    const t = this.departFreeze ?? Math.min(1, Math.max(0, (timeSeconds - this.departT0) / DEPART_SECONDS));
    const { mode, sprite, seat = 0.5, seatY = 0 } = this.chapter.departure;
    const meshes = (sprite ? [].concat(sprite).flatMap((id) => this.stageMeshes.get(id) ?? []) : []);
    const go = Math.max(0, (t - 0.5) / 0.5);
    const drive = go * go * (mode === 'carry' ? 1500 : 900);
    this.departCamX = x;
    const fade = (figure, opacity) => figure.root.traverse((node) => {
      if (node.isMesh) node.material.opacity = opacity;
    });
    let heroX = x;
    let heroY = GROUND_Y;
    let heroPose = 'stand';
    let heroMoving = false;
    let birdX = x - COMPANION_GAP;
    let birdMoving = false;
    let heroOpacity = 1;
    let birdOpacity = 1;

    if (mode === 'board') {
      // 走進車裡（淡出），車再開走。
      const vehicle = meshes[meshes.length - 1];
      const door = vehicle ? vehicle.userData.baseX - vehicle.userData.itemWidth * 0.22 : x;
      const walk = Math.min(1, t / 0.45);
      heroX = x + (door - x) * walk;
      this.departCamX = heroX;
      birdX = heroX - COMPANION_GAP * (1 - walk * 0.6);
      heroMoving = walk < 1;
      birdMoving = heroMoving;
      heroPose = 'walk';
      heroOpacity = 1 - Math.min(1, Math.max(0, (t - 0.4) / 0.07));
      birdOpacity = heroOpacity;
      if (vehicle) vehicle.position.x = vehicle.userData.baseX + drive;
    } else if (mode === 'ride') {
      // 坐上車，一起騎走；夥伴跟在後面跑。
      const vehicle = meshes[meshes.length - 1];
      const mount = Math.min(1, t / 0.45);
      const seatX = vehicle ? vehicle.userData.baseX + (seat - 0.5) * vehicle.userData.itemWidth : x;
      this.departCamX = x + (seatX - x) * mount;
      heroX = this.departCamX + drive;
      heroY = GROUND_Y + (mount >= 1 ? seatY : 0);
      heroPose = mount >= 1 ? 'ride' : 'walk';
      heroMoving = mount < 1;
      birdX = heroX - THREE.MathUtils.lerp(COMPANION_GAP, RIDE_COMPANION_GAP, mount);
      birdMoving = true;
      if (vehicle) {
        vehicle.position.x = vehicle.userData.baseX + drive;
        vehicle.position.y = vehicle.userData.baseY + (go > 0 ? Math.sin(timeSeconds * 14) * 1.2 : 0);
      }
    } else if (mode === 'carry') {
      // 人已經在車廂裡：整節車連人一起開走。
      for (const mesh of meshes) mesh.position.x = mesh.userData.baseX + drive;
      heroX = x + drive;
      birdX = heroX - COMPANION_GAP;
    } else if (mode === 'lanterns') {
      // 天燈一盞一盞升空，人留在原地看。
      meshes.forEach((mesh, index) => {
        const rise = Math.max(0, (t - index * 0.09) / (1 - index * 0.09));
        mesh.position.y = mesh.userData.baseY + rise * rise * 640;
        mesh.position.x = mesh.userData.baseX + Math.sin(timeSeconds * 1.4 + index) * 10 * rise;
      });
    } else {
      // 步行離開。
      heroX = x + t * 900;
      this.departCamX = Math.min(heroX, x + 160);
      birdX = heroX - COMPANION_GAP;
      heroMoving = true;
      birdMoving = true;
      heroPose = 'walk';
    }
    this.traveler.baseY = heroY;
    // 交通工具的座標仍由離場時間決定；自行車踩踏，機車保持雙腳放在踏板。
    const { traveler, companion } = this.characterMotion;
    this.animateCharacter(this.traveler, traveler, heroX, timeSeconds, deltaSeconds, heroMoving, heroPose, sprite === 'bike');
    this.animateCharacter(this.companion, companion, birdX, timeSeconds, deltaSeconds, birdMoving);
    fade(this.traveler, heroOpacity);
    fade(this.companion, birdOpacity);
    this.shadows.visible = false;
    return true;
  }

  worldToScreen(worldX, worldY, scroll = 1) {
    const rect = this.host.getBoundingClientRect();
    // DOM 泡泡與正交相機共用取景下緣、比例及減少動態時的捲動量。
    const scale = rect.height / LOGICAL_HEIGHT;
    return {
      left: (this.viewWidth / 2 + worldX - this.camX * (this.reducedMotion ? 1 : scroll)) * scale,
      top: (this.viewBottom + LOGICAL_HEIGHT - worldY) * scale,
    };
  }

  showKindness(worldX) {
    if (!this.chapter || !this.layerGroups.length) return;
    const foreground = this.layerGroups.find((layer) => layer.userData.depth === 3);
    const mesh = new THREE.Mesh(new THREE.RingGeometry(0.67, 0.92, 36), new THREE.MeshBasicMaterial({ color: this.chapter.palette.warm, transparent: true, opacity: 0.75, depthWrite: false, side: THREE.DoubleSide }));
    mesh.position.set(worldX, GROUND_Y + 54, 120);
    mesh.renderOrder = 490;
    foreground.add(mesh);
    this.kindnessEffects.push({ mesh, started: performance.now() });
  }

  render() {
    if (this.contextAvailable && this.renderer && this.scene) this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.version += 1;
    this.resizeObserver?.disconnect();
    this.motionQuery?.removeEventListener('change', this.onMotionChange);
    this.disposeStage();
    this.renderer?.dispose();
    this.renderer?.domElement.remove();
    this.renderer = null;
    this.assets.clear();
  }
}
