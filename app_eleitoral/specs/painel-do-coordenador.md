# SPEC: Painel do Coordenador

**Descrição:** Consolida o que hoje está espalhado entre as abas OKR e Check-in — equipe, cobertura de quadrantes, KRs táticos e status de agenda — com escopo na própria Coordenação Regional do coordenador logado, mais um comparativo opcional entre regiões controlado pelo nível estratégico.
**Entregável:** Nova aba `coordenador` funcional (`index.html` + `public/app.js` + `style.css`) + tabela nova `app_settings` (única alteração de schema desta spec, para a flag de comparativo entre regiões).
**Risco:** baixo-médio (a maior parte é só leitura reaproveitando padrões da Central de Comando; a única parte nova de escrita é o toggle da flag de comparativo, restrito ao nível estratégico).
**Pré-requisito:** nenhum (Central de Comando já implementada — esta spec reaproveita seus padrões visuais e de carregamento).

Origem: recomendação P0 do documento "Raio-X do Painel Eleitoral" (18/ago/2026), seção "Novas páginas".

---

## Decisões de negócio (confirmadas com o candidato)

| Pergunta | Resposta |
|---|---|
| Quem vê a aba | Coordenadores (`papel='coordenador'` em `product_team`) veem a própria Coordenação; `is_super_admin` também vê a aba e pode escolher qualquer Coordenação para inspecionar. Operacionais não veem. |
| Coordenador vinculado a mais de uma Coordenação | Seletor dropdown no topo da aba — os dados mostrados são sempre de UMA Coordenação por vez, nunca agregados. |
| Fila de agenda da região | Somente leitura de status (pendente/confirmado/recusado/cancelado) de todas as solicitações da região, não só as do usuário logado. A aprovação continua exclusiva do nível estratégico (`responderSolicitacao`, aba Agenda) — nenhum botão de aprovar/recusar neste painel. |
| Auto-redirect pós-login | Coordenador (`papel='coordenador'` em qualquer `product_id`) passa a cair direto na aba `coordenador`. `is_super_admin` continua caindo em `comando`, como hoje. |
| Ciclo/period para KRs sob responsabilidade | Todos os ciclos ativos (diário/semanal/mensal) da Coordenação selecionada, com um seletor de ciclo — não só o semanal ativo usado na Central de Comando. |
| Comparativo com outras regiões | Controlado por uma flag nova (`app_settings.comparativo_regioes_liberado`), ligada/desligada pelo nível estratégico. **Desvio deliberado** da premissa "zero schema novo" do documento original — decisão confirmada com o candidato. |
| Métrica do comparativo | Progresso tático médio (mesmo cálculo do Bloco 03 da Central de Comando) e % de cobertura de quadrantes (mesmo cálculo do Bloco 02), lado a lado. |
| Navegação | Nova aba própria (`coordenador`), seguindo o mesmo padrão já usado pela Central de Comando — não uma seção dentro da aba OKR existente. |

---

### Feature 1.1: Esqueleto da aba, menu, seletor de Coordenação e navegação
**Categoria:** frontend
**Descrição:** Nova aba integrada ao `switchTab()` existente, com seletor de Coordenação Regional e redirecionamento condicional pós-login.

**Steps:**
1. Adicionar botão `<button data-tab="coordenador" onclick="switchTab('coordenador')">` no `.nav-tabs`, ao lado do botão da Central de Comando
2. Criar `<div id="view-coordenador" class="view-container">` seguindo o padrão de `view-comando` e registrar em `switchTab()`
3. Criar `initPainelCoordenadorModule()`, chamado ao entrar na aba
4. Exibir o botão só se existir linha em `product_team` com `papel='coordenador'` para o usuário logado, OU `okrCurrentUser.is_super_admin`
5. Se o usuário tem mais de uma Coordenação com `papel='coordenador'`, ou é `is_super_admin` (todas as Coordenações), renderizar um dropdown de seleção no topo da aba; se só houver uma opção, esconder o dropdown e fixar essa Coordenação
6. Trocar a seleção no dropdown re-renderiza todos os blocos (1.2 a 1.5) com o novo `product_id`
7. Após login bem-sucedido, se o usuário tem `papel='coordenador'` em algum `product_team`, chamar `switchTab('coordenador')` em vez de `switchTab('comando')`; `is_super_admin` continua indo para `comando`

