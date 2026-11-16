import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';

const GREEN = 0x1f6f5c;
const GREEN_LIGHT = 0x79bda0;
const RED = 0xd6452b;
const PAPER = 0xf4f0e6;
const DARK = 0x17262c;

function material(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.92, metalness: 0, flatShading: true, ...extra });
}

function createLabelTexture(title, lines = [], accent = '#1f6f5c') {
  const canvas = document.createElement('canvas');
  canvas.width = 768;
  canvas.height = 420;
  const context = canvas.getContext('2d');
  context.fillStyle = '#f4f0e6';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = accent;
  context.fillRect(0, 0, canvas.width, 26);
  context.fillStyle = '#16242a';
  context.font = '700 148px system-ui, sans-serif';
  context.fillText(title, 38, 190, 690);
  context.fillStyle = '#41514d';
  context.font = '500 30px system-ui, sans-serif';
  lines.forEach((line, index) => context.fillText(line, 38, 192 + index * 62, 690));
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 2;
  return texture;
}

function createCanvasPlane(title, lines, width, height, z = 0.14) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ map: createLabelTexture(title, lines), toneMapped: false }));
  mesh.position.z = z;
  return mesh;
}

export class GameScene {
  constructor(canvas, fallback, callbacks = {}) {
    this.canvas = canvas;
    this.fallback = fallback;
    this.callbacks = callbacks;
    this.panel = callbacks.panel ?? document.querySelector('#panel');
    this.reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    this.models = new Map();
    this.stageObjects = new THREE.Group();
    this.interactive = [];
    this.tweens = [];
    this.currentIndex = 0;
    this.currentChapter = null;
    this.chapterCode = 0;
    this.gameType = null;
    this.sliderValue = 0;
    this.stopTick = 0;
    this.finalCard = null;
    this.swipeCard = null;
    this.swipePointer = null;
    this.running = false;
    this.frameId = null;

    try {
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
      this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(DARK, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.NoToneMapping;
      this.fade = document.createElement('div');
      this.fade.className = 'scene-fade';
      this.fade.setAttribute('aria-hidden', 'true');
      canvas.insertAdjacentElement('afterend', this.fade);
      this.scene = new THREE.Scene();
      this.scene.fog = new THREE.Fog(DARK, 30, 110);
      this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 110);
      this.scene.add(new THREE.HemisphereLight(0xdde6db, 0x24343a, 1.8));
      const keyLight = new THREE.DirectionalLight(0xfff3dc, 2.1);
      keyLight.position.set(-4, 8, 6);
      this.scene.add(keyLight);
      this.scene.add(this.createCorridor());
      this.scene.add(this.stageObjects);
      this.resize();
      this.bindPointerEvents();
      window.addEventListener('resize', () => this.resize());
      this.panelObserver = new ResizeObserver(() => this.fitCurrentStage());
      if (this.panel) this.panelObserver.observe(this.panel);
      document.addEventListener('visibilitychange', () => this.visibilityChanged());
      this.loadModels();
      this.startLoop();
    } catch {
      this.renderer = null;
      this.fallback.hidden = false;
      this.fallback.textContent = '這台裝置無法顯示 3D；仍可用下方按鈕完成十章。';
      this.canvas.hidden = true;
    }
  }

