import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: '.',
  base: './',
  build: {
    outDir: 'dist',
    rollupOptions: {
      // Página pública da Grade Operacional (link somente-leitura, sem
      // login) é uma entrada separada do index.html — precisa estar
      // listada aqui pra `vite build` também processá-la (interpolação
      // de %VITE_SUPABASE_URL% etc.) e gerá-la em dist/.
      input: {
        main: resolve(__dirname, 'index.html'),
        gradePublica: resolve(__dirname, 'grade-publica.html'),
      },
    },
  },
  server: {
    open: true,
  },
});
