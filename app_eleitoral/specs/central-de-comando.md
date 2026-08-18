# SPEC: Central de Comando — Fase 1

**Descrição:** Painel executivo de leitura sobre a saúde da campanha (OKRs estratégicos, cobertura territorial, ranking de coordenações regionais, prazos do TSE e agenda), como nova aba dentro do app existente.
**Entregável:** Nova aba `comando` funcional (`index.html` + `public/app.js` + `style.css`), só leitura, sem alteração de `supabase/schema.sql`.
**Risco:** baixo
**Pré-requisito:** nenhum (migrations pendentes já resolvidas)

---

## Decisões de negócio (confirmadas com o candidato)

| Pergunta | Resposta |
|---|---|
| Quem vê a aba | Nível estratégico (`is_super_admin`) + coordenadores (membros de `product_team`). Voluntários operacionais não veem. |
| Ranking de coordenações | Lista completa, mas só o top N aparece com nome; posições abaixo do N aparecem só como número/posição, sem nome. |
| Ciclo ativo prevalente | Quando há mais de um `period` ativo simultâneo, prevalece o de `tipo_ciclo='semanal'` (o mais recente por `data_inicio`, se houver mais de um semanal ativo). |
| Limiares do semáforo | Verde ≥ 70%, amarelo 40–69%, vermelho < 40%. |
| Auto-redirect pós-login | Sim — nível estratégico e coordenadores caem direto na aba `comando` após login, em vez do padrão atual (`map`). |
| Janela de atividade recente | 7 dias corridos fixos, a partir de hoje. |

---

### Feature 1.1: Esqueleto da aba, menu e navegação
**Categoria:** frontend
**Descrição:** Nova aba integrada ao `switchTab()` existente, com redirecionamento condicional pós-login.

**Steps:**
1. Adicionar botão `<button data-tab="comando" onclick="switchTab('comando')">` no `.nav-tabs`, entre RAs e Dashboard
2. Criar `<div id="view-comando" class="view-container">` seguindo o padrão de `view-okr`/`view-agenda` e registrar em `switchTab()`
3. Criar `initComandoModule()`, chamado ao entrar na aba, disparando os fetches dos 4 blocos em paralelo com `Promise.allSettled` (não `Promise.all`)
4. Exibir o botão da aba só se `okrCurrentUser.is_super_admin` OU existir linha em `product_team` para o usuário logado
5. Após login bem-sucedido, se o usuário é nível estratégico ou coordenador, chamar `switchTab('comando')` automaticamente em vez de deixar em `map`

**Edge cases:**
- Usuário sem `product_team` e sem `is_super_admin` tenta acessar a aba manipulando o DOM: bloquear no client com estado "sem permissão" (a leitura das tabelas em si já é aberta por RLS — isso é UI, não segurança)
- Redirecionamento pós-login dispara só uma vez, no evento de login, não a cada re-render da tela

---

### Feature 1.2: Bloco 01 — Semáforo de OKRs Estratégicos
**Categoria:** frontend
**Descrição:** Card-resumo + lista de objetivos estratégicos do ciclo semanal ativo, com cor por faixa de progresso.

**Steps:**
1. Buscar o `period` ativo com `tipo_ciclo='semanal'` e `ativo=true` (o de `data_inicio` mais recente, se houver mais de um)
2. `sb.from('objectives').select('id,titulo,progresso').eq('nivel','estrategico').eq('period_id', periodoSemanalAtivoId)`
3. Classificar cada objetivo: verde ≥ 70, amarelo 40–69, vermelho < 40
4. Card-resumo no topo com a média simples dos objetivos retornados
5. Renderizar skeleton enquanto carrega; depois, lista com barra de progresso e badge de cor por objetivo

**Edge cases:**
- Nenhum period semanal ativo: mostrar "Nenhum ciclo semanal ativo no momento", sem quebrar os outros 3 blocos
- Nenhum objetivo estratégico no ciclo ativo: estado vazio "Nenhum OKR estratégico definido para este ciclo"
- Falha na query (rede/RLS): erro isolado nesse card, com botão "tentar de novo", sem afetar os demais blocos

---

### Feature 1.3: Bloco 02 — Cobertura Territorial
**Categoria:** frontend
**Descrição:** Lista de RAs ordenada por % de quadrantes com voluntário atribuído.

