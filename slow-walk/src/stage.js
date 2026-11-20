import * as THREE from 'three';
import { chapters } from './chapters/index.js';
import { loadChapterAssets } from './assets.js';
import { createBystander, createCompanion, createTraveler } from './characters/rig.js';

const LOGICAL_WIDTH = 1280;
const LOGICAL_HEIGHT = 720;
const GROUND_Y = 154;
const DEPART_SECONDS = 3.4;

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
  constructor(host, fallback) {
    this.host = host;
    this.fallback = fallback;
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
      this.renderer.setSize(LOGICAL_WIDTH, LOGICAL_HEIGHT, false);
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.domElement.setAttribute('aria-hidden', 'true');
      this.renderer.domElement.className = 'stage-canvas';
      this.host.append(this.renderer.domElement);
      this.scene = new THREE.Scene();
      this.camera = new THREE.OrthographicCamera(-640, 640, 720, 0, 0.1, 5000);
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
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => this.resize());
        this.resizeObserver.observe(this.host);
      }
      this.motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
      this.onMotionChange = (event) => {
        this.reducedMotion = event.matches;
        if (this.chapter) this.setChapter(this.chapter.id);
      };
      this.motionQuery.addEventListener('change', this.onMotionChange);
      this.resize();
      this.showFallback(false);
    } catch {
      this.renderer?.dispose();
      this.renderer?.domElement?.remove();
      this.renderer = null;
      this.contextAvailable = false;
      this.showFallback(true);
    }
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
    this.chapter = nextChapter;
    this.version += 1;
    const currentVersion = this.version;
    this.showFallback(!this.contextAvailable);
    this.disposeStage();
    this.applyPalette();
    if (!this.contextAvailable || !this.renderer || !this.scene) return;

    // Draw the color-block world immediately; optional registered WebP art may replace it later.
    this.buildStage(nextChapter, new Map());
    this.update({ x: nextChapter.stops.start });
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
    for (const [x, width, opacity] of [[0, 54, 0.2], [-94, 36, 0.15]]) {
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
    this.bystander.root.position.set(chapter.stops.chat + 210, GROUND_Y, 0);
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
    if (!this.renderer) return;
    const rect = this.host.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(Math.round(rect.width), Math.round(rect.height), false);
    this.renderer.render(this.scene, this.camera);
  }

  update({ x = this.playerX, timeSeconds = 0, moving = false, pose = 'walk' } = {}) {
    if (!this.chapter || !this.root) return;
    this.playerX = x;
    const departed = this.applyDeparture(x, timeSeconds);
    const cameraX = Math.max(640, Math.min(departed ? this.departCamX : x, this.chapter.length - 640));
    this.camX = cameraX;
    this.worldRoot.position.x = -cameraX;
    for (const layer of this.layerGroups) {
      const effectiveScroll = this.reducedMotion ? 1 : layer.userData.scroll;
      layer.position.x = cameraX * (1 - effectiveScroll);
    }
    if (!departed) {
      this.traveler.update(x, timeSeconds, moving, pose);
      this.companion.update(x - 96, timeSeconds, moving, 'walk');
    }
    this.bystander.update(this.chapter.stops.chat + 210, timeSeconds, false, pose === 'wave' ? 'wave' : 'stand');
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

  // 離場：主角依該章的方式離開畫面。減少動態效果時不播放。
  startDeparture() {
    this.departing = !this.reducedMotion && Boolean(this.chapter?.departure);
    this.departT0 = null;
  }

  applyDeparture(x, timeSeconds) {
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
    let birdX = x - 96;
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
      birdX = heroX - 96 * (1 - walk * 0.6);
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
      birdX = heroX - 150;
      birdMoving = true;
      if (vehicle) {
        vehicle.position.x = vehicle.userData.baseX + drive;
        vehicle.position.y = vehicle.userData.baseY + (go > 0 ? Math.sin(timeSeconds * 14) * 1.2 : 0);
      }
    } else if (mode === 'carry') {
      // 人已經在車廂裡：整節車連人一起開走。
      for (const mesh of meshes) mesh.position.x = mesh.userData.baseX + drive;
      heroX = x + drive;
      birdX = heroX - 96;
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
      birdX = heroX - 96;
      heroMoving = true;
      birdMoving = true;
      heroPose = 'walk';
    }
    this.traveler.baseY = heroY;
    this.traveler.update(heroX, timeSeconds, heroMoving, heroPose);
    this.companion.update(birdX, timeSeconds, birdMoving, 'walk');
    fade(this.traveler, heroOpacity);
    fade(this.companion, birdOpacity);
    this.shadows.visible = false;
    return true;
  }

  worldToScreen(worldX, worldY, scroll = 1) {
    const rect = this.host.getBoundingClientRect();
    return {
      left: (640 + worldX - this.camX * scroll) * (rect.width / LOGICAL_WIDTH),
      top: (LOGICAL_HEIGHT - worldY) * (rect.height / LOGICAL_HEIGHT),
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
