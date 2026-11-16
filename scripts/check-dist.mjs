import { readdir, readFile, stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative, resolve, sep } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const maxTotal = 5 * 1024 * 1024;
const maxFile = 1.5 * 1024 * 1024;
const failures = [];

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await walk(fullPath));
    else if (entry.isFile()) files.push(fullPath);
  }
  return files;
}

function fail(message) {
  failures.push(message);
  console.error(`FAIL ${message}`);
}

let distStat;
try {
  distStat = await stat(dist);
} catch {
  throw new Error('dist/ does not exist. Run npm run build first.');
}
if (!distStat.isDirectory()) throw new Error('dist is not a directory.');

const files = await walk(dist);
let totalBytes = 0;
console.log('dist/ file sizes:');
for (const file of files.sort()) {
  const info = await stat(file);
  const name = relative(dist, file).split(sep).join('/');
  totalBytes += info.size;
  console.log(`  ${name}\t${info.size.toLocaleString('en-US')} B`);
  if (/[A-Z]/.test(name)) fail(`filename must be lowercase: ${name}`);
  if (info.size > maxFile) fail(`file exceeds 1.5 MB: ${name} (${info.size} B)`);
  if (name.endsWith('.br')) fail(`unexpected Brotli file: ${name}`);
}

console.log(`Total: ${totalBytes.toLocaleString('en-US')} B (${(totalBytes / 1024 / 1024).toFixed(3)} MB)`);
if (totalBytes > maxTotal) fail(`dist exceeds 5 MB (${totalBytes} B)`);

const requiredPaths = [
  'index.html',
  'models/bottle.glb', 'models/tablet.glb', 'models/figure.glb', 'models/gate.glb',
  'audio/click.mp3', 'audio/correct.mp3', 'audio/wrong.mp3', 'audio/flip.mp3', 'audio/bgm.mp3',
  'draco/draco_decoder.js', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js',
];
const dynamicPathTemplates = [
  { marker: 'models/${', paths: ['models/bottle.glb', 'models/tablet.glb', 'models/figure.glb', 'models/gate.glb'] },
  { marker: 'audio/${', paths: ['audio/click.mp3', 'audio/correct.mp3', 'audio/wrong.mp3', 'audio/flip.mp3', 'audio/bgm.mp3'] },
  { marker: 'draco/', paths: ['draco/draco_decoder.js', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js'] },
];
const fileSet = new Set(files.map((file) => relative(dist, file).split(sep).join('/')));
for (const required of requiredPaths) {
  if (!fileSet.has(required)) fail(`required deployment file is missing: ${required}`);
}

const textFiles = files.filter((file) => /\.(html|js|css)$/.test(file));
const references = new Set();
const allText = [];
for (const file of textFiles) {
  const contents = await readFile(file, 'utf8');
  allText.push(contents);
  const name = relative(dist, file).split(sep).join('/');
  if (/['"`]\/(?:assets|models|audio|draco)\//.test(contents)) {
    fail(`absolute deployment path found in ${name}`);
  }
  const externalUrls = [...contents.matchAll(/https?:\/\/[^\s"'`)>]+/g)]
    .map((match) => match[0])
    .filter((url) => !/^https?:\/\/(?:www\.)?w3\.org\//i.test(url));
  if (externalUrls.length) fail(`external URL found in ${name}: ${externalUrls[0]}`);

  const requests = contents.match(/(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|\b(?:fetch|import)\s*\(\s*["'`]https?:\/\//g);
  if (requests) fail(`external resource request found in ${name}: ${requests[0]}`);

  for (const match of contents.matchAll(/(?:\.\/)?(models|audio|draco)\/([a-z0-9][a-z0-9._-]*)/g)) {
    references.add(`${match[1]}/${match[2]}`);
  }
}
const bundledText = allText.join('\n');
for (const template of dynamicPathTemplates) {
  if (!bundledText.includes(template.marker)) continue;
  for (const path of template.paths) references.add(path);
}
for (const reference of references) {
  if (!fileSet.has(reference)) fail(`referenced asset is missing or has a case mismatch: ${reference}`);
}
console.log(`Checked ${textFiles.length} HTML/JS/CSS files and ${references.size} referenced asset paths.`);

const glbFiles = files.filter((file) => file.endsWith('.glb'));
if (glbFiles.length === 0) fail('no GLB models were found.');
for (const file of glbFiles) {
  const bytes = await readFile(file);
  const magic = bytes.toString('ascii', 0, 4);
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (magic !== 'glTF' || jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > bytes.length) {
    fail(`invalid GLB header: ${relative(dist, file)}`);
    continue;
  }
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  if (!document.extensionsUsed?.includes('KHR_draco_mesh_compression')) {
    fail(`GLB is missing Draco compression: ${relative(dist, file)}`);
  }
  const positionAccessors = document.accessors?.filter((accessor, index) =>
    accessor.type === 'VEC3' && document.meshes?.some((mesh) => mesh.primitives?.some((primitive) => primitive.attributes?.POSITION === index)),
  ) ?? [];
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const accessor of positionAccessors) {
    if (!accessor.min || !accessor.max) continue;
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis], accessor.min[axis]);
      max[axis] = Math.max(max[axis], accessor.max[axis]);
    }
  }
  if (min.some((value) => !Number.isFinite(value))) {
    fail(`GLB has no measurable POSITION bounds: ${relative(dist, file)}`);
  } else {
    const size = max.map((value, axis) => value - min[axis]);
    console.log(`  ${relative(dist, file)} bounds: X ${min[0].toFixed(3)}–${max[0].toFixed(3)}, Y ${min[1].toFixed(3)}–${max[1].toFixed(3)}, Z ${min[2].toFixed(3)}–${max[2].toFixed(3)}`);
    if (size[1] + 1e-5 < size[0] || size[1] + 1e-5 < size[2]) {
      fail(`GLB must be tallest on Y: ${relative(dist, file)} (X ${size[0].toFixed(3)}, Y ${size[1].toFixed(3)}, Z ${size[2].toFixed(3)})`);
    }
  }
  if (bytes.length >= 50 * 1024) fail(`GLB must be smaller than 50 KB: ${relative(dist, file)} (${bytes.length} B)`);
}
const dracoLibraryCopies = files.filter((file) => /(?:draco_decoder|draco_wasm_wrapper)\.(?:js|wasm)$/.test(file));
for (const file of dracoLibraryCopies) {
  if (!relative(dist, file).split(sep).join('/').startsWith('draco/')) {
    fail(`Draco decoder must be served from dist/draco/ only: ${relative(dist, file)}`);
  }
}
console.log(`Checked Draco compression in ${glbFiles.length} GLB files.`);

if (failures.length) process.exitCode = 1;
else console.log('PASS npm run check: deployment files satisfy size, path, name, and Draco requirements.');
