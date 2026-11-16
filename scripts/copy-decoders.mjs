import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dracoSource = resolve(root, 'node_modules/three/examples/jsm/libs/draco/gltf');
const basisSource = resolve(root, 'node_modules/three/examples/jsm/libs/basis');
const dracoDestination = resolve(root, 'public/draco');
const basisDestination = resolve(root, 'public/basis');
const dracoFiles = ['draco_decoder.js', 'draco_decoder.wasm', 'draco_wasm_wrapper.js'];
const basisFiles = ['basis_transcoder.js', 'basis_transcoder.wasm'];

await Promise.all([mkdir(dracoDestination, { recursive: true }), mkdir(basisDestination, { recursive: true })]);
await Promise.all([
  ...dracoFiles.map((file) => copyFile(resolve(dracoSource, file), resolve(dracoDestination, file))),
  ...basisFiles.map((file) => copyFile(resolve(basisSource, file), resolve(basisDestination, file))),
]);
console.log(`Copied ${dracoFiles.length} Draco and ${basisFiles.length} Basis runtime files to public/.`);
