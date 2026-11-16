import { defineConfig, minify } from 'vite';

const usePublicDecoders = {
  name: 'use-public-decoders',
  enforce: 'pre',
  transform(code, id) {
    const normalizedId = id.replaceAll('\\', '/');
    if (normalizedId.endsWith('/three/examples/jsm/loaders/DRACOLoader.js')) {
      // The app sets a runtime path to public/draco/ before loading any model.
      return code.replace(/new URL\(\s*['"][^'"]*draco[^'"]*['"]\s*,\s*import\.meta\.url\s*\)\.toString\(\)/g, "''");
    }
    if (normalizedId.endsWith('/three/examples/jsm/loaders/KTX2Loader.js')) {
      // The app sets public/basis/ explicitly, so don't bundle a second copy.
      return code.replace(/new URL\(\s*['"][^'"]*basis_transcoder\.(?:js|wasm)['"]\s*,\s*import\.meta\.url\s*\)\.toString\(\)/g, "''");
    }
    return null;
  },
  async generateBundle(_options, bundle) {
    for (const output of Object.values(bundle)) {
      if (output.type !== 'chunk') continue;
      output.code = (await minify(output.fileName, output.code)).code;
    }
  },
};

export default defineConfig({
  base: './',
  plugins: [usePublicDecoders],
  build: {
    chunkSizeWarningLimit: 800,
    rolldownOptions: {
      output: {
        hashCharacters: 'hex',
      },
    },
  },
});
