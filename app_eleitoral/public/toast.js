// toast.js — notificação toast (Fase 3, Sistema de design). Não existe
// nenhum hoje no projeto (zero ocorrências) — vai substituir a maioria
// dos ~60 alert() de public/app.js, mas essa substituição em si é
// trabalho da Fase 4. Aqui o componente só nasce, demonstrável.
//
// Cria e remove o próprio container (#app-toast-container) sob
// demanda — qualquer página que carregue toast.js + components.css
// pode chamar showToast() direto, sem nenhum elemento fixo no HTML.

function showToast(message, options) {
    const opts = options || {};
    const type = opts.type || 'info'; // info | success | warning | danger
    const duration = opts.duration || 4000;

    let container = document.getElementById('app-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'app-toast-container';
        container.className = 'app-toast-container';
        document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = 'app-toast app-toast-' + type;
    toast.setAttribute('role', 'status');
    toast.textContent = message;
    container.appendChild(toast);

    // Duas fases (classe adicionada depois do append) pra garantir que
    // a transição de entrada dispare mesmo em navegadores que colapsam
    // mudanças de estilo no mesmo frame.
    requestAnimationFrame(() => toast.classList.add('app-toast-visible'));

    setTimeout(() => {
        toast.classList.remove('app-toast-visible');
        setTimeout(() => toast.remove(), 250);
    }, duration);
}
