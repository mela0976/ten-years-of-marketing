import { defineConfig } from 'vite';

const usePublicDracoDecoder = {
  name: 'use-public-draco-decoder',
  enforce: 'pre',
  transform(code, id) {
    if (!id.replaceAll('\\\\', '/').endsWith('/three/examples/jsm/loaders/DRACOLoader.js')) return null;
    // DRACOLoader's module-relative defaults make Vite copy a second decoder
    // into assets/. The app always sets a runtime path to public/draco/ first.
    return code.replace(/new URL\(\s*['"][^'"]*draco[^'"]*['"]\s*,\s*import\.meta\.url\s*\)\.toString\(\)/g, "''");
  },
};

export default defineConfig({
  base: './',
  plugins: [usePublicDracoDecoder],
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        hashCharacters: 'hex',
      },
    },
  },
});
