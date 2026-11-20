import * as THREE from 'three';
import playerRig from './player-rig.json';
import companionRig from './companion-rig.json';
import bystanderRig from './bystander-rig.json';

function geometryFor(shape, width, height) {
  if (shape === 'ellipse') return new THREE.CircleGeometry(0.5, 24);
  if (shape === 'triangle') {
    const geometry = new THREE.BufferGeometry();
    const vertices = new Float32Array([-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0]);
    geometry.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
    geometry.computeVertexNormals();
    return geometry;
  }
  if (shape === 'trapezoid') {
    const path = new THREE.Shape();
    path.moveTo(-width * 0.46, -height * 0.5);
    path.lineTo(width * 0.46, -height * 0.5);
    path.lineTo(width * 0.35, height * 0.5);
    path.lineTo(-width * 0.35, height * 0.5);
    path.closePath();
    return new THREE.ShapeGeometry(path);
  }
  if (shape === 'capsule' || shape === 'roundRect') {
    const radius = Math.min(width, height) * 0.46;
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
    return new THREE.ShapeGeometry(path);
  }
  return new THREE.PlaneGeometry(width, height);
}

function makePart(definition, order, assets, assetId) {
  const part = new THREE.Group();
  const [pivotX = 0, pivotY = 0] = definition.pivot ?? [0, 0];
  part.position.set(pivotX, pivotY, order * 0.01);
  const [offsetX = 0, offsetY = 0] = definition.offset ?? [0, 0];
  if (definition.shape !== 'group') {
    const [width, height] = definition.size;
    const image = assets?.get(assetId);
    const texture = image ? new THREE.Texture(image) : null;
    if (texture) {
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.needsUpdate = true;
    }
    // 有貼圖時一律用矩形平面，UV 才會完整對應整張部件圖；tint 用來壓暗遠側肢體。
    const mesh = new THREE.Mesh(image ? new THREE.PlaneGeometry(width, height) : geometryFor(definition.shape, width, height), new THREE.MeshBasicMaterial({
      color: image ? (definition.tint ?? '#ffffff') : definition.color,
      map: texture,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      depthTest: false,
    }));
    mesh.position.set(offsetX, offsetY, 0.01);
    if (!image && (definition.shape === 'ellipse' || definition.shape === 'triangle')) mesh.scale.set(width, height, 1);
    if (definition.rotation) mesh.rotation.z = definition.rotation;
    // 角色層介於主舞台（300 起）與前景（500 起）之間。
    mesh.renderOrder = 450 + order;
    part.add(mesh);
  }
  return part;
}

export class ArticulatedFigure {
  constructor(definition, { scale = 1, faceLeft = false, assets = null } = {}) {
    this.definition = definition;
    this.assets = assets;
    this.root = new THREE.Group();
    this.root.scale.setScalar(scale);
    if (faceLeft) this.root.scale.x *= -1;
    this.joints = new Map();
    const partById = new Map();
    definition.parts.forEach((part, index) => {
      const assetId = part.asset ?? `${definition.id}-${part.id}`.toLowerCase();
      const group = makePart(part, index, assets, assetId);
      this.joints.set(part.joint ?? part.id, group);
      partById.set(part.id, group);
      if (part.parent && partById.has(part.parent)) partById.get(part.parent).add(group);
      else this.root.add(group);
    });
    this.root.traverse((node) => {
      if (node.isMesh) node.material.side = THREE.DoubleSide;
    });
    this.baseY = 0;
  }

  update(worldX, timeSeconds, moving = false, pose = 'walk') {
    this.root.position.x = worldX;
    const phase = (worldX / (this.definition.strideLength ?? 72)) * Math.PI * 2;
    const swing = moving ? Math.sin(phase) : 0;
    const stance = moving ? Math.max(0, -Math.cos(phase)) : 0;
    this.root.position.y = this.baseY + (moving ? Math.max(0, Math.sin(phase * 2)) * 2 : 0);
    const angles = pose === 'walk' ? {
      legFar: swing * 0.45, legNear: -swing * 0.45,
      shinFar: stance * 0.4, shinNear: (1 - stance) * 0.4,
      footFar: -swing * 0.2, footNear: swing * 0.2,
      armFar: -swing * 0.26, armNear: swing * 0.26,
      forearmFar: stance * 0.18, forearmNear: (1 - stance) * 0.18,
      wing: swing * 0.08,
    } : pose === 'ride' ? {
      legFar: 1.25, legNear: 1.15, shinFar: -1.3, shinNear: -1.2, armFar: 0.9, armNear: 0.8, forearmFar: 0.5, forearmNear: 0.5,
    } : pose === 'wave' ? { wave: Math.sin(timeSeconds * 5) * 0.55 - 0.75 } : {};
    for (const [name, angle] of Object.entries(angles)) {
      const joint = this.joints.get(name);
      if (joint) joint.rotation.z = angle;
    }
    for (const [name, joint] of this.joints) {
      if (!Object.hasOwn(angles, name)) joint.rotation.z = 0;
    }
  }

  dispose() {
    this.root.traverse((node) => {
      if (!node.isMesh) return;
      node.geometry.dispose();
      if (node.material.map) node.material.map.dispose();
      node.material.dispose();
    });
  }
}

export function createTraveler(assets) {
  return new ArticulatedFigure(playerRig, { scale: 1, assets });
}

export function createCompanion(assets) {
  return new ArticulatedFigure(companionRig, { scale: 1, assets });
}

export function createBystander(assets) {
  return new ArticulatedFigure(bystanderRig, { scale: 1, assets });
}
