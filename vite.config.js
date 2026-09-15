import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// GitHub Pages serves this from /<repo>/, but the dev server serves from root.
export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/consistent-hashing-visualizer/' : '/',
}));