**Steps:**
1. `sb.from('areas').select('id, ra_nome')`
2. `sb.from('area_volunteers').select('area_id')`
3. Agrupar `areas` por `ra_nome`; cruzar com `area_volunteers` no client para calcular % coberto por RA
4. Ordenar a lista com as RAs de menor cobertura primeiro, para destacar onde falta gente
5. Renderizar barra de progresso por RA, reaproveitando o padrão visual do Dashboard atual

**Edge cases:**
- Nenhuma `area` cadastrada em nenhuma RA: estado vazio de tela inteira "Nenhum quadrante gerado — gere pela aba OKR", com link direto
- RA com `areas` cadastradas mas nenhuma com voluntário (0% de cobertura): entra na lista com barra vazia, não é omitida
- RA sem nenhuma `area` cadastrada ainda: não aparece na lista — evita divisão por zero (cobertura 0/0 não existe)

---

### Feature 1.4: Bloco 03 — Ranking de Coordenações Regionais
**Categoria:** frontend
**Descrição:** Top N de coordenações por progresso tático médio no ciclo semanal ativo, com selo de atividade recente.

**Steps:**
1. `sb.from('products').select('id, nome, ra_nome')`
2. `sb.from('objectives').select('product_id, progresso').eq('nivel','tatico').eq('period_id', periodoSemanalAtivoId)`
3. `sb.from('checkins').select('area_id, created_at').gte('created_at', hoje-7dias)`; cruzar `area_id` → `product_id` usando as `areas` já carregadas no bloco 02
4. Calcular progresso médio por `product_id` e ordenar decrescente
5. Selo 🔥 ativa se a coordenação teve pelo menos 1 check-in nos últimos 7 dias corridos, senão 💤
6. Renderizar top N (ex: 5) com nome da coordenação; posições abaixo do N aparecem só com o número da posição, sem nome

**Edge cases:**
- Coordenação sem nenhum objetivo tático no ciclo ativo: entra no ranking com progresso 0%, não é omitida
- Empate de progresso entre duas coordenações: desempate pelo selo de atividade (mais check-ins na janela de 7 dias primeiro)
- Nenhuma Coordenação Regional cadastrada (`products` vazio): estado vazio "Nenhuma Coordenação Regional cadastrada ainda"

---

### Feature 1.5: Bloco 04 — Radar de Prazos & Agenda
**Categoria:** frontend
**Descrição:** Contagem regressiva do próximo prazo TSE em destaque + lista dos compromissos confirmados dos próximos 3 dias.

**Steps:**
1. `sb.from('prazos_eleitorais').select('data,titulo,destaque').gte('data', hoje).order('data').limit(5)`
2. `sb.from('agenda_eventos').select('titulo,data_hora,local,ra_nome').eq('status','confirmado').gte('data_hora', hoje).lte('data_hora', hoje+3dias).order('data_hora')`
3. Encontrar o primeiro prazo com `destaque=true` dentre os 5 retornados; se nenhum tiver destaque, usar o mais próximo sem o estilo de destaque
4. Renderizar contagem regressiva em dias (hoje até a data do prazo escolhido)
5. Renderizar lista compacta dos eventos confirmados dos próximos 3 dias

**Edge cases:**
- Nenhum prazo futuro cadastrado (fim do calendário TSE): esconder o card de contagem regressiva sem quebrar o bloco de agenda
- Nenhum evento confirmado nos próximos 3 dias: estado vazio "Nenhum compromisso confirmado nos próximos dias"
- Falha isolada em uma das duas queries (prazos ok, agenda falha, ou vice-versa): renderiza a metade que funcionou; erro só na outra metade

---

### Feature 1.6: Leitura respeita a RLS existente
**Categoria:** database
**Descrição:** Nenhuma escrita, tabela, coluna ou policy nova nesta fase.

**Steps:**
1. Confirmar que `objectives`, `key_results`, `products`, `areas`, `area_volunteers`, `checkins`, `agenda_eventos`, `prazos_eleitorais` e `periods` já têm policy de `SELECT` para `authenticated`
2. Não criar nenhuma tabela, view, coluna ou policy nova nesta fase
3. Nunca ler `checkins` de outro usuário diretamente pelo client fora do papel de admin/product member — o selo de atividade do bloco 03 é uma contagem agregada por coordenação, não uma listagem de check-ins individuais

**Edge cases:**
- Coordenador logado ainda sem nenhuma linha em `product_team` (perfil recém-criado): vê o ranking geral normalmente (leitura é aberta), só não tem "minha coordenação" destacada — não deve quebrar a tela
