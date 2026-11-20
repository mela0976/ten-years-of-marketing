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
    const response = await fetch(`${import.meta.env.BASE_URL}${path}`);
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
  const assets = new Map();
  for (const entry of [...common, ...chapter]) {
    const root = common.includes(entry) ? 'common' : chapterName;
    const image = await loadImage(`${import.meta.env.BASE_URL}art/${root}/${entry.file}`);
    if (image && image.naturalWidth === entry.width && image.naturalHeight === entry.height) {
      assets.set(entry.id, image);
    }
  }
  return assets;
}

export function isManifestAssetEntry(entry) {
  return isAssetEntry(entry);
}