**Edge cases:**
- `is_super_admin` sem nenhuma Coordenação Regional cadastrada ainda (`products` vazio): dropdown mostra estado vazio "Nenhuma Coordenação Regional cadastrada"
- Usuário sem `product_team` e sem `is_super_admin` tenta acessar a aba manipulando o DOM: bloquear no client com estado "sem permissão" (a leitura em si já é aberta por RLS — isso é UI, não segurança)
- Troca de seleção no dropdown dispara novo fetch; se o usuário trocar de novo antes do primeiro terminar, descartar a resposta antiga (evitar flash com dado da Coordenação errada)
- Redirecionamento pós-login dispara só uma vez, no evento de login, não a cada re-render da tela

---

### Feature 1.2: Bloco Equipe & Cobertura de Quadrantes
**Categoria:** frontend
**Descrição:** Lista de membros da Coordenação selecionada + % de quadrantes cobertos vs. não cobertos.

**Steps:**
1. `sb.from('product_team').select('papel, user_id, profiles:user_id(full_name, email)').eq('product_id', productIdSelecionado)`
2. `sb.from('areas').select('id, codigo, nome').eq('product_id', productIdSelecionado)`
3. `sb.from('area_volunteers').select('area_id, user_id').in('area_id', areaIds)`
4. Calcular quadrantes cobertos (≥1 voluntário atribuído) vs. não cobertos
5. Renderizar lista de equipe reaproveitando o badge de papel já usado em `renderEquipe()` (coordenador/operacional), e lista de quadrantes com status coberto/não coberto

**Edge cases:**
- Coordenação sem nenhum quadrante gerado ainda: estado vazio "Nenhum quadrante gerado para esta Coordenação — gere pela aba OKR", com link direto
- Quadrante coberto por mais de um voluntário: contar como coberto, mostrando a quantidade
- Equipe vazia (nenhuma linha em `product_team` para essa Coordenação): estado vazio "Nenhum integrante nesta Coordenação ainda"

---

### Feature 1.3: Bloco KRs sob responsabilidade
**Categoria:** frontend
**Descrição:** Objetivos táticos e Key Results da Coordenação selecionada, com seletor de ciclo entre todos os ciclos ativos.

**Steps:**
1. `sb.from('periods').select('*').eq('ativo', true).order('data_inicio', { ascending: false })` para popular o seletor de ciclo
2. Ciclo padrão pré-selecionado: o mesmo `okrDataCache.activePeriodId` da aba OKR, se ainda estiver ativo; senão, o primeiro ciclo ativo da lista
3. `sb.from('objectives').select('*').eq('nivel', 'tatico').eq('product_id', productIdSelecionado).eq('period_id', cicloSelecionado)`
4. `sb.from('key_results').select('*').in('objective_id', objectiveIds)`
5. Renderizar reaproveitando o card `okr-card-tatico` já usado em `renderCheckinProgresso()`

**Edge cases:**
- Nenhum ciclo ativo no momento: estado vazio "Nenhum ciclo ativo no momento", sem quebrar os outros blocos
- Nenhum objetivo tático no ciclo selecionado: estado vazio "Nenhum objetivo tático definido para este ciclo"
- Troca de ciclo no seletor atualiza só este bloco, sem re-buscar os outros

---

### Feature 1.4: Bloco Status de Agenda da Região (somente leitura)
**Categoria:** frontend
**Descrição:** Lista de todas as solicitações de agenda da Coordenação selecionada, com status — não só as solicitações feitas pelo usuário logado.

**Steps:**
1. `sb.from('agenda_eventos').select('*').eq('product_id', productIdSelecionado).order('data_hora', { ascending: false })`
2. Renderizar reaproveitando o `status-tag` já usado em `renderMinhasSolicitacoes()` (pendente/confirmado/recusado/cancelado)
3. Nenhum botão de aprovar/recusar/cancelar neste bloco — cancelamento da própria solicitação continua exclusivo da aba Agenda ("Minhas Solicitações"); aprovação continua exclusiva do nível estratégico

**Edge cases:**
- Nenhuma solicitação registrada para a Coordenação: estado vazio "Nenhuma solicitação de agenda registrada para esta região"
- Solicitação recusada exibe `resposta_admin` quando preenchida, igual ao padrão já usado em "Minhas Solicitações"

