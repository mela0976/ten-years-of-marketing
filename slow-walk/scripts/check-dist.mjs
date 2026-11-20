import assert from 'node:assert/strict';
import { readFile, readdir, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const distRoot = path.join(projectRoot, 'dist');
const artRoot = path.join(distRoot, 'art');
const bytesPerMB = 1_000_000;
const failures = [];
const messages = [];

function check(condition, message) {
  if (condition) messages.push(`✓ ${message}`);
  else failures.push(message);
}

async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name);
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(absolute, relative));
    else if (entry.isFile()) files.push({ relative, absolute });
  }
  return files;
}

function read24(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8) | (buffer[offset + 2] << 16);
}

function webpDimensions(buffer) {
  if (buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WEBP') return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const kind = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (data + size > buffer.length) return null;
    if (kind === 'VP8X' && size >= 10) {
      return { width: read24(buffer, data + 4) + 1, height: read24(buffer, data + 7) + 1 };
    }
    if (kind === 'VP8L' && size >= 5 && buffer[data] === 0x2f) {
      const b1 = buffer[data + 1];
      const b2 = buffer[data + 2];
      const b3 = buffer[data + 3];
      const b4 = buffer[data + 4];
      return {
        width: 1 + b1 + ((b2 & 0x3f) << 8),
        height: 1 + ((b2 & 0xc0) >> 6) + (b3 << 2) + ((b4 & 0x0f) << 10),
      };
    }
    if (kind === 'VP8 ' && size >= 10 && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return {
        width: buffer.readUInt16LE(data + 6) & 0x3fff,
        height: buffer.readUInt16LE(data + 8) & 0x3fff,
      };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

function isRelativeReference(value) {
  return !value.startsWith('/') && !/^https?:/i.test(value) && !value.startsWith('//');
}

async function main() {
  let packageJson;
  let lock;
  try {
    [packageJson, lock] = await Promise.all([
      readFile(path.join(projectRoot, 'package.json'), 'utf8').then(JSON.parse),
      readFile(path.join(projectRoot, 'package-lock.json'), 'utf8').then(JSON.parse),
    ]);
  } catch (error) {
    failures.push(`無法讀取套件鎖檔：${error.message}`);
    packageJson = {};
    lock = {};
  }
  check(packageJson.type === 'module', 'package.json 使用 ES modules');
  check(JSON.stringify(packageJson.dependencies) === JSON.stringify({ three: '0.187.0' }), 'dependencies 僅含 three 0.187.0');
  check(JSON.stringify(packageJson.devDependencies) === JSON.stringify({ vite: '8.3.8' }), 'devDependencies 僅含 vite 8.3.8');
  check(JSON.stringify(packageJson.scripts) === JSON.stringify({ dev: 'vite', build: 'vite build', preview: 'vite preview', test: 'node --test', check: 'node scripts/check-dist.mjs' }), 'package.json 提供 brief 指定的五個 scripts');
  check(lock.packages?.['']?.dependencies?.three === '0.187.0' && lock.packages?.['']?.devDependencies?.vite === '8.3.8', 'package-lock.json 鎖定指定直接依賴');

  const contentPath = path.join(projectRoot, 'content', 'content.js');
  const referenceContentPath = path.resolve(projectRoot, '..', 'game3d', 'src', 'content.js');
  try {
    const [actual, reference] = await Promise.all([readFile(contentPath), readFile(referenceContentPath)]);
    check(actual.equals(reference), 'content/content.js 與 game3d 來源逐位元一致');
  } catch {
    messages.push('! game3d/content.js 不可讀，略過來源逐位元比對');
  }

  let distFiles = [];
  try {
    distFiles = await filesUnder(distRoot);
  } catch {
    failures.push('找不到 dist/，請先執行 npm run build');
  }
  if (!distFiles.length) {
    if (failures.length) throw new Error(failures.join('\n'));
    throw new Error('dist/ 沒有任何檔案');
  }

  const namesOkay = distFiles.every(({ relative }) => {
    const segments = relative.split('/');
    return /^assets\/index-[A-Za-z0-9_-]{8,}\.(?:js|css)$/.test(relative)
      || segments.every((segment) => /^[a-z0-9][a-z0-9.-]*$/.test(segment));
  });
  check(namesOkay, 'dist 檔名使用小寫 kebab-case（Vite 雜湊檔除外）');

  const forbiddenExtensions = /\.(?:png|jpe?g|gif|bmp|tiff?|avif|glb|gltf|mp3|ogg|wav|wasm)$/i;
  check(!distFiles.some(({ relative }) => forbiddenExtensions.test(relative)), 'dist 不含未允許的圖片、模型、音訊或 WASM 檔案');

  const htmlFiles = distFiles.filter(({ relative }) => relative.endsWith('.html'));
  check(htmlFiles.length === 1 && htmlFiles[0].relative === 'index.html', 'dist 含單一 index.html');
  for (const { absolute } of htmlFiles) {
    const html = await readFile(absolute, 'utf8');
    const references = [...html.matchAll(/\b(?:src|href)\s*=\s*["']([^"']+)["']/gi)].map((match) => match[1]);
    check(references.every((value) => value.startsWith('#') || value.startsWith('data:') || isRelativeReference(value)), 'HTML 資源路徑皆為相對路徑');
  }

  const cssFiles = distFiles.filter(({ relative }) => relative.endsWith('.css'));
  check(cssFiles.length > 0, 'dist 含 CSS bundle');
  for (const { absolute } of cssFiles) {
    const css = await readFile(absolute, 'utf8');
    const urlValues = [...css.matchAll(/url\(\s*["']?([^)'"\s]+)["']?\s*\)/gi)].map((match) => match[1]);
    const hasImport = /@import\b/i.test(css);
    check(!hasImport && urlValues.every((value) => value.startsWith('data:') || value.startsWith('#') || isRelativeReference(value)), 'CSS 沒有遠端匯入或絕對資源路徑');
  }

  const jsFiles = distFiles.filter(({ relative }) => relative.endsWith('.js'));
  check(jsFiles.length > 0, 'dist 含 JavaScript bundle');
  for (const { absolute } of jsFiles) {
    const js = await readFile(absolute, 'utf8');
    const remoteRequest = /(?:fetch|importScripts)\s*\(\s*["'`]https?:\/\//i.test(js)
      || /new\s+WebSocket\s*\(\s*["'`]wss?:\/\//i.test(js);
    check(!remoteRequest, '打包 JavaScript 沒有第三方網路請求');
  }

  const manifestPaths = [
    'common', ...Array.from({ length: 10 }, (_, index) => `ch${String(index + 1).padStart(2, '0')}`),
  ].map((directory) => path.join(artRoot, directory, 'manifest.json'));
  const registeredFiles = new Set();
  const allEntries = new Map();
  const artByteCounts = new Map();
  let artBytes = 0;
  let initialArtBytes = 0;
  let chapterPixelsOkay = true;
  let commonPixels = 0;

  for (const manifestPath of manifestPaths) {
    const relativeManifest = path.relative(distRoot, manifestPath).split(path.sep).join('/');
    try {
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
      check(manifest.version === 1 && Array.isArray(manifest.assets), `${relativeManifest} 格式有效`);
      const seenIds = new Set();
      const directoryName = path.basename(path.dirname(manifestPath));
      let pixelTotal = 0;
      for (const entry of manifest.assets ?? []) {
        const validEntry = entry && /^[a-z0-9][a-z0-9-]*$/.test(entry.id)
          && /^[a-z0-9][a-z0-9-]*\.webp$/.test(entry.file)
          && Number.isInteger(entry.width) && entry.width > 0
          && Number.isInteger(entry.height) && entry.height > 0;
        check(validEntry, `${relativeManifest} 每筆資源有合法 id、WebP 檔名與尺寸`);
        if (!validEntry) continue;
        check(!seenIds.has(entry.id), `${relativeManifest} 的資源 id 不重複`);
        seenIds.add(entry.id);
        const targetPath = path.join(path.dirname(manifestPath), entry.file);
        const targetRelative = path.relative(artRoot, targetPath).split(path.sep).join('/');
        registeredFiles.add(targetRelative);
        allEntries.set(targetRelative, entry);
        pixelTotal += entry.width * entry.height;
        try {
          const buffer = await readFile(targetPath);
          const actual = webpDimensions(buffer);
          check(Boolean(actual), `${targetRelative} 是可讀的 WebP 圖檔`);
          if (actual) {
            check(actual.width === entry.width && actual.height === entry.height, `${targetRelative} 實際尺寸符合 manifest`);
            check(Math.max(actual.width, actual.height) <= 2048, `${targetRelative} 最長邊不超過 2048px`);
            const isBackdrop = ['sky', 'far', 'background', 'panorama', 'chapter-card'].includes(entry.kind)
              || /(^|-)(sky|far|background|panorama|chapter-card)(-|$)/i.test(entry.id);
            if (isBackdrop) {
              check(actual.width <= 2048 && actual.height <= 1024, `${targetRelative} 遠景不超過 2048×1024px`);
            } else {
              check(Math.max(actual.width, actual.height) <= 1024, `${targetRelative} 物件不超過 1024px`);
            }
          }
          const size = buffer.byteLength;
          artBytes += size;
          artByteCounts.set(targetRelative, size);
          if (directoryName === 'common' || directoryName === 'ch01') initialArtBytes += size;
        } catch {
          failures.push(`${targetRelative} 已登記但檔案不存在或無法讀取`);
        }
      }
      if (directoryName === 'common') commonPixels = pixelTotal;
      else {
        chapterPixelsOkay &&= pixelTotal + commonPixels <= 24_000_000;
        check(pixelTotal + commonPixels <= 24_000_000, `${directoryName} 含共用貼圖不超過 2400 萬像素`);
      }
    } catch {
      failures.push(`${relativeManifest} 不存在或不是有效 JSON`);
    }
  }

  try {
    const artFiles = await filesUnder(artRoot);
    const imageFiles = artFiles.filter(({ relative }) => !relative.endsWith('/manifest.json'));
    const unregistered = imageFiles.filter(({ relative }) => !registeredFiles.has(relative));
    check(unregistered.length === 0, 'dist/art/ 沒有未登記的檔案');
    for (const { absolute } of artFiles) {
      artBytes += absolute.endsWith('/manifest.json') ? (await stat(absolute)).size : 0;
      if (/\/common\/manifest\.json$|\/ch01\/manifest\.json$/.test(absolute)) initialArtBytes += (await stat(absolute)).size;
    }
    check(artBytes <= 12 * bytesPerMB, `dist/art/ 不超過 12 MB（${(artBytes / bytesPerMB).toFixed(3)} MB）`);
  } catch {
    failures.push('dist/art/ 不存在或無法列舉');
  }

  const htmlBytes = await Promise.all(htmlFiles.map(async ({ absolute }) => (await stat(absolute)).size));
  const bundleBytes = await Promise.all([...cssFiles, ...jsFiles].map(async ({ absolute }) => (await stat(absolute)).size));
  const initialScreenBytes = htmlBytes.reduce((sum, size) => sum + size, 0)
    + bundleBytes.reduce((sum, size) => sum + size, 0) + initialArtBytes;
  check(chapterPixelsOkay, '各章貼圖像素量符合限制');
  check(initialScreenBytes <= 3 * bytesPerMB, `首屏檔案總量不超過 3 MB（${(initialScreenBytes / bytesPerMB).toFixed(3)} MB）`);

  if (failures.length) {
    console.error(`dist 檢查失敗（${failures.length} 項）：`);
    for (const failure of failures) console.error(`✗ ${failure}`);
    process.exitCode = 1;
    return;
  }
  for (const message of messages) console.log(message);
  console.log(`✓ 首屏估算：${(initialScreenBytes / bytesPerMB).toFixed(3)} MB；美術：${(artBytes / bytesPerMB).toFixed(3)} MB`);
  console.log(`✓ 已驗證 ${manifestPaths.length} 個 manifest 與 ${allEntries.size} 張登記貼圖`);
}

await main();
