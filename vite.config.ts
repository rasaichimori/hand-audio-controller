import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    exclude: ['@mediapipe/tasks-vision']
  },
  server: {
    port: 5180
  }
});

