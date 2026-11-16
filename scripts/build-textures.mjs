import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { encodeToKTX2 } from 'ktx2-encoder';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(root, 'public/textures/skybox.ktx2');
const width = 1024;
const height = 512;
const pixels = new Uint8Array(width * height * 4);
let seed = 0x51f15e;

function randomNoise() {
  seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
  return seed / 0x100000000;
}

for (let y = 0; y < height; y += 1) {
  const t = y / (height - 1);
  const horizon = Math.exp(-(((t - 0.73) / 0.19) ** 2));
  const mist = [0.36, 0.56, 0.68].map((center, index) =>
    Math.exp(-(((t - center) / (index === 1 ? 0.024 : 0.014)) ** 2)) * (index === 1 ? 5 : 3),
  );
  for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 4;
    const grain = (randomNoise() - 0.5) * 3.2;
    const lowVariation = Math.sin((x / width) * Math.PI * 4 + t * 6) * 1.4;
    const haze = mist.reduce((sum, band) => sum + band, 0) + horizon * 4;
    pixels[i] = Math.max(0, Math.min(255, 10 + 6 * t + haze * 1.1 + grain));
    pixels[i + 1] = Math.max(0, Math.min(255, 24 + 29 * t + haze * 2.1 + lowVariation + grain));
    pixels[i + 2] = Math.max(0, Math.min(255, 34 + 17 * t + haze * 1.8 + grain));
    pixels[i + 3] = 255;
  }
}

const ktx2 = await encodeToKTX2(pixels, {
  imageDecoder: async () => ({ data: pixels, width, height }),
  isKTX2File: true,
  isUASTC: false,
  qualityLevel: 128,
  compressionLevel: 2,
  generateMipmap: true,
  isPerceptual: true,
  isSetKTX2SRGBTransferFunc: true,
});

await mkdir(dirname(output), { recursive: true });
await writeFile(output, ktx2);
console.log(`Generated public/textures/skybox.ktx2 (${width}x${height}, ETC1S, mipmaps, sRGB, ${ktx2.byteLength} bytes).`);
