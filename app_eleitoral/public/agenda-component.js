// agenda-component.js — componente de Agenda em cartões, único ponto de
// renderização reutilizado por agenda.html, index.html ("Próximos
// Compromissos"), admin.html (fila de aprovação) e coordenador.html
// (status de agenda da região) — Fase 3 (Sistema de design).
//
// Nasce aqui, mas AINDA SUBSTITUI a renderização das 4 páginas (isso é
// diferente de reescrever prompt()/alert() por formulário/modal, que
// continua fora de escopo até a Fase 4 — aqui só a LEITURA muda de
// implementação, nenhuma ação de escrita é tocada). Cada página
// continua responsável pelos próprios botões de ação (Aprovar/Recusar
// em admin.html, por exemplo), passados via options.actions.
//
// Script clássico (global), auto-suficiente: define suas próprias
// funções internas de formatação em vez de depender de
// formatAgendaDateTime()/agendaTipoLabel() (que já existem duplicadas
// em okr-shared.js e agenda.js) — evita qualquer risco de colisão de
// nome entre os vários scripts que uma mesma página carrega.

function agendaComponentTipoLabel(tipo) {
    if (tipo === 'oficial') return '📌 Compromisso Oficial';
    if (tipo === 'visita_solicitada') return '📅 Visita Solicitada';
    if (tipo === 'participacao_solicitada') return '🎤 Participação Solicitada';
    return tipo;
}

function agendaComponentFormatDateTime(iso) {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

// Renderiza um único evento como cartão .okr-card — mesma estrutura
// visual em todo canto que usa isto. `opts` deixa cada página ajustar
// só o que é genuinamente diferente ali (cabeçalho, rodapé, texto
// extra, botões de ação), sem duplicar o HTML do cartão em si.
function renderAgendaCard(ev, opts) {
    const o = opts || {};
    const headerRight = typeof o.headerRight === 'function' ? o.headerRight(ev) : agendaComponentFormatDateTime(ev.data_hora);
    const statusTag = o.showStatus && ev.status
        ? `<span class="status-tag status-${ev.status}">${ev.status.toUpperCase()}</span>`
        : '';
    const footer = typeof o.footer === 'function'
        ? o.footer(ev)
        : `${agendaComponentFormatDateTime(ev.data_hora)}${ev.local ? ' · ' + ev.local : ''}`;
    const extra = typeof o.extra === 'function' ? o.extra(ev) : '';
    const actions = typeof o.actions === 'function' ? o.actions(ev) : '';

    return `
        <div class="okr-card">
            <div class="okr-card-header">
                <span class="okr-badge badge-tatico">${agendaComponentTipoLabel(ev.tipo)}</span>
                <span class="okr-year">${headerRight}</span>
            </div>
            ${statusTag}
            <h4>${ev.titulo}</h4>
            <p>${ev.descricao || ''}</p>
            <div class="okr-card-footer"><span>${footer}</span></div>
            ${extra}
            ${actions}
        </div>
    `;
}

// Renderiza a lista inteira num container — usa renderAgendaCard() pra
// cada item, com o estado vazio configurável por chamada.
function renderAgendaCards(container, eventos, opts) {
    if (!container) return;
    const o = opts || {};
    if (!eventos || !eventos.length) {
        container.innerHTML = o.emptyMessage || '<div class="instruction">Nenhum compromisso encontrado.</div>';
        return;
    }
    container.innerHTML = eventos.map(ev => renderAgendaCard(ev, o)).join('');
}

// Versão compacta (sem badge/descrição) pro card "Próximos
// Compromissos" da index.html — mesma fonte de formatação de data,
// layout mais enxuto pra caber na sidebar.
function renderAgendaCompact(container, eventos, opts) {
    if (!container) return;
    const o = opts || {};
    if (!eventos || !eventos.length) {
        container.innerHTML = o.emptyMessage || '<div class="instruction" style="font-size: 0.85rem;">Nenhum compromisso confirmado.</div>';
        return;
    }
    container.innerHTML = eventos.map(ev => `
        <div class="agenda-compact-item">
            <strong>${ev.titulo}</strong>
            <div class="agenda-compact-meta">${agendaComponentFormatDateTime(ev.data_hora)}${ev.local ? ' · ' + ev.local : ''}</div>
        </div>
    `).join('');
}