  createCorridor() {
    const corridor = new THREE.Group();
    corridor.userData.corridor = true;
    this.corridorGates = [];
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(15, 250), material(0x26343a));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(0, -0.1, -108);
    corridor.add(floor);
    const railMaterial = material(0x31423f);
    for (const side of [-1, 1]) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.24, 250), railMaterial);
      rail.position.set(side * 5.4, 0.05, -108);
      corridor.add(rail);
    }
    for (let index = 0; index < 10; index += 1) {
      const arch = new THREE.Group();
      const z = -index * 24;
      const postMaterial = material(index === this.currentIndex ? GREEN : 0x354640);
      this.corridorGates.push({ index, material: postMaterial });
      const left = new THREE.Mesh(new THREE.BoxGeometry(0.25, 5.5, 0.28), postMaterial);
      const right = left.clone();
      left.position.set(-4.15, 2.75, 0);
      right.position.set(4.15, 2.75, 0);
      const top = new THREE.Mesh(new THREE.BoxGeometry(8.55, 0.28, 0.28), postMaterial);
      top.position.y = 5.4;
      arch.add(left, right, top);
      arch.position.z = z - 3;
      corridor.add(arch);
      this.modelsPendingGate?.push({ index, group: arch });
      const platform = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 0.12, 48), material(0x26343a));
      platform.position.set(0, 0.06, z);
      corridor.add(platform);
    }
    return corridor;
  }

  async loadModels() {
    if (!this.renderer) return;
    const draco = new DRACOLoader();
    draco.setDecoderPath(new URL(`${import.meta.env.BASE_URL}draco/`, window.location.href).href);
    const loader = new GLTFLoader();
    loader.setDRACOLoader(draco);
    const names = ['bottle', 'tablet', 'figure', 'gate'];
    await Promise.all(names.map(async (name) => {
      try {
        const gltf = await loader.loadAsync(`${import.meta.env.BASE_URL}models/${name}.glb`);
        this.models.set(name, gltf.scene);
      } catch {
        // Native low-poly geometry keeps the game playable if a model fails to load.
      }
    }));
    draco.dispose();
    if (this.currentChapter) this.setChapter(this.currentChapter, this.currentIndex, false);
  }

  addGates() {
    const gate = this.models.get('gate');
    if (!gate) return;
    const corridor = this.scene.children.find((child) => child.userData.corridor);
    if (!corridor) return;
    for (let index = 0; index < 10; index += 1) {
      const clone = this.cloneModel(gate, index === this.currentIndex ? GREEN : 0x40514a);
      const bounds = new THREE.Box3().setFromObject(clone);
      const size = bounds.getSize(new THREE.Vector3());
      const scale = 4.8 / Math.max(size.x, size.y, 1);
      clone.scale.setScalar(scale);
      clone.position.set(0, 0, -index * 24 - 3);
      corridor.add(clone);
    }
  }

  cloneModel(template, tint) {
    const clone = template.clone(true);
    clone.traverse((child) => {
      if (!child.isMesh) return;
      child.material = child.material.clone();
      child.material.color.setHex(tint);
      child.material.roughness = 0.94;
      child.castShadow = false;
      child.receiveShadow = false;
    });
    return clone;
  }

  resize() {
    if (!this.renderer || !this.camera) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const narrow = width / height < 0.78;
    this.camera.aspect = width / height;
    this.camera.fov = 38;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.setSize(width, height, false);
    if (this.currentChapter) this.fitCurrentStage();
  }

  fitCurrentStage() {
    if (!this.camera || !this.renderer || !this.currentChapter) return;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const narrow = width / height < 0.78;
    const target = new THREE.Vector3(0, 1.9, this.getStageZ());
    this.camera.position.set(0, narrow ? 3.6 : 3.0, target.z + (narrow ? 24 : 15));
    this.camera.clearViewOffset();
    const panelTop = this.panel?.getBoundingClientRect().top ?? height * 0.5;
    const visibleTop = THREE.MathUtils.clamp(panelTop / height, 0.4, 0.62) * height;
    this.camera.setViewOffset(width, height, 0, (height - visibleTop) / 2 - 28, width, height);
    this.cameraTarget = target;
    this.camera.lookAt(target);
  }

  moveToChapter(index, animate = true) {
    if (!this.camera) return;
    const chapterCode = this.chapterCode;
    const width = Math.max(1, window.innerWidth);
    const height = Math.max(1, window.innerHeight);
    const panelTop = this.panel?.getBoundingClientRect().top ?? height * 0.5;
    const visibleTop = THREE.MathUtils.clamp(panelTop / height, 0.4, 0.62) * height;
    this.camera.clearViewOffset();
    this.camera.setViewOffset(width, height, 0, (height - visibleTop) / 2 - 28, width, height);
    const narrow = window.innerWidth / Math.max(window.innerHeight, 1) < 0.78;
    const target = new THREE.Vector3(0, 1.9, -index * 24);
    const position = new THREE.Vector3(0, narrow ? 3.6 : 3.0, target.z + (narrow ? 24 : 15));
    if (!animate || this.reducedMotion) {
      if (animate && this.reducedMotion && this.fade) {
        this.fade.classList.add('is-visible');
        window.setTimeout(() => {
          if (chapterCode !== this.chapterCode) {
            this.fade.classList.remove('is-visible');
            return;
          }
          this.camera.position.copy(position);
          this.cameraTarget = target;
          this.camera.lookAt(target);
          requestAnimationFrame(() => this.fade.classList.remove('is-visible'));
        }, 90);
      } else {
        this.camera.position.copy(position);
        this.cameraTarget = target;
        this.camera.lookAt(target);
      }
      return;
    }
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.cameraTarget?.clone() ?? new THREE.Vector3(0, 1.9, target.z);
    this.tweens.push({
      start: performance.now(),
      duration: 1200,
      update: (progress) => {
        const eased = progress < 0.5 ? 2 * progress * progress : 1 - Math.pow(-2 * progress + 2, 2) / 2;
        this.camera.position.lerpVectors(fromPosition, position, eased);
        this.cameraTarget = fromTarget.clone().lerp(target, eased);
        this.camera.lookAt(this.cameraTarget);
      },
    });
    this.cameraTarget = target;
  }

  setChapter(chapter, index, animate = true) {
    this.chapterCode += 1;
    this.tweens = [];
    this.currentChapter = chapter;
    this.currentIndex = index;
    this.gameType = chapter.game?.type ?? 'finale';
    this.stageObjects.clear();
    this.interactive = [];
    this.swipeCard = null;
    this.finalCard = null;
    this.stopTick = 0;
    if (!this.renderer) return;
    if (chapter.game?.type === 'pick') this.createPickStage(chapter);
    else if (chapter.game?.type === 'slider') this.createSliderStage(chapter);
    else if (chapter.game?.type === 'swipe') this.createSwipeStage(chapter);
    else if (chapter.game?.type === 'stop') this.createStopStage(chapter);
    else if (chapter.game?.type === 'agent') this.createAgentStage(chapter);
    else this.createFinalStage(chapter);
    this.moveToChapter(index, animate);
  }

  scanQuickQuestion(questionIndex) {
    if (!this.camera || !this.corridorGates) return;
    const gateIndex = Math.min(8, Math.floor(questionIndex * 9 / 6));
    for (const gate of this.corridorGates) gate.material.color.setHex(gate.index === gateIndex ? GREEN_LIGHT : 0x354640);
    if (this.reducedMotion) return;
    const centerZ = -gateIndex * 24 - 3;
    const target = new THREE.Vector3(0, 2.15, centerZ);
    const position = new THREE.Vector3(0, 3.8, centerZ + 6.5);
    const fromPosition = this.camera.position.clone();
    const fromTarget = this.cameraTarget?.clone() ?? target.clone();
    this.tweens.push({
      start: performance.now(), duration: 520,
      update: (progress) => {
        const eased = progress * progress * (3 - 2 * progress);
        this.camera.position.lerpVectors(fromPosition, position, eased);
        this.cameraTarget = fromTarget.clone().lerp(target, eased);
        this.camera.lookAt(this.cameraTarget);
      },
    });
  }

  getStageZ() { return -this.currentIndex * 24; }

  positionStage(object, x, y, z = 0) {
    object.position.set(x, y, this.getStageZ() + z);
    return object;
  }

  makeHitbox(width, height, x, y, z, kind, index = 0) {
    const hitbox = new THREE.Mesh(
      new THREE.PlaneGeometry(width, height),
      new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.001, depthWrite: false, side: THREE.DoubleSide }),
    );
    hitbox.position.set(x, y, this.getStageZ() + z);
    hitbox.userData = { kind, index };
    this.stageObjects.add(hitbox);
    this.interactive.push(hitbox);
    return hitbox;
  }

  createPickStage(chapter) {
    const options = chapter.game.options;
    const count = options.length;
    this.pickVisuals = [];
    options.forEach((option, index) => {
      const x = (index - (count - 1) / 2) * (count === 2 ? 3.4 : 2.2);
      const model = this.models.get(chapter.year === 2024 ? 'figure' : 'tablet');
      let visual;
      if (model) {
        visual = this.cloneModel(model, 0x64756d);
        const box = new THREE.Box3().setFromObject(visual);
        const size = box.getSize(new THREE.Vector3());
      const targetHeight = chapter.year === 2024 ? 2.2 : 2.6;
        visual.scale.setScalar(targetHeight / Math.max(size.y, 0.01));
        visual.position.set(x, 0.12 - box.min.y * visual.scale.y, this.getStageZ());
        this.stageObjects.add(visual);
      } else {
        const height = chapter.year === 2024 ? 2.2 : 2.6;
        visual = new THREE.Mesh(new THREE.BoxGeometry(chapter.year === 2024 ? 0.72 : 1.8, height, 0.16), material(0x52655f));
        visual.position.set(x, 0.12 + height / 2, this.getStageZ());
        this.stageObjects.add(visual);
      }
      const label = new THREE.Mesh(new THREE.PlaneGeometry(chapter.year === 2024 ? 1.65 : 1.8, chapter.year === 2024 ? 0.48 : 0.48),
        new THREE.MeshBasicMaterial({ map: createLabelTexture(option.title, []), toneMapped: false, side: THREE.DoubleSide }));
      label.position.set(x, chapter.year === 2024 ? 3.62 : 1.65, this.getStageZ() + 0.34);
      this.stageObjects.add(label);
      this.pickVisuals.push({ visual, label });
      this.makeHitbox(chapter.year === 2024 ? 1.8 : 2.3, 3.4, x, 1.9, 0.45, 'pick', index);
    });
    if (chapter.year === 2024) {
      const whistle = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.54, 8), material(PAPER));
      tube.rotation.z = Math.PI / 2;
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.035, 5, 10), material(RED));
      ring.position.x = -0.25;
      whistle.add(tube, ring);
      whistle.name = 'whistle';
      whistle.position.z = this.getStageZ();
      whistle.visible = false;
      this.stageObjects.add(whistle);
    }
  }

  showPickResult(answer, picked) {
    for (const target of this.interactive) {
      if (target.userData.kind !== 'pick') continue;
      target.material.color.setHex(target.userData.index === answer ? GREEN : target.userData.index === picked ? RED : 0x344047);
      target.material.opacity = 0.22;
    }
    if (this.currentChapter?.year === 2024) {
      const whistle = this.stageObjects.getObjectByName('whistle');
      const count = this.currentChapter.game.options.length;
      if (whistle) {
        whistle.visible = true;
        whistle.position.set((answer - (count - 1) / 2) * 2.2, 3.78, this.getStageZ() + 0.4);
        this.tweens.push({
          start: performance.now(), duration: this.reducedMotion ? 80 : 520,
          update: (p) => { whistle.position.y = 3.78 - 0.55 * p; },
        });
      }
    }
  }

  celebrateCorrect() {
    const year = this.currentChapter?.year;
    let target;
    if (year === 2018 || year === 2024) target = this.pickVisuals?.[this.currentChapter.game.answer]?.visual;
    else if (year === 2019) target = this.monthMeshes?.[Math.round(this.currentChapter.game.answer) - 1];
    else if (year === 2020) target = this.compareCylinder;
    else if (year === 2022) target = this.people;
    else if (year === 2023) target = this.swipeCard;
    else if (year === 2025) target = this.reportColumn;
    if (!target) return;
    const base = target.scale.clone();
    const duration = this.reducedMotion ? 100 : 420;
    this.tweens.push({
      start: performance.now(), duration,
      update: (progress) => {
        const bounce = 1 + 0.08 * Math.sin(Math.PI * progress);
        target.scale.set(base.x * bounce, base.y * bounce, base.z * bounce);
      },
    });
  }

  createSliderStage(chapter) {
    if (chapter.year === 2019) {
      this.monthMeshes = [];
      for (let index = 0; index < 10; index += 1) {
        const block = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.45, 0.55), material(0x53615e));
        block.position.set(-3.15 + index * 0.7, 0.345, this.getStageZ());
        this.stageObjects.add(block);
        this.monthMeshes.push(block);
      }
    } else if (chapter.year === 2020) {
      this.lowerCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1, 12), material(GREEN));
      this.upperCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1, 12), material(0x53615e));
      this.lowerCylinder.position.set(-1.2, 0.62, this.getStageZ());
      this.upperCylinder.position.set(-1.2, 1.62, this.getStageZ());
      this.compareCylinder = new THREE.Mesh(new THREE.CylinderGeometry(0.72, 0.72, 1, 12), material(GREEN));
      this.compareCylinder.position.set(1.2, 0.62, this.getStageZ());
      this.compareCylinder.visible = false;
      this.stageObjects.add(this.lowerCylinder, this.upperCylinder, this.compareCylinder);
    } else {
      const geometry = new THREE.CapsuleGeometry(0.075, 0.2, 2, 4);
      const count = 100;
      this.people = new THREE.InstancedMesh(geometry, material(GREEN), count);
      const transform = new THREE.Object3D();
      for (let index = 0; index < count; index += 1) {
        const x = (index % 10 - 4.5) * 0.54;
        const y = 0.3 + Math.floor(index / 10) * 0.32;
        transform.position.set(x, y, this.getStageZ());
        transform.scale.set(1, 1, 1);
        transform.updateMatrix();
        this.people.setMatrixAt(index, transform.matrix);
      }
      this.people.instanceMatrix.needsUpdate = true;
      this.stageObjects.add(this.people);
    }
    this.setSlider(chapter.game.start, chapter);
  }

  setSlider(value, chapter = this.currentChapter) {
    this.sliderValue = value;
    if (!chapter?.game) return;
    if (chapter.year === 2019 && this.monthMeshes) {
      const upright = Math.round(value);
      this.monthMeshes.forEach((block, index) => {
        block.scale.y = index < upright ? 3.55 : 1;
        block.position.y = index < upright ? 0.92 : 0.345;
        block.material.color.setHex(index < upright ? GREEN_LIGHT : 0x53615e);
      });
    } else if (chapter.year === 2020 && this.lowerCylinder) {
      const ratio = THREE.MathUtils.clamp(value / 100, 0, 1);
      const height = Math.max(0.08, ratio * 3.2);
      const remainder = Math.max(0.08, 3.2 - height);
      this.lowerCylinder.scale.y = height;
      this.lowerCylinder.position.y = 0.12 + height / 2;
      this.upperCylinder.scale.y = remainder;
      this.upperCylinder.position.y = 0.12 + height + remainder / 2;
    } else if (chapter.year === 2022 && this.people) {
      const warningCount = THREE.MathUtils.clamp(Math.round(value), 0, 100);
      for (let index = 0; index < 100; index += 1) {
        this.people.setColorAt(index, new THREE.Color(index < warningCount ? RED : GREEN));
      }
      this.people.instanceColor.needsUpdate = true;
    }
  }

  revealSlider(answer) {
    if (this.currentChapter?.year === 2020 && this.compareCylinder) {
      const ratio = THREE.MathUtils.clamp(answer / 100, 0, 1);
    const height = Math.max(0.08, ratio * 3.2);
      this.compareCylinder.scale.y = height;
      this.compareCylinder.position.y = 0.12 + height / 2;
      this.compareCylinder.visible = true;
    }
    if (this.currentChapter?.year === 2022) this.setSlider(answer);
    if (this.currentChapter?.year === 2019 && this.monthMeshes) {
      const index = Math.round(answer) - 1;
      this.monthMeshes[index]?.material.color.setHex(GREEN_LIGHT);
    }
  }

  createSwipeStage(chapter) {
    this.showSwipeCard(chapter.game.cards[0], 0);
  }

  showSwipeCard(text, index) {
    if (this.swipeCard) {
      this.stageObjects.remove(this.swipeCard);
      this.swipeCard = null;
    }
    const card = new THREE.Group();
    const backing = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.2, 0.1), material(0xe6e1d6));
    card.add(backing);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.9),
      new THREE.MeshBasicMaterial({ map: createLabelTexture('選擇', [text]), toneMapped: false, side: THREE.DoubleSide }));
    label.position.z = 0.06;
    card.add(label);
    card.position.set(0, 2, this.getStageZ());
    card.userData = { kind: 'swipe', index };
    this.stageObjects.add(card);
    this.swipeCard = card;
    this.interactive.push(card);
  }

  swipe(direction, onComplete = () => {}) {
    if (!this.swipeCard) { onComplete(); return; }
    const card = this.swipeCard;
    const startX = card.position.x;
    const startRotation = card.rotation.z;
    const duration = this.reducedMotion ? 90 : 300;
    this.tweens.push({
      start: performance.now(), duration,
      update: (p) => {
        card.position.x = startX + (direction === 'left' ? -1 : 1) * p * 7;
        card.rotation.z = startRotation + (direction === 'left' ? 1 : -1) * p * 0.28;
        if (p >= 1) onComplete();
      },
    });
  }

  createStopStage(chapter) {
    this.stopGroup = new THREE.Group();
    this.stopGroup.position.z = this.getStageZ();
    const column = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.58, 1, 8), material(GREEN_LIGHT));
    column.position.set(-1.6, 0.4, 0);
    column.name = 'report-column';
    this.stopGroup.add(column);
    this.reportColumn = column;
    const count = 30;
    const figureGeometry = new THREE.CapsuleGeometry(0.075, 0.22, 2, 4);
    this.crowd = new THREE.InstancedMesh(figureGeometry, material(0x9ca9a0), count);
    const transform = new THREE.Object3D();
    for (let index = 0; index < count; index += 1) {
      transform.position.set(0.4 + (index % 10) * 0.3, 0.3 + Math.floor(index / 10) * 0.32, -0.15);
      transform.updateMatrix();
      this.crowd.setMatrixAt(index, transform.matrix);
    }
    this.crowd.instanceMatrix.needsUpdate = true;
    this.stopGroup.add(this.crowd);
    const redButton = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.52, 0.3, 12), material(RED));
    redButton.rotation.x = Math.PI / 2;
    redButton.position.set(0, 0.52, 0.8);
    this.stopGroup.add(redButton);
    this.stageObjects.add(this.stopGroup);
    this.makeHitbox(1.7, 1.4, 0, 0.9, 1.4, 'stop');
    this.updateStop(0);
  }

  updateStop(tick, chapter = this.currentChapter) {
    this.stopTick = tick;
    if (!this.reportColumn || !this.crowd || !chapter?.game) return;
    const report = chapter.game.report.start + tick * chapter.game.report.perTick;
    const reportRange = chapter.game.report.perTick * chapter.game.ticks;
    const height = 0.8 + THREE.MathUtils.clamp((report - chapter.game.report.start) / reportRange, 0, 1) * 2.8;
    this.reportColumn.scale.y = height;
    this.reportColumn.position.y = height / 2;
    const fresh = Math.max(0, chapter.game.fresh.start + tick * chapter.game.fresh.perTick);
    const visible = Math.round((fresh / chapter.game.fresh.start) * 30);
    this.crowd.count = Math.max(0, visible);
  }

  createAgentStage(chapter) {
    const options = chapter.game.options;
    this.agentBottles = [];
    options.forEach((option, index) => {
      const x = (index - (options.length - 1) / 2) * 2.2;
      const model = this.models.get('bottle');
      let bottle;
      if (model) {
        bottle = this.cloneModel(model, [GREEN, RED, 0x71839a][index]);
        const bounds = new THREE.Box3().setFromObject(bottle);
        const size = bounds.getSize(new THREE.Vector3());
        bottle.scale.setScalar(2 / Math.max(size.y, 0.01));
        bottle.position.set(x, 0.12 - bounds.min.y * bottle.scale.y, this.getStageZ());
      } else {
        bottle = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.44, 2, 9), material([GREEN, RED, 0x71839a][index]));
        bottle.position.set(x, 1.12, this.getStageZ());
      }
      this.stageObjects.add(bottle);
      const label = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 0.48),
        new THREE.MeshBasicMaterial({ map: createLabelTexture(option.title, []), toneMapped: false, side: THREE.DoubleSide }));
      label.position.set(x, 2.42, this.getStageZ() + 0.38);
      this.stageObjects.add(label);
      this.makeHitbox(1.8, 3.4, x, 1.8, 0.55, 'pick', index);
      this.agentBottles.push(bottle);
    });
    this.scanBeam = new THREE.Mesh(new THREE.PlaneGeometry(0.12, 3.4), material(GREEN_LIGHT, { transparent: true, opacity: 0.66 }));
    this.scanBeam.position.set(-2.2, 1.65, this.getStageZ() + 0.8);
    this.scanBeam.visible = false;
    this.stageObjects.add(this.scanBeam);
  }

  scanAgent(aiPick) {
    if (!this.scanBeam || !this.agentBottles) return;
    this.scanBeam.visible = true;
    const startX = -2.2;
    const rightX = 2.2;
    const endX = (aiPick - 1) * 2.2;
    this.tweens.push({
      start: performance.now(), duration: this.reducedMotion ? 120 : 780,
      update: (p) => {
        if (p < 0.5) this.scanBeam.position.x = startX + (rightX - startX) * (p * 2);
        else this.scanBeam.position.x = rightX + (endX - rightX) * ((p - 0.5) * 2);
        if (p >= 1) this.agentBottles[aiPick]?.traverse((part) => {
          if (part.isMesh) part.material.emissive?.setHex(GREEN);
        });
      },
    });
  }

  revealAgent(picked, agentPick) {
    for (const target of this.interactive) {
      if (target.userData.kind !== 'pick') continue;
      target.material.color.setHex(target.userData.index === agentPick ? GREEN : target.userData.index === picked ? RED : 0x344047);
      target.material.opacity = 0.22;
    }
  }

  createFinalStage() {
    const frame = new THREE.Mesh(new THREE.BoxGeometry(3.2, 3.6, 0.2), material(GREEN));
    frame.position.set(0, 2, this.getStageZ());
    this.stageObjects.add(frame);
    const card = new THREE.Mesh(new THREE.PlaneGeometry(3, 3.4),
      new THREE.MeshBasicMaterial({ map: createLabelTexture('十年', ['判斷不能外包。']), toneMapped: false, side: THREE.DoubleSide }));
    card.position.set(0, 2, this.getStageZ() + 0.12);
    card.visible = false;
    this.stageObjects.add(card);
    this.finalCard = card;
  }

  flipFinale() {
    if (!this.finalCard) return Promise.resolve();
    this.finalCard.visible = true;
    const start = performance.now();
    const duration = this.reducedMotion ? 100 : 680;
    return new Promise((resolve) => {
      this.tweens.push({
        start, duration,
        update: (p) => {
          this.finalCard.rotation.y = p * Math.PI;
          if (p >= 1) resolve();
        },
      });
    });
  }

  bindPointerEvents() {
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.canvas.addEventListener('pointerdown', (event) => {
      if (!this.renderer) return;
      const bounds = this.canvas.getBoundingClientRect();
      this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
      this.raycaster.setFromCamera(this.pointer, this.camera);
      const hits = this.raycaster.intersectObjects(this.interactive, true);
      const hit = hits[0]?.object;
      if (!hit) return;
      let target = hit;
      while (target && !target.userData.kind) target = target.parent;
      if (!target) return;
      if (target.userData.kind === 'swipe') {
        this.swipePointer = { id: event.pointerId, x: event.clientX, target, startRotation: target.rotation.y };
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      } else if (target.userData.kind === 'pick') {
        this.swipePointer = { id: event.pointerId, x: event.clientX, target, y: event.clientY };
        this.canvas.setPointerCapture(event.pointerId);
        event.preventDefault();
      } else if (target.userData.kind === 'stop') {
        this.callbacks.onStop?.();
      }
    });
    this.canvas.addEventListener('pointermove', (event) => {
      if (!this.swipePointer) {
        if (this.currentChapter?.year === 2018 && this.gameType === 'pick') this.updatePickHover(event);
        return;
      }
      if (this.swipePointer.id !== event.pointerId || this.swipePointer.target.userData.kind !== 'swipe') return;
      const delta = event.clientX - this.swipePointer.x;
      this.swipePointer.target.rotation.y = this.swipePointer.startRotation - delta * 0.006;
    });
    this.canvas.addEventListener('pointerup', (event) => {
      if (!this.swipePointer || this.swipePointer.id !== event.pointerId) return;
      const record = this.swipePointer;
      this.swipePointer = null;
      if (record.target.userData.kind === 'swipe') {
        const delta = event.clientX - record.x;
        if (Math.abs(delta) > 48) this.callbacks.onSwipe?.(delta < 0 ? 'left' : 'right');
        else record.target.rotation.y = 0;
      } else if (Math.abs(event.clientX - record.x) < 12 && Math.abs(event.clientY - record.y) < 12) {
        this.callbacks.onPick?.(record.target.userData.index);
      }
    });
    this.canvas.addEventListener('pointercancel', () => { this.swipePointer = null; });
  }

  updatePickHover(event) {
    if (!this.pickVisuals?.length) return;
    const bounds = this.canvas.getBoundingClientRect();
    this.pointer.set(((event.clientX - bounds.left) / bounds.width) * 2 - 1, -((event.clientY - bounds.top) / bounds.height) * 2 + 1);
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.interactive, true).find((entry) => {
      let target = entry.object;
      while (target && !target.userData.kind) target = target.parent;
      return target?.userData.kind === 'pick';
    });
    let target = hit?.object;
    while (target && !target.userData.kind) target = target.parent;
    const index = target?.userData.index;
    this.pickVisuals.forEach((item, position) => {
      const tilt = position === index ? -0.07 : 0;
      item.visual.rotation.x = tilt;
      item.label.rotation.x = tilt;
    });
  }

  startLoop() {
    if (!this.renderer || this.running || document.hidden) return;
    this.running = true;
    const frame = (time) => {
      if (!this.running || !this.renderer) return;
      this.tweens = this.tweens.filter((tween) => {
        const progress = THREE.MathUtils.clamp((time - tween.start) / tween.duration, 0, 1);
        tween.update(progress);
        return progress < 1;
      });
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(frame);
    };
    this.frameId = requestAnimationFrame(frame);
  }

  visibilityChanged() {
    if (document.hidden) {
      this.running = false;
      if (this.frameId !== null) cancelAnimationFrame(this.frameId);
      this.frameId = null;
    } else this.startLoop();
  }
}
