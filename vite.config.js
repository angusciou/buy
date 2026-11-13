import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
// base './' 讓同一份建置可放在 GitHub Pages 的任何子路徑
export default defineConfig({ base: './', plugins: [react()] });
