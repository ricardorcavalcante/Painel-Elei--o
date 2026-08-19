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
      //
      // login.html + as 6 páginas de destino por papel (Fase 1 da
      // reestruturação por papel — "Fundação de autenticação e
      // roteamento"): por enquanto placeholders guardados por
      // auth-shared.js, conteúdo real chega na Fase 2.
      input: {
        main: resolve(__dirname, 'index.html'),
        gradePublica: resolve(__dirname, 'grade-publica.html'),
        login: resolve(__dirname, 'login.html'),
        admin: resolve(__dirname, 'admin.html'),
        okrs: resolve(__dirname, 'okrs.html'),
        candidata: resolve(__dirname, 'candidata.html'),
        coordenador: resolve(__dirname, 'coordenador.html'),
        voluntario: resolve(__dirname, 'voluntario.html'),
        agenda: resolve(__dirname, 'agenda.html'),
      },
    },
  },
  server: {
    open: true,
  },
});
