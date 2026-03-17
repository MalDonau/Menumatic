import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: '/Menumatic/', // Aseguramos que coincida con el nombre del repo en el URL
});
