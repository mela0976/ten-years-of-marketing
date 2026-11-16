import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const failures = [];
const results = [];
const maxTotal = 50 * 1024 * 1024;
const maxFile = 100 * 1024 * 1024;
const maxTexture = 300 * 1024;
const ktxIdentifier = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);

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

function record(name, passed, details = '') {
  results.push({ name, passed, details });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${details ? ` — ${details}` : ''}`);
  if (!passed) failures.push(`${name}${details ? `: ${details}` : ''}`);
}

let distInfo;
try {
  distInfo = await stat(dist);
} catch {
  throw new Error('dist/ does not exist. Run npm run build first.');
}
if (!distInfo.isDirectory()) throw new Error('dist is not a directory.');

const files = (await walk(dist)).sort();
const fileNames = files.map((file) => relative(dist, file).split(sep).join('/'));
const fileSet = new Set(fileNames);
const sizes = new Map();
let totalBytes = 0;
console.log('dist/ file sizes:');
for (const [index, file] of files.entries()) {
  const info = await stat(file);
  const name = fileNames[index];
  sizes.set(name, info.size);
  totalBytes += info.size;
  console.log(`  ${name}\t${info.size.toLocaleString('en-US')} B`);
}

const textFiles = files.filter((file) => /\.(html|js|css)$/i.test(file));
const references = new Set();
let absolutePathFound = false;
let externalResourceFound = false;
let compressedFiles = 0;
let compressedFilesPassed = 0;
for (const file of textFiles) {
  const contents = await readFile(file, 'utf8');
  const name = relative(dist, file).split(sep).join('/');
  // Keep meaningful multiline GLSL/template literals out of the source-layout
  // metric; their embedded line breaks are shader input, not JS formatting.
  const measurableContents = /\.js$/i.test(file)
    ? contents.replace(/`(?:\\.|[^`])*`/gs, '``')
    : contents;
  const normalizedLines = measurableContents.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const averageLineLength = normalizedLines.length
    ? normalizedLines.reduce((sum, line) => sum + line.length, 0) / normalizedLines.length
    : 0;
  if (/\.(js|css)$/i.test(file)) {
    compressedFiles += 1;
    if (averageLineLength > 500) compressedFilesPassed += 1;
    else console.log(`  Minification detail: ${name} average line ${averageLineLength.toFixed(1)} chars (needs > 500).`);
  }
  if (/['"`]\/(?:assets|models|audio|draco|basis|textures)\//.test(contents)) {
    absolutePathFound = true;
    console.log(`  Absolute path detail: ${name}`);
  }
  const externalUrls = [...contents.matchAll(/https?:\/\/[^\s"'`)>]+/g)]
    .map((match) => match[0])
    .filter((url) => !/^https?:\/\/(?:www\.)?w3\.org\//i.test(url));
  const requests = contents.match(/(?:src|href)\s*=\s*["']https?:\/\/|url\(\s*["']?https?:\/\/|\b(?:fetch|import)\s*\(\s*["'`]https?:\/\//g);
  if (externalUrls.length || requests) {
    externalResourceFound = true;
    console.log(`  External resource detail: ${name} ${externalUrls[0] ?? requests[0]}`);
  }
  for (const match of contents.matchAll(/(?:\.\/)?(models|audio|draco|basis|textures)\/([a-z0-9][a-z0-9._-]*)/g)) {
    references.add(`${match[1]}/${match[2]}`);
  }
}
const allText = (await Promise.all(textFiles.map((file) => readFile(file, 'utf8')))).join('\n');
const dynamicPathTemplates = [
  { marker: 'models/${', paths: ['models/bottle.glb', 'models/tablet.glb', 'models/figure.glb', 'models/gate.glb'] },
  { marker: 'audio/${', paths: ['audio/click.mp3', 'audio/correct.mp3', 'audio/wrong.mp3', 'audio/flip.mp3', 'audio/bgm.mp3'] },
  { marker: 'draco/', paths: ['draco/draco_decoder.js', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js'] },
  { marker: 'basis/', paths: ['basis/basis_transcoder.js', 'basis/basis_transcoder.wasm'] },
];
for (const template of dynamicPathTemplates) {
  if (allText.includes(template.marker)) template.paths.forEach((path) => references.add(path));
}
const unresolvedReferences = [...references].filter((reference) => !fileSet.has(reference));
record('全部相對路徑', !absolutePathFound && !externalResourceFound && unresolvedReferences.length === 0,
  absolutePathFound || externalResourceFound || unresolvedReferences.length
    ? [...unresolvedReferences, absolutePathFound ? 'absolute URL path' : '', externalResourceFound ? 'external resource URL' : ''].filter(Boolean).join(', ')
    : `${references.size} 個程式引用路徑皆相對且檔案大小寫完全相符`);

for (const required of [
  'index.html',
  'models/bottle.glb', 'models/tablet.glb', 'models/figure.glb', 'models/gate.glb',
  'audio/click.mp3', 'audio/correct.mp3', 'audio/wrong.mp3', 'audio/flip.mp3', 'audio/bgm.mp3',
  'draco/draco_decoder.js', 'draco/draco_decoder.wasm', 'draco/draco_wasm_wrapper.js',
  'basis/basis_transcoder.js', 'basis/basis_transcoder.wasm',
]) {
  if (!fileSet.has(required)) failures.push(`required deployment file is missing: ${required}`);
}

const glbFiles = files.filter((file) => file.endsWith('.glb'));
let validGlbCount = 0;
let dracoGlbCount = 0;
for (const file of glbFiles) {
  const bytes = await readFile(file);
  const name = relative(dist, file).split(sep).join('/');
  const magic = bytes.toString('ascii', 0, 4);
  const jsonLength = bytes.readUInt32LE(12);
  const jsonType = bytes.readUInt32LE(16);
  if (magic !== 'glTF' || jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > bytes.length) {
    console.log(`  Invalid GLB header: ${name}`);
    continue;
  }
  validGlbCount += 1;
  const document = JSON.parse(bytes.toString('utf8', 20, 20 + jsonLength));
  if (document.extensionsUsed?.includes('KHR_draco_mesh_compression')) dracoGlbCount += 1;
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
    console.log(`  GLB bounds unavailable: ${name}`);
  } else if (max[1] - min[1] + 1e-5 < Math.max(max[0] - min[0], max[2] - min[2])) {
    console.log(`  GLB is not tallest on Y: ${name}`);
    failures.push(`GLB must be tallest on Y: ${name}`);
  }
}
record('GLB 模型', glbFiles.length > 0 && validGlbCount === glbFiles.length, `${validGlbCount}/${glbFiles.length} 個 GLB 標頭有效`);
record('Draco 壓縮', glbFiles.length > 0 && dracoGlbCount === glbFiles.length, `${dracoGlbCount}/${glbFiles.length} 個 GLB 使用 KHR_draco_mesh_compression`);

const ktxFiles = files.filter((file) => file.endsWith('.ktx2'));
let validKtxCount = 0;
for (const file of ktxFiles) {
  const bytes = await readFile(file);
  const name = relative(dist, file).split(sep).join('/');
  const identifierMatches = bytes.length >= 48 && bytes.subarray(0, 12).equals(ktxIdentifier);
  if (!identifierMatches) {
    console.log(`  Invalid KTX2 identifier: ${name}`);
    continue;
  }
  const vkFormat = bytes.readUInt32LE(12);
  const width = bytes.readUInt32LE(20);
  const height = bytes.readUInt32LE(24);
  const levels = bytes.readUInt32LE(40);
  const supercompression = bytes.readUInt32LE(44);
  const size = sizes.get(name);
  const valid = vkFormat === 0 && width > 0 && height > 0 && levels > 1 && size <= maxTexture;
  if (valid) validKtxCount += 1;
  console.log(`  KTX2 detail: ${name} ${width}x${height}, ${size.toLocaleString('en-US')} B, vkFormat=${vkFormat}, mip levels=${levels}, supercompression scheme=${supercompression}`);
}
record('KTX2 貼圖', ktxFiles.length > 0 && validKtxCount === ktxFiles.length,
  `${validKtxCount}/${ktxFiles.length} 個 KTX2 通過識別碼、Basis vkFormat=0、mipmap 與 ≤ 300 KB`);
record('JS/CSS 已壓縮', compressedFiles > 0 && compressedFilesPassed === compressedFiles,
  `${compressedFilesPassed}/${compressedFiles} 個 JS/CSS 平均行長 > 500 字元`);
record('WASM 存在', files.some((file) => file.endsWith('.wasm')), `${files.filter((file) => file.endsWith('.wasm')).length} 個 WASM 檔`);

const sfxNames = ['audio/click.mp3', 'audio/correct.mp3', 'audio/wrong.mp3', 'audio/flip.mp3'];
const sfxSizes = sfxNames.map((name) => sizes.get(name));
record('短音效皆 ≤ 50 KB', sfxSizes.every((size) => size !== undefined && size <= 50 * 1024),
  sfxNames.map((name, index) => `${name}=${sfxSizes[index] ?? 'missing'} B`).join(', '));
const bgmSize = sizes.get('audio/bgm.mp3');
const bgmBitrate = bgmSize === undefined ? Infinity : bgmSize * 8 / 20 / 1000;
record('背景音樂 ≤ 128 kbps', bgmBitrate <= 128, `${bgmBitrate.toFixed(1)} kbps（依 20 秒與 ${bgmSize ?? 'missing'} B 估算）`);
record('單檔 ≤ 100 MB', [...sizes.values()].every((size) => size <= maxFile), `${Math.max(0, ...sizes.values()).toLocaleString('en-US')} B 最大`);
record('總大小 ≤ 50 MB', totalBytes <= maxTotal, `${totalBytes.toLocaleString('en-US')} B（${(totalBytes / 1024 / 1024).toFixed(3)} MiB）`);
record('檔名全小寫', fileNames.every((name) => !/[A-Z]/.test(name)), '檢查 dist/ 所有相對檔名');
record('無 .br', !fileNames.some((name) => name.endsWith('.br')), '檢查 dist/ 所有檔案');
record('無 PNG/JPG/JPEG', !fileNames.some((name) => /\.(png|jpe?g)$/i.test(name)), '不包含點陣影像素材');
for (const directory of ['assets', 'models', 'textures', 'audio']) {
  record(`目錄含 ${directory}/`, fileNames.some((name) => name.startsWith(`${directory}/`)),
    fileNames.some((name) => name.startsWith(`${directory}/`)) ? '存在' : '不存在');
}

console.log('\n部署檢查對照表');
console.log('檢查項目\t結果');
for (const { name, passed } of results) console.log(`${name}\t${passed ? 'PASS' : 'FAIL'}`);
console.log(`整體\t${failures.length ? 'FAIL' : 'PASS'}`);
if (failures.length) {
  console.error(`\n${failures.length} 項部署檢查失敗：`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exitCode = 1;
} else {
  console.log('全部檢查通過。');
}
