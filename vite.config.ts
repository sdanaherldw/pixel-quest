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
    target: 'es2022',
  },
});
