// modal.js — modal reutilizável (Fase 3, Sistema de design). Nasce do
// zero: hoje só existe #data-modal, uma única instância fixa reusada
// ad hoc pra tabela de RA/Zona (index.html) — todas as chamadas
// "openNew...Modal()" de OKR/Equipe/Agenda são, na verdade, cadeias de
// prompt()/confirm() (ver public/app.js), não um modal de verdade.
//
// Cria e remove o próprio DOM (não depende de nenhum elemento fixo no
// HTML da página) — qualquer página que carregue modal.js + components.css
// pode chamar openModal()/closeModal() direto.
//
// Ainda NÃO substitui os prompt()/confirm() existentes em produção —
// isso é Fase 4. Aqui o componente só nasce e fica demonstrável.

function openModal(config) {
    closeModal(); // só uma instância por vez
    const cfg = config || {};

    const backdrop = document.createElement('div');
    backdrop.className = 'app-modal-backdrop';
    backdrop.id = 'app-modal-backdrop';
    backdrop.innerHTML = `
        <div class="app-modal" role="dialog" aria-modal="true" aria-labelledby="app-modal-title">
            <div class="app-modal-header">
                <h3 id="app-modal-title">${cfg.title || ''}</h3>
                <button type="button" class="app-modal-close" aria-label="Fechar">&times;</button>
            </div>
            <div class="app-modal-body">${cfg.bodyHtml || ''}</div>
            <div class="app-modal-footer"></div>
        </div>
    `;
    document.body.appendChild(backdrop);

    const footer = backdrop.querySelector('.app-modal-footer');
    (cfg.buttons || []).forEach(btn => {
        const el = document.createElement('button');
        el.type = 'button';
        el.className = btn.variant === 'primary' ? 'btn-primary' : 'btn-secondary';
        el.textContent = btn.label;
        el.addEventListener('click', () => {
            if (typeof btn.onClick === 'function') btn.onClick();
            if (btn.closeOnClick !== false) closeModal();
        });
        footer.appendChild(el);
    });

    backdrop.querySelector('.app-modal-close').addEventListener('click', () => closeModal());
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) closeModal(); });
    document.addEventListener('keydown', handleModalEscape);

    return backdrop;
}

function closeModal() {
    const backdrop = document.getElementById('app-modal-backdrop');
    if (backdrop) backdrop.remove();
    document.removeEventListener('keydown', handleModalEscape);
}

function handleModalEscape(e) {
    if (e.key === 'Escape') closeModal();
}

// pickFromList(title, items, labelFn) — substitui o padrão
// `prompt('Escolha:\n1. X\n2. Y')` + parseInt(escolha) por uma lista
// clicável dentro do modal. Promise-based: resolve com o item
// escolhido, ou null se cancelado/fechado. Ainda não está encaixado em
// nenhum fluxo existente (isso é Fase 4) — construído e demonstrável
// agora.
function pickFromList(title, items, labelFn) {
    return new Promise((resolve) => {
        const getLabel = typeof labelFn === 'function' ? labelFn : (item => String(item));
        let settled = false;
        const settle = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const bodyHtml = items.length
            ? `<ul class="app-pick-list">${items.map((item, idx) => `<li><button type="button" class="app-pick-list-item" data-idx="${idx}">${getLabel(item)}</button></li>`).join('')}</ul>`
            : '<p class="instruction">Nenhuma opção disponível.</p>';

        const backdrop = openModal({
            title,
            bodyHtml,
            buttons: [{ label: 'Cancelar', variant: 'secondary', onClick: () => settle(null) }]
        });

        backdrop.querySelectorAll('.app-pick-list-item').forEach(el => {
            el.addEventListener('click', () => {
                const idx = parseInt(el.dataset.idx, 10);
                closeModal();
                settle(items[idx]);
            });
        });

        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) settle(null); });
    });
}

// confirmModal(title, message, opts) — substitui window.confirm(). Promise-based:
// resolve true se o usuário confirmar, false se cancelar/fechar.
function confirmModal(title, message, opts) {
    const cfg = opts || {};
    return new Promise((resolve) => {
        let settled = false;
        const settle = (value) => {
            if (settled) return;
            settled = true;
            resolve(value);
        };

        const backdrop = openModal({
            title,
            bodyHtml: `<p style="margin:0;">${message}</p>`,
            buttons: [
                { label: cfg.cancelLabel || 'Cancelar', variant: 'secondary', onClick: () => settle(false) },
                { label: cfg.confirmLabel || 'Confirmar', variant: 'primary', onClick: () => settle(true) }
            ]
        });

        backdrop.addEventListener('click', (e) => { if (e.target === backdrop) settle(false); });
    });
}
