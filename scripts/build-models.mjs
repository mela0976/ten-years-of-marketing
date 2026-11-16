import { Accessor, Document, NodeIO, Primitive } from '@gltf-transform/core';
import { draco } from '@gltf-transform/functions';
import { createRequire } from 'node:module';
import { mkdir, stat, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const draco3d = require('draco3dgltf');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const modelsDir = path.join(projectRoot, 'public', 'models');
const MAX_GLB_BYTES = 50 * 1024;

class Geometry {
  positions = [];
  colors = [];
  indices = [];

  vertex(position, color) {
    const index = this.positions.length / 3;
    // Geometry helpers below are authored in a convenient Z-up / -Y-front
    // coordinate system. glTF uses +Y up, so bake that conversion into vertices:
    // old (x, depth, height) -> glTF (x, height, -depth), making the front +Z.
    this.positions.push(position[0], position[2], -position[1]);
    this.colors.push(...color);
    return index;
  }

  triangle(a, b, c) {
    this.indices.push(a, b, c);
  }

  quad(a, b, c, d) {
    this.triangle(a, b, c);
    this.triangle(a, c, d);
  }

  addBox(min, max, color) {
    const [x0, y0, z0] = min;
    const [x1, y1, z1] = max;
    const points = [
      [x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0],
      [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1],
    ];
    const v = points.map((point) => this.vertex(point, color));
    for (const face of [
      [v[4], v[5], v[6], v[7]], [v[1], v[0], v[3], v[2]],
      [v[5], v[1], v[2], v[6]], [v[0], v[4], v[7], v[3]],
      [v[3], v[7], v[6], v[2]], [v[0], v[1], v[5], v[4]],
    ]) this.quad(...face);
  }

  addLathe(profile, segments, color) {
    const rings = profile.map(({ z, radius, tint = color }) =>
      Array.from({ length: segments }, (_, i) => {
        const angle = 2 * Math.PI * i / segments;
        return this.vertex([radius * Math.cos(angle), radius * Math.sin(angle), z], tint);
      }),
    );
    for (let r = 0; r < rings.length - 1; r++) {
      for (let i = 0; i < segments; i++) {
        const next = (i + 1) % segments;
        this.quad(rings[r][i], rings[r][next], rings[r + 1][next], rings[r + 1][i]);
      }
    }
    const bottomCenter = this.vertex([0, 0, profile[0].z], profile[0].tint ?? color);
    const top = profile.at(-1);
    const topCenter = this.vertex([0, 0, top.z], top.tint ?? color);
    for (let i = 0; i < segments; i++) {
      const next = (i + 1) % segments;
      this.triangle(bottomCenter, rings[0][next], rings[0][i]);
      this.triangle(topCenter, rings.at(-1)[i], rings.at(-1)[next]);
    }
  }

  addChamferedPanel(width, height, depth, centerZ, corner, color) {
    const x = width / 2;
    const z0 = centerZ - height / 2;
    const z1 = centerZ + height / 2;
    const outline = [
      [-x + corner, z0], [x - corner, z0], [x, z0 + corner], [x, z1 - corner],
      [x - corner, z1], [-x + corner, z1], [-x, z1 - corner], [-x, z0 + corner],
    ];
    const frontY = -depth / 2;
    const backY = depth / 2;
    const front = outline.map(([px, pz]) => this.vertex([px, frontY, pz], color));
    const back = outline.map(([px, pz]) => this.vertex([px, backY, pz], color));
    const frontCenter = this.vertex([0, frontY, centerZ], color);
    const backCenter = this.vertex([0, backY, centerZ], color);
    for (let i = 0; i < outline.length; i++) {
      const next = (i + 1) % outline.length;
      this.triangle(frontCenter, front[i], front[next]);
      this.triangle(backCenter, back[next], back[i]);
      this.quad(front[i], back[i], back[next], front[next]);
    }
  }

  addQuadOnFront(points, y, color) {
    const vertices = points.map(([x, z]) => this.vertex([x, y, z], color));
    this.quad(...vertices);
  }

  addArch(innerRadius, outerRadius, centerZ, depth, segments, color) {
    const frontY = -depth / 2;
    const backY = depth / 2;
    const outerFront = [];
    const innerFront = [];
    const outerBack = [];
    const innerBack = [];
    for (let i = 0; i <= segments; i++) {
      const angle = Math.PI - Math.PI * i / segments;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      outerFront.push(this.vertex([outerRadius * cos, frontY, centerZ + outerRadius * sin], color));
      innerFront.push(this.vertex([innerRadius * cos, frontY, centerZ + innerRadius * sin], color));
      outerBack.push(this.vertex([outerRadius * cos, backY, centerZ + outerRadius * sin], color));
      innerBack.push(this.vertex([innerRadius * cos, backY, centerZ + innerRadius * sin], color));
    }
    for (let i = 0; i < segments; i++) {
      const n = i + 1;
      // Front and back annular faces.
      this.quad(outerFront[i], innerFront[i], innerFront[n], outerFront[n]);
      this.quad(outerBack[i], outerBack[n], innerBack[n], innerBack[i]);
      // Outer and inner curved faces.
      this.quad(outerFront[i], outerFront[n], outerBack[n], outerBack[i]);
      this.quad(innerFront[i], innerBack[i], innerBack[n], innerFront[n]);
    }
    this.quad(outerFront[0], outerBack[0], innerBack[0], innerFront[0]);
    this.quad(outerFront.at(-1), outerBack.at(-1), innerBack.at(-1), innerFront.at(-1));
  }

  addSphere(center, radius, latitudeSegments, longitudeSegments, color) {
    const [cx, cy, cz] = center;
    const south = this.vertex([cx, cy, cz - radius], color);
    const rings = [];
    for (let lat = 1; lat < latitudeSegments; lat++) {
      const phi = -Math.PI / 2 + Math.PI * lat / latitudeSegments;
      const ring = [];
      for (let lon = 0; lon < longitudeSegments; lon++) {
        const theta = 2 * Math.PI * lon / longitudeSegments;
        ring.push(this.vertex([
          cx + radius * Math.cos(phi) * Math.cos(theta),
          cy + radius * Math.cos(phi) * Math.sin(theta),
          cz + radius * Math.sin(phi),
        ], color));
      }
      rings.push(ring);
    }
    const north = this.vertex([cx, cy, cz + radius], color);
    for (let lon = 0; lon < longitudeSegments; lon++) {
      const next = (lon + 1) % longitudeSegments;
      this.triangle(south, rings[0][next], rings[0][lon]);
      this.triangle(rings.at(-1)[lon], rings.at(-1)[next], north);
    }
    for (let lat = 0; lat < rings.length - 1; lat++) {
      for (let lon = 0; lon < longitudeSegments; lon++) {
        const next = (lon + 1) % longitudeSegments;
        this.quad(rings[lat][lon], rings[lat][next], rings[lat + 1][next], rings[lat + 1][lon]);
      }
    }
  }
}

const bottle = new Geometry();
const bottleRadius = (radius) => radius * 0.76;
bottle.addLathe([
  { z: 0.00, radius: bottleRadius(0.34), tint: [0.17, 0.58, 0.39] },
  { z: 0.04, radius: bottleRadius(0.40) }, { z: 0.12, radius: bottleRadius(0.42) },
  { z: 0.20, radius: bottleRadius(0.34) }, { z: 0.31, radius: bottleRadius(0.24) },
  { z: 0.45, radius: bottleRadius(0.20) }, { z: 0.53, radius: bottleRadius(0.18) },
  { z: 0.57, radius: bottleRadius(0.14) }, { z: 0.69, radius: bottleRadius(0.14) },
  { z: 0.72, radius: bottleRadius(0.16), tint: [0.91, 0.72, 0.29] },
], 20, [0.24, 0.72, 0.52]);

const tablet = new Geometry();
tablet.addChamferedPanel(1.72, 1.2, 0.12, 1.18, 0.1, [0.76, 0.79, 0.78]);
tablet.addQuadOnFront([
  [-0.76, 0.82], [0.76, 0.82], [0.76, 1.54], [-0.76, 1.54],
], -0.063, [0.13, 0.30, 0.36]);
tablet.addQuadOnFront([
  [-0.62, 1.36], [0.30, 1.36], [0.30, 1.41], [-0.62, 1.41],
], -0.065, [0.63, 0.86, 0.78]);
tablet.addQuadOnFront([
  [-0.62, 1.20], [0.55, 1.20], [0.55, 1.24], [-0.62, 1.24],
], -0.065, [0.43, 0.66, 0.66]);
tablet.addBox([-0.10, 0.06, 0.08], [0.10, 0.37, 0.73], [0.48, 0.52, 0.50]);
tablet.addBox([-0.48, -0.18, 0.00], [0.48, 0.42, 0.09], [0.50, 0.55, 0.52]);

const figure = new Geometry();
figure.addLathe([
  { z: 0.88, radius: 0.16, tint: [0.20, 0.34, 0.65] },
  { z: 0.98, radius: 0.21 }, { z: 1.28, radius: 0.30 },
  { z: 1.42, radius: 0.28 }, { z: 1.49, radius: 0.18 },
], 12, [0.28, 0.45, 0.74]);
figure.addSphere([0, 0, 1.72], 0.235, 8, 12, [0.86, 0.63, 0.43]);
figure.addBox([-0.57, -0.12, 1.14], [-0.31, 0.12, 1.30], [0.80, 0.57, 0.39]);
figure.addBox([0.31, -0.12, 1.14], [0.57, 0.12, 1.30], [0.80, 0.57, 0.39]);
figure.addBox([-0.23, -0.14, 0.13], [-0.04, 0.14, 0.88], [0.18, 0.28, 0.55]);
figure.addBox([0.04, -0.14, 0.13], [0.23, 0.14, 0.88], [0.18, 0.28, 0.55]);
figure.addBox([-0.25, -0.22, 0.00], [-0.02, 0.22, 0.14], [0.16, 0.17, 0.19]);
figure.addBox([0.02, -0.22, 0.00], [0.25, 0.22, 0.14], [0.16, 0.17, 0.19]);

const gate = new Geometry();
gate.addBox([-1.35, -0.18, 0], [-1.05, 0.18, 1.82], [0.75, 0.43, 0.18]);
gate.addBox([1.05, -0.18, 0], [1.35, 0.18, 1.82], [0.75, 0.43, 0.18]);
gate.addArch(0.98, 1.25, 1.82, 0.36, 16, [0.86, 0.61, 0.25]);
gate.addBox([-1.48, -0.25, 0], [-0.92, 0.25, 0.12], [0.70, 0.38, 0.16]);
gate.addBox([0.92, -0.25, 0], [1.48, 0.25, 0.12], [0.70, 0.38, 0.16]);

function addNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const ia = indices[i] * 3;
    const ib = indices[i + 1] * 3;
    const ic = indices[i + 2] * 3;
    const abx = positions[ib] - positions[ia];
    const aby = positions[ib + 1] - positions[ia + 1];
    const abz = positions[ib + 2] - positions[ia + 2];
    const acx = positions[ic] - positions[ia];
    const acy = positions[ic + 1] - positions[ia + 1];
    const acz = positions[ic + 2] - positions[ia + 2];
    const nx = aby * acz - abz * acy;
    const ny = abz * acx - abx * acz;
    const nz = abx * acy - aby * acx;
    for (const index of [ia, ib, ic]) {
      normals[index] += nx;
      normals[index + 1] += ny;
      normals[index + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const length = Math.hypot(normals[i], normals[i + 1], normals[i + 2]) || 1;
    normals[i] /= length;
    normals[i + 1] /= length;
    normals[i + 2] /= length;
  }
  return normals;
}

async function writeModel(name, geometry) {
  const doc = new Document();
  const buffer = doc.createBuffer('buffer');
  const material = doc.createMaterial(`${name}-vertex-colors`)
    .setBaseColorFactor([1, 1, 1, 1])
    .setMetallicFactor(0)
    .setRoughnessFactor(0.82)
    .setDoubleSided(true);
  const positions = new Float32Array(geometry.positions);
  const indices = new Uint16Array(geometry.indices);
  const primitive = doc.createPrimitive()
    .setMode(Primitive.Mode.TRIANGLES)
    .setAttribute('POSITION', doc.createAccessor(`${name}-positions`, buffer).setType(Accessor.Type.VEC3).setArray(positions))
    .setAttribute('NORMAL', doc.createAccessor(`${name}-normals`, buffer).setType(Accessor.Type.VEC3).setArray(addNormals(positions, indices)))
    .setAttribute('COLOR_0', doc.createAccessor(`${name}-colors`, buffer).setType(Accessor.Type.VEC3).setArray(new Float32Array(geometry.colors)))
    .setIndices(doc.createAccessor(`${name}-indices`, buffer).setType(Accessor.Type.SCALAR).setArray(indices))
    .setMaterial(material);
  const mesh = doc.createMesh(`${name}-mesh`).addPrimitive(primitive);
  const scene = doc.createScene('Scene').addChild(doc.createNode(name).setMesh(mesh));
  doc.getRoot().setDefaultScene(scene);
  await doc.transform(draco({ method: 'edgebreaker', encodeSpeed: 5, decodeSpeed: 5 }));

  const extensionTypes = [...new Set(doc.getRoot().listExtensionsUsed().map((extension) => extension.constructor))];
  const encoder = await draco3d.createEncoderModule();
  const io = new NodeIO().registerExtensions(extensionTypes).registerDependencies({ 'draco3d.encoder': encoder });
  const outputPath = path.join(modelsDir, `${name}.glb`);
  await io.write(outputPath, doc);

  const bytes = (await stat(outputPath)).size;
  const glb = await readFile(outputPath);
  const jsonLength = glb.readUInt32LE(12);
  const json = JSON.parse(glb.subarray(20, 20 + jsonLength).toString('utf8').trim());
  if (!json.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
    throw new Error(`${name}: missing KHR_draco_mesh_compression in GLB JSON`);
  }
  if (bytes >= MAX_GLB_BYTES) throw new Error(`${name}: ${bytes} bytes exceeds ${MAX_GLB_BYTES - 1}`);
  console.log(`${name}.glb: ${bytes} bytes, ${geometry.indices.length / 3} input triangles, KHR_draco_mesh_compression present`);
}

await mkdir(modelsDir, { recursive: true });
for (const [name, geometry] of Object.entries({ bottle, tablet, figure, gate })) {
  await writeModel(name, geometry);
}
