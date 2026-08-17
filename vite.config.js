import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './', // Use relative paths so assets resolve correctly on GitHub Pages (/OEM/)
  server: {
    port: 3000,
    open: true
  }
});
