import { defineConfig } from 'vite';
import glsl from 'vite-plugin-glsl';
import { resolve } from 'path';

export default defineConfig({
  plugins: [
    glsl(),
  ],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
    },
  },
  build: {
    outDir: 'dist',
    target: 'es2020',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-pixi': ['pixi.js', '@pixi/sound'],
          'vendor-physics': ['planck-js'],
          'vendor-utils': ['gsap', 'localforage', 'zod'],
        },
      },
    },
  },
});
