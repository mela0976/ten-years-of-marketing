const FILE_NAME = /^[a-z0-9][a-z0-9-]*\.webp$/;

function isAssetEntry(entry) {
  return entry
    && typeof entry.id === 'string'
    && /^[a-z0-9][a-z0-9-]*$/.test(entry.id)
    && typeof entry.file === 'string'
    && FILE_NAME.test(entry.file)
    && Number.isInteger(entry.width)
    && Number.isInteger(entry.height)
    && entry.width > 0
    && entry.height > 0;
}

function loadImage(url) {
  return new Promise((resolve) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function loadManifest(path) {
  try {
    // 每次都向伺服器確認，避免重新部署後拿到舊的清單而對不上新貼圖。
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`, { cache: 'no-cache' });
    if (!response.ok) return [];
    const manifest = await response.json();
    return Array.isArray(manifest.assets) ? manifest.assets.filter(isAssetEntry) : [];
  } catch {
    return [];
  }
}

export async function loadChapterAssets(chapterId) {
  const chapterName = `ch${String(chapterId).padStart(2, '0')}`;
  const [common, chapter] = await Promise.all([
    loadManifest('art/common/manifest.json'),
    loadManifest(`art/${chapterName}/manifest.json`),
  ]);
  // 同時下載所有貼圖（原本一張接一張，章節開頭會停在色塊好幾秒）。
  // 尺寸與清單不符時仍採用：快取裡的新舊版本混用，比整章退回色塊好。
  const entries = [...common.map((entry) => ['common', entry]), ...chapter.map((entry) => [chapterName, entry])];
  const images = await Promise.all(entries.map(([root, entry]) => loadImage(`${import.meta.env.BASE_URL}art/${root}/${entry.file}`)));
  const assets = new Map();
  entries.forEach(([, entry], index) => {
    const image = images[index];
    if (image && image.naturalWidth > 0) assets.set(entry.id, image);
  });
  return assets;
}

export function isManifestAssetEntry(entry) {
  return isAssetEntry(entry);
}
