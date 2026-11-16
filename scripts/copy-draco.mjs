import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf');
const destination = resolve(root, 'public/draco');
const decoderFiles = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'];

await mkdir(destination, { recursive: true });
await Promise.all(decoderFiles.map((file) => copyFile(resolve(source, file), resolve(destination, file))));
console.log(`Copied ${decoderFiles.length} Draco runtime files to public/draco/.`);
