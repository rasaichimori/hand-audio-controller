import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit()],
  optimizeDeps: {
    exclude: ["@mediapipe/tasks-vision"],
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
  },
});