---

### Feature 1.5: Bloco Comparativo entre Regiões (condicional à flag)
**Categoria:** frontend
**Descrição:** Progresso tático médio e % de cobertura de quadrantes de todas as Coordenações, lado a lado — visível só se `app_settings.comparativo_regioes_liberado = true`.

**Steps:**
1. `sb.from('app_settings').select('comparativo_regioes_liberado').single()`; se `false` ou ausente, esconder o bloco inteiro com "Comparativo desativado pelo nível estratégico"
2. Se `true`: `sb.from('products').select('id, nome, ra_nome')`; `sb.from('objectives').select('product_id, progresso').eq('nivel', 'tatico').in('period_id', ciclosAtivosIds)`; `sb.from('areas').select('id, product_id')`; `sb.from('area_volunteers').select('area_id')`
3. Calcular progresso tático médio por `product_id` (mesma lógica do Bloco 03 da Central de Comando) e % de cobertura de quadrantes por `product_id` (mesma lógica do Bloco 02)
4. Renderizar tabela com as duas métricas lado a lado, ordenada por progresso tático decrescente, destacando a linha da Coordenação atualmente selecionada

**Edge cases:**
- `app_settings` ainda sem nenhuma linha (edge de deploy/seed não rodado): tratar como `false` (comparativo desativado) por padrão — fail-closed
- Falha na query de `app_settings`: esconder o bloco silenciosamente, sem quebrar os outros blocos

---

### Feature 1.6: Toggle da flag de comparativo (admin)
**Categoria:** frontend
**Descrição:** Controle simples, exposto só a `is_super_admin`, para ligar/desligar o comparativo entre regiões.

**Steps:**
1. Exibir um switch no cabeçalho da aba, visível só quando `okrCurrentUser.is_super_admin`
2. Ao alternar: `sb.from('app_settings').update({ comparativo_regioes_liberado: novoValor, updated_at: new Date().toISOString() }).eq('id', true)`
3. Re-renderizar o Bloco 1.5 imediatamente para quem está com a aba aberta na mesma sessão que fez o toggle (sem realtime entre sessões diferentes nesta fase)

**Edge cases:**
- Update falha (rede/RLS): reverter o switch visualmente e mostrar mensagem de erro, sem persistir estado otimista incorreto

---

### Feature 1.7: Schema — tabela `app_settings` + RLS
**Categoria:** database
**Descrição:** Única alteração de schema desta spec — tabela singleton para a flag de comparativo entre regiões.

**Steps:**
1. `CREATE TABLE public.app_settings (id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE), comparativo_regioes_liberado BOOLEAN NOT NULL DEFAULT FALSE, updated_at TIMESTAMPTZ DEFAULT NOW())`
2. Seed da linha singleton (`id = true`) na migration — se a tabela nascer vazia, o client trata a ausência de linha como "desativado" (ver edge case da Feature 1.5)
3. RLS: `SELECT` liberado para `authenticated` (qualquer coordenador precisa ler a flag para saber se o Bloco 1.5 aparece); `UPDATE` restrito a `is_super_admin` via policy usando `profiles.is_super_admin`

**Edge cases:**
- Tentativa de `INSERT` de uma segunda linha: bloqueada pelo `CHECK (id = TRUE)` — a tabela é sempre singleton
- Coordenador tentando `UPDATE` diretamente via client, contornando a UI: bloqueado pela RLS, não só pela ausência do botão

---

### Feature 1.8: Leitura das demais tabelas respeita a RLS existente
**Categoria:** database
**Descrição:** Nenhuma escrita nova além do toggle da Feature 1.6; nenhuma tabela/coluna nova além de `app_settings`.

**Steps:**
1. Confirmar que `product_team`, `areas`, `area_volunteers`, `objectives`, `key_results` e `agenda_eventos` já têm policy de `SELECT` para `authenticated` (reaproveitada da Central de Comando)
2. Não criar nenhuma policy de escrita nova em `agenda_eventos`, `checkins` ou `objectives` nesta spec — o Bloco 1.4 é somente leitura (decisão confirmada)

**Edge cases:**
- Coordenador logado ainda sem nenhuma linha em `product_team` (perfil recém-criado): dropdown de seleção de Coordenação fica vazio, tela mostra "Você ainda não foi associado a nenhuma Coordenação Regional"
