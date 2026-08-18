-- ============================================================
-- SCHEMA SUPABASE: MÓDULO DE OKRs — CAMPANHA DF 2026
-- Hierarquia: Campanha (única) -> RA (departamento) -> Coordenação
-- Regional/"product" (por Zona Eleitoral, pode haver mais de uma por
-- zona) -> Ciclo ("period", cadência diária/semanal/mensal) ->
-- Objective (estratégico ou tático) -> Key Result.
--
-- Benchmark conceitual: oslokommune/okr-tracker (organization/
-- department/product/period + rollup de progresso via trigger +
-- RLS por associação a um nó). Modelo simplificado deliberadamente:
-- sem tabela organizations (só existe uma campanha) nem departments
-- normalizada (a RA já é usada como texto em todo o app, ver
-- scripts/data/regioes_administrativas.geojson).
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Perfis de usuário (populado via trigger em auth.users, ver abaixo)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    is_super_admin BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Coordenação Regional ("product"): unidade tática vinculada a uma
--    RA e a uma Zona Eleitoral. Uma zona pode ter mais de uma
--    coordenação (mais de um coordenador responsável).
CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    ra_nome TEXT NOT NULL,
    zona_eleitoral TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. Equipe de cada Coordenação Regional (N:M) — substitui as tabelas
--    coordenadores_regiao + okr_equipe_operacional do esqueleto
--    anterior por uma única associação com papel.
CREATE TABLE IF NOT EXISTS public.product_team (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('coordenador', 'operacional')),
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (product_id, user_id)
);

-- 4. Ciclo de acompanhamento ("period"), cadência configurável.
CREATE TABLE IF NOT EXISTS public.periods (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    nome TEXT NOT NULL,
    tipo_ciclo TEXT NOT NULL CHECK (tipo_ciclo IN ('diario', 'semanal', 'mensal')),
    data_inicio DATE NOT NULL,
    data_fim DATE,
    ativo BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Objetivos: nivel='estrategico' -> product_id NULL (campanha
--    inteira); nivel='tatico' -> product_id preenchido (Coordenação
--    Regional responsável).
CREATE TABLE IF NOT EXISTS public.objectives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    nivel TEXT NOT NULL CHECK (nivel IN ('estrategico', 'tatico')),
    period_id UUID NOT NULL REFERENCES public.periods(id) ON DELETE RESTRICT,
    product_id UUID REFERENCES public.products(id) ON DELETE CASCADE,
    progresso NUMERIC(5, 2) NOT NULL DEFAULT 0,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT objective_nivel_product_chk CHECK (
        (nivel = 'estrategico' AND product_id IS NULL) OR
        (nivel = 'tatico' AND product_id IS NOT NULL)
    )
);

-- 6. Key Results: metas mensuráveis de cada objective.
CREATE TABLE IF NOT EXISTS public.key_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    objective_id UUID NOT NULL REFERENCES public.objectives(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    target_value NUMERIC(12, 2) NOT NULL DEFAULT 100,
    current_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'unidades',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Artefatos e comprovantes digitalizados de campo.
CREATE TABLE IF NOT EXISTS public.okr_artefatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_result_id UUID REFERENCES public.key_results(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    arquivo_url TEXT NOT NULL,
    tipo_artefato TEXT CHECK (tipo_artefato IN ('foto', 'comprovante', 'lista_presenca', 'relatorio', 'outro')),
    enviado_por UUID REFERENCES public.profiles(id),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. Agenda pública do candidato. 'oficial' é publicado direto pelo nível
--    estratégico (já nasce 'confirmado'); 'visita_solicitada' e
--    'participacao_solicitada' são pedidos de uma Coordenação Regional
--    (nascem 'pendente', dependem de aprovação do nível estratégico).
CREATE TABLE IF NOT EXISTS public.agenda_eventos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    titulo TEXT NOT NULL,
    descricao TEXT,
    tipo TEXT NOT NULL CHECK (tipo IN ('oficial', 'visita_solicitada', 'participacao_solicitada')),
    local TEXT,
    ra_nome TEXT,
    product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
    data_hora TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'confirmado', 'recusado', 'cancelado')),
    solicitado_por UUID REFERENCES public.profiles(id),
    resposta_admin TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. Prazos oficiais do calendário eleitoral (Resolução TSE nº 23.760,
--    de 2 de março de 2026). Tabela de referência, só-leitura para a
--    equipe de campanha (qualquer visitante, mesmo sem login, já que é
--    informação pública) — só o nível estratégico pode corrigir/ajustar.
CREATE TABLE IF NOT EXISTS public.prazos_eleitorais (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    data DATE NOT NULL,
    titulo TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT NOT NULL CHECK (categoria IN (
        'partidos', 'convencao', 'candidatura', 'propaganda', 'eleitorado',
        'urnas', 'financiamento', 'pesquisas', 'administrativo', 'votacao', 'diplomacao'
    )),
    destaque BOOLEAN NOT NULL DEFAULT FALSE,
    fonte TEXT NOT NULL DEFAULT 'Resolução TSE nº 23.760/2026',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 10. Quadrante (célula de grade de tamanho fixo) dentro de uma
--     Coordenação Regional, gerado automaticamente sobre a caixa
--     delimitadora da RA — evita depender de desenho manual de
--     polígono. "codigo" é estável (ex: CEI-01) para medir/comparar
--     cobertura de campo ao longo do tempo.
CREATE TABLE IF NOT EXISTS public.areas (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    codigo TEXT NOT NULL UNIQUE,
    nome TEXT NOT NULL,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    ra_nome TEXT NOT NULL,
    zona_eleitoral TEXT,
    lat_min NUMERIC(9, 6) NOT NULL,
    lat_max NUMERIC(9, 6) NOT NULL,
    lng_min NUMERIC(9, 6) NOT NULL,
    lng_max NUMERIC(9, 6) NOT NULL,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. Atribuição de voluntários a quadrantes (N:M — um voluntário
--     pode cobrir mais de um quadrante).
CREATE TABLE IF NOT EXISTS public.area_volunteers (
    area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    atribuido_por UUID REFERENCES public.profiles(id),
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (area_id, user_id)
);

-- 12. Check-in geolocalizado de ação de campo do voluntário.
--     "dentro_area" é calculado no client (comparação numérica
--     simples contra a bounding box do quadrante) no momento do
--     check-in.
CREATE TABLE IF NOT EXISTS public.checkins (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    descricao TEXT NOT NULL,
    lat NUMERIC(9, 6) NOT NULL,
    lng NUMERIC(9, 6) NOT NULL,
    dentro_area BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Reaproveita okr_artefatos (já tem status pendente/aprovado/rejeitado
-- e key_result_id nullable) em vez de criar uma tabela paralela de
-- anexos só para comprovantes de check-in.
ALTER TABLE public.okr_artefatos ADD COLUMN IF NOT EXISTS checkin_id UUID REFERENCES public.checkins(id) ON DELETE CASCADE;
ALTER TABLE public.okr_artefatos ADD CONSTRAINT okr_artefatos_vinculo_chk CHECK (key_result_id IS NOT NULL OR checkin_id IS NOT NULL);

-- 13. Configuração global da campanha (linha única — CHECK (id = TRUE)
--     garante que nunca existe mais de uma linha). Hoje só guarda a
--     flag que libera o comparativo entre Coordenações Regionais no
--     Painel do Coordenador; pensada para crescer com outras chaves
--     de configuração do nível estratégico no futuro.
CREATE TABLE IF NOT EXISTS public.app_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    comparativo_regioes_liberado BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.app_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- TRIGGER: criar profile automaticamente no primeiro login
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)), NEW.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================================
-- TRIGGER: rollup de progresso — recalcula objectives.progresso
-- sempre que um key_result é criado/atualizado/removido.
-- Benchmark simplificado de functions/progress/handleKeyResultProgress.js
-- do okr-tracker (lá a cascata sobe até 3 níveis; aqui é um único
-- salto, key_result -> objective, porque a hierarquia é mais rasa).
-- ============================================================
CREATE OR REPLACE FUNCTION public.recalc_objective_progress()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    target_objective_id UUID;
BEGIN
    target_objective_id := COALESCE(NEW.objective_id, OLD.objective_id);

    UPDATE public.objectives o
    SET progresso = COALESCE((
            SELECT AVG(LEAST(kr.current_value / NULLIF(kr.target_value, 0), 1)) * 100
            FROM public.key_results kr
            WHERE kr.objective_id = target_objective_id
        ), 0),
        updated_at = NOW()
    WHERE o.id = target_objective_id;

    RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS on_key_result_change ON public.key_results;
CREATE TRIGGER on_key_result_change
    AFTER INSERT OR UPDATE OR DELETE ON public.key_results
    FOR EACH ROW EXECUTE FUNCTION public.recalc_objective_progress();

-- ============================================================
-- FUNÇÕES AUXILIARES DE RLS
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE((SELECT is_super_admin FROM public.profiles WHERE id = auth.uid()), FALSE);
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_product(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.product_team
        WHERE product_id = p_product_id AND user_id = auth.uid()
    );
$$;

CREATE OR REPLACE FUNCTION public.is_member_of_area(p_area_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.area_volunteers
        WHERE area_id = p_area_id AND user_id = auth.uid()
    );
$$;

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Leitura: aberta a qualquer usuário autenticado (transparência dos
-- objetivos e metas para todos os níveis, conforme objetivo do módulo).
-- Escrita: super admin (nível estratégico) ou membro da Coordenação
-- Regional ("product") responsável pelo registro.
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_team ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_artefatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prazos_eleitorais ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "profiles_select_auth" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_self_or_admin" ON public.profiles FOR UPDATE TO authenticated
    USING (id = auth.uid() OR public.is_super_admin());

-- products
CREATE POLICY "products_select_auth" ON public.products FOR SELECT TO authenticated USING (true);
CREATE POLICY "products_write_admin" ON public.products FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- product_team
CREATE POLICY "product_team_select_auth" ON public.product_team FOR SELECT TO authenticated USING (true);
CREATE POLICY "product_team_write_admin_or_coordenador" ON public.product_team FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_member_of_product(product_id))
    WITH CHECK (public.is_super_admin() OR public.is_member_of_product(product_id));

-- periods (só o nível estratégico define os ciclos da campanha)
CREATE POLICY "periods_select_auth" ON public.periods FOR SELECT TO authenticated USING (true);
CREATE POLICY "periods_write_admin" ON public.periods FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- objectives
CREATE POLICY "objectives_select_auth" ON public.objectives FOR SELECT TO authenticated USING (true);
CREATE POLICY "objectives_write_admin_or_product_member" ON public.objectives FOR ALL TO authenticated
    USING (public.is_super_admin() OR (product_id IS NOT NULL AND public.is_member_of_product(product_id)))
    WITH CHECK (public.is_super_admin() OR (product_id IS NOT NULL AND public.is_member_of_product(product_id)));

-- key_results (segue a permissão do objective pai)
CREATE POLICY "key_results_select_auth" ON public.key_results FOR SELECT TO authenticated USING (true);
CREATE POLICY "key_results_write_admin_or_product_member" ON public.key_results FOR ALL TO authenticated
    USING (
        public.is_super_admin() OR EXISTS (
            SELECT 1 FROM public.objectives o
            WHERE o.id = key_results.objective_id
              AND o.product_id IS NOT NULL
              AND public.is_member_of_product(o.product_id)
        )
    )
    WITH CHECK (
        public.is_super_admin() OR EXISTS (
            SELECT 1 FROM public.objectives o
            WHERE o.id = key_results.objective_id
              AND o.product_id IS NOT NULL
              AND public.is_member_of_product(o.product_id)
        )
    );

-- okr_artefatos (qualquer membro do time do produto responsável pelo
-- key_result pode anexar evidência de campo; leitura é transparente
-- para artefatos de KR — os de check-in (checkin_id) seguem a mesma
-- privacidade do check-in pai, ver policy abaixo)
DROP POLICY IF EXISTS "artefatos_select_auth" ON public.okr_artefatos;
CREATE POLICY "artefatos_select_auth" ON public.okr_artefatos FOR SELECT TO authenticated
    USING (
        key_result_id IS NOT NULL
        OR public.is_super_admin()
        OR enviado_por = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.checkins c
            WHERE c.id = okr_artefatos.checkin_id
              AND EXISTS (SELECT 1 FROM public.areas a WHERE a.id = c.area_id AND public.is_member_of_product(a.product_id))
        )
    );

CREATE POLICY "artefatos_write_admin_or_product_member" ON public.okr_artefatos FOR ALL TO authenticated
    USING (
        public.is_super_admin() OR EXISTS (
            SELECT 1 FROM public.key_results kr
            JOIN public.objectives o ON o.id = kr.objective_id
            WHERE kr.id = okr_artefatos.key_result_id
              AND o.product_id IS NOT NULL
              AND public.is_member_of_product(o.product_id)
        )
    )
    WITH CHECK (
        public.is_super_admin() OR EXISTS (
            SELECT 1 FROM public.key_results kr
            JOIN public.objectives o ON o.id = kr.objective_id
            WHERE kr.id = okr_artefatos.key_result_id
              AND o.product_id IS NOT NULL
              AND public.is_member_of_product(o.product_id)
        )
    );

-- voluntário pode anexar/gerenciar artefato do próprio check-in
CREATE POLICY "artefatos_write_own_checkin" ON public.okr_artefatos FOR ALL TO authenticated
    USING (
        checkin_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.checkins c WHERE c.id = okr_artefatos.checkin_id AND c.user_id = auth.uid()
        )
    )
    WITH CHECK (
        enviado_por = auth.uid() AND checkin_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.checkins c WHERE c.id = okr_artefatos.checkin_id AND c.user_id = auth.uid()
        )
    );

-- agenda_eventos
-- Leitura pública (mesmo sem login) dos compromissos já confirmados —
-- é a primeira tabela do schema com policy "TO anon", pensada para
-- divulgação da agenda do candidato a qualquer visitante do site.
CREATE POLICY "agenda_public_read" ON public.agenda_eventos FOR SELECT TO anon, authenticated
    USING (status = 'confirmado');

-- Leitura estendida: quem solicitou, a Coordenação Regional dona do
-- pedido, ou o nível estratégico também enxergam pendentes/recusados.
CREATE POLICY "agenda_own_read" ON public.agenda_eventos FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR solicitado_por = auth.uid()
        OR (product_id IS NOT NULL AND public.is_member_of_product(product_id))
    );

-- Nível estratégico publica compromisso oficial direto (qualquer tipo/status).
CREATE POLICY "agenda_insert_admin" ON public.agenda_eventos FOR INSERT TO authenticated
    WITH CHECK (public.is_super_admin());

-- Coordenador só cria solicitação pendente amarrada à própria Coordenação.
CREATE POLICY "agenda_insert_coordenador" ON public.agenda_eventos FOR INSERT TO authenticated
    WITH CHECK (
        tipo IN ('visita_solicitada', 'participacao_solicitada')
        AND status = 'pendente'
        AND solicitado_por = auth.uid()
        AND product_id IS NOT NULL
        AND public.is_member_of_product(product_id)
    );

-- Nível estratégico aprova/recusa/edita qualquer solicitação ou evento.
CREATE POLICY "agenda_update_admin" ON public.agenda_eventos FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- Coordenador pode cancelar a própria solicitação enquanto ela ainda está pendente.
CREATE POLICY "agenda_update_own_pending" ON public.agenda_eventos FOR UPDATE TO authenticated
    USING (solicitado_por = auth.uid() AND status = 'pendente')
    WITH CHECK (solicitado_por = auth.uid() AND status = 'cancelado');

CREATE POLICY "agenda_delete_admin" ON public.agenda_eventos FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- prazos_eleitorais (referência pública do calendário oficial do TSE)
CREATE POLICY "prazos_eleitorais_public_read" ON public.prazos_eleitorais FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY "prazos_eleitorais_write_admin" ON public.prazos_eleitorais FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- areas (quadrantes): leitura aberta (mesma transparência do resto do
-- OKR); só o nível estratégico gera/edita/apaga a grade.
CREATE POLICY "areas_select_auth" ON public.areas FOR SELECT TO authenticated USING (true);
CREATE POLICY "areas_write_admin" ON public.areas FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- area_volunteers: leitura aberta; escrita por admin ou qualquer
-- membro do product_team dono do quadrante (coordenador ou operacional).
CREATE POLICY "area_volunteers_select_auth" ON public.area_volunteers FOR SELECT TO authenticated USING (true);
CREATE POLICY "area_volunteers_write_admin_or_product_member" ON public.area_volunteers FOR ALL TO authenticated
    USING (
        public.is_super_admin() OR EXISTS (
            SELECT 1 FROM public.areas a WHERE a.id = area_volunteers.area_id AND public.is_member_of_product(a.product_id)
        )
    )
    WITH CHECK (
        public.is_super_admin() OR EXISTS (
            SELECT 1 FROM public.areas a WHERE a.id = area_volunteers.area_id AND public.is_member_of_product(a.product_id)
        )
    );

-- checkins: só o próprio voluntário, o product_team do quadrante, ou
-- admin leem; só o voluntário atribuído àquela área pode inserir.
CREATE POLICY "checkins_select_own_or_product_member" ON public.checkins FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.areas a WHERE a.id = checkins.area_id AND public.is_member_of_product(a.product_id))
    );
CREATE POLICY "checkins_insert_own_area" ON public.checkins FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_member_of_area(area_id));
CREATE POLICY "checkins_write_admin" ON public.checkins FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
CREATE POLICY "checkins_delete_admin" ON public.checkins FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- app_settings: leitura aberta (qualquer coordenador precisa ler a flag
-- para saber se o comparativo entre regiões aparece no Painel do
-- Coordenador); só o nível estratégico liga/desliga.
CREATE POLICY "app_settings_select_auth" ON public.app_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "app_settings_write_admin" ON public.app_settings FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ============================================================
-- STORAGE: bucket "artefatos" — comprovantes de campo, público
-- para leitura (o registro em okr_artefatos.arquivo_url aponta
-- para uma URL pública). Escrita liberada a qualquer usuário
-- autenticado; refinar depois por product_team se necessário.
-- ============================================================
INSERT INTO storage.buckets (id, name, public)
VALUES ('artefatos', 'artefatos', true)
ON CONFLICT (id) DO NOTHING;

-- storage.buckets também tem RLS habilitado por padrão no Supabase;
-- sem esta política, o client não consegue nem ler os metadados do
-- bucket (list/getPublicUrl dependem disso), mesmo com o bucket "público".
DROP POLICY IF EXISTS "artefatos_bucket_metadata_read" ON storage.buckets;
CREATE POLICY "artefatos_bucket_metadata_read" ON storage.buckets FOR SELECT
    USING (id = 'artefatos');

DROP POLICY IF EXISTS "artefatos_bucket_read" ON storage.objects;
CREATE POLICY "artefatos_bucket_read" ON storage.objects FOR SELECT
    USING (bucket_id = 'artefatos');

DROP POLICY IF EXISTS "artefatos_bucket_write_auth" ON storage.objects;
CREATE POLICY "artefatos_bucket_write_auth" ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'artefatos');

-- ============================================================
-- SEED: calendário eleitoral oficial 2026 (Resolução TSE nº 23.760,
-- de 2 de março de 2026, com as datas replicadas por fontes oficiais
-- e institucionais — TSE, TRE-SP, TRE-PR, Senado Notícias). Roda uma
-- única vez: se a tabela já tiver alguma linha, não insere de novo.
-- ============================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.prazos_eleitorais) THEN
        INSERT INTO public.prazos_eleitorais (data, titulo, descricao, categoria, destaque) VALUES
        ('2026-01-01', 'Início do registro de pesquisas eleitorais', 'Início do registro obrigatório na Justiça Eleitoral de pesquisas de opinião pública que venham a ser divulgadas sobre o pleito ou possíveis candidatos.', 'pesquisas', false),
        ('2026-03-05', 'Início da janela partidária', 'Publicação das instruções do TSE; abertura do período em que deputados federais, estaduais e distritais podem trocar de partido sem risco de perda de mandato (até 03/04).', 'partidos', false),
        ('2026-04-01', 'Início da propaganda institucional do TSE', 'Início da campanha institucional de esclarecimento ao eleitor conduzida pelo TSE.', 'propaganda', false),
        ('2026-04-03', 'Encerramento da janela partidária', 'Fim do prazo para troca de partido sem perda de mandato.', 'partidos', false),
        ('2026-04-04', 'Desincompatibilização e registro de estatutos', 'Prazo para registro de estatutos partidários, confirmação de domicílio eleitoral e para candidatos que ocupam cargo no Executivo se afastarem do mandato (desincompatibilização).', 'candidatura', false),
        ('2026-04-06', 'Alistamento e transferência sem biometria', 'Último dia para alistamento e transferência de eleitores em municípios sem coleta de biometria.', 'eleitorado', false),
        ('2026-04-07', 'Normas partidárias e vedação de reajuste salarial', 'Publicação de normas sobre atuação partidária; início da proibição de reajuste de remuneração de servidores públicos.', 'administrativo', false),
        ('2026-05-06', 'Alistamento com biometria', 'Último dia para alistamento com biometria e regularização de presos provisórios.', 'eleitorado', false),
        ('2026-05-07', 'Início da suspensão do alistamento eleitoral', 'Suspensão do alistamento e da transferência de eleitores até 02/11/2026.', 'eleitorado', false),
        ('2026-05-13', 'Testes públicos de segurança das urnas (correções)', 'Período de correções decorrentes dos testes públicos de segurança do sistema eletrônico de votação (até 15/05).', 'urnas', false),
        ('2026-05-15', 'Início do financiamento coletivo (vaquinha)', 'Início da arrecadação de recursos por financiamento coletivo para pré-campanha.', 'financiamento', false),
        ('2026-06-01', 'Liberação do Fundo Eleitoral', 'Liberação dos recursos do Fundo Especial de Financiamento de Campanha; prazo para partidos renunciarem ao fundo.', 'financiamento', false),
        ('2026-06-05', 'Divulgação de devedores de multas eleitorais', 'Divulgação da relação de devedores de multas eleitorais.', 'administrativo', false),
        ('2026-06-16', 'Publicação do montante do FEFC', 'Publicação do montante total do Fundo Especial de Financiamento de Campanha por partido.', 'financiamento', false),
        ('2026-06-22', 'Prazo para seções eleitorais no exterior', 'Prazo para pedidos de criação de seções eleitorais no exterior.', 'eleitorado', false),
        ('2026-06-30', 'Vedação a programas com pré-candidatos', 'Vedação à participação de pré-candidatos em programas de rádio/TV; limite para publicidade institucional.', 'propaganda', false),
        ('2026-07-04', 'Restrições administrativas pré-eleitorais', 'Início das proibições de nomeação, transferência e publicidade institucional por órgãos públicos; cedência de servidores à Justiça Eleitoral.', 'administrativo', false),
        ('2026-07-05', 'Informações sobre o sistema CANDex', 'Prazo relacionado à disponibilização de informações no sistema de candidaturas (CANDex).', 'candidatura', false),
        ('2026-07-06', 'Entrega dos códigos-fonte dos sistemas eleitorais', 'Entrega dos códigos-fonte dos sistemas eleitorais para auditoria; decisão sobre seções no exterior.', 'urnas', false),
        ('2026-07-07', 'Editais de convocação de mesários', 'Publicação dos editais de convocação de mesários.', 'administrativo', false),
        ('2026-07-10', 'Audiência pública sobre divulgação de resultados', 'Audiência pública sobre os procedimentos de divulgação de resultados da eleição.', 'administrativo', false),
        ('2026-07-13', 'Cadastramento de agregação de seções', 'Prazo para cadastramento de agregação de seções eleitorais.', 'administrativo', false),
        ('2026-07-16', 'Início dos comunicados ao eleitorado', 'Início do envio de comunicados ao eleitorado; abertura de consulta pública sobre locais de votação.', 'eleitorado', false),
        ('2026-07-17', 'Seções em estabelecimentos prisionais', 'Habilitação de locais e criação de seções eleitorais em presídios.', 'eleitorado', false),
        ('2026-07-19', 'Atualização de locais de voto em trânsito', 'Atualização dos locais habilitados para voto em trânsito.', 'eleitorado', false),
        ('2026-07-20', 'Início das convenções partidárias', 'Início do período de convenções partidárias e de federações para escolha de candidaturas e coligações (até 05/08). Também começam: envio de atas de convenção, publicação dos limites de gastos de campanha, definição da representação partidária nas mesas, garantia de direito de resposta, pesquisas eleitorais com todos os pré-candidatos, prioridade de tramitação judicial, restrições a magistrados e uso de comunicação eletrônica partidária.', 'convencao', false),
        ('2026-07-24', 'Publicação das Juntas Eleitorais', 'Publicação dos integrantes das Juntas Eleitorais responsáveis pela apuração.', 'administrativo', false),
        ('2026-07-30', 'Fim da propaganda institucional e relatório de testes', 'Prazo final para propaganda institucional; publicação do relatório dos testes de segurança das urnas.', 'propaganda', false),
        ('2026-08-04', 'Fim da propaganda intrapartidária', 'Encerramento da propaganda eleitoral intrapartidária; divulgação da divisão de tempo de rádio/TV entre os partidos.', 'propaganda', false),
        ('2026-08-05', 'Encerramento das convenções partidárias', 'Fim do período de convenções; início da prioridade postal para material de campanha; publicação de editais/nomeações; designação das Juntas Eleitorais.', 'convencao', true),
        ('2026-08-06', 'Restrições de programação em rádio e TV', 'Início das restrições à programação normal de emissoras de rádio e televisão.', 'propaganda', false),
        ('2026-08-15', 'Prazo final para registro de candidaturas', 'Último dia para partidos, federações e coligações registrarem formalmente as candidaturas na Justiça Eleitoral. Também: restrições de programação, funcionamento de cartórios eleitorais nos fins de semana, convocação para o plano de mídia, abertura de contas bancárias de campanha, divulgação de prestação parcial de contas e informação de veículos/itinerários de propaganda volante.', 'candidatura', true),
        ('2026-08-16', 'Início oficial da propaganda eleitoral', 'Início da propaganda eleitoral nas ruas e na internet: lives, comícios, carreatas, distribuição de material, propaganda em jornais e impulsionamento pago na internet. Proibição de novas enquetes não registradas.', 'propaganda', true),
        ('2026-08-18', 'Data de referência para candidaturas', 'Data de referência para fins de verificação de requisitos de elegibilidade e filiação partidária.', 'candidatura', false),
        ('2026-08-20', 'Habilitação de voto em trânsito', 'Habilitação dos locais de votação em trânsito.', 'eleitorado', false),
        ('2026-08-21', 'Percentual de candidaturas femininas, negras e indígenas', 'Divulgação do percentual de candidaturas femininas, negras e indígenas registradas.', 'candidatura', false),
        ('2026-08-23', 'Convocação do plano de mídia', 'Convocação de emissoras de rádio e TV para o plano de mídia da propaganda eleitoral gratuita.', 'propaganda', false),
        ('2026-08-25', 'Comissão de Transporte', 'Indicação de membros da Comissão de Transporte no dia da votação.', 'administrativo', false),
        ('2026-08-26', 'Responsáveis pela entrega de mídias', 'Indicação dos responsáveis pela entrega das mídias das urnas eletrônicas.', 'urnas', false),
        ('2026-08-27', 'Agregação de seções eleitorais', 'Prazo para agregação de seções eleitorais.', 'administrativo', false),
        ('2026-08-28', 'Início da propaganda eleitoral gratuita no rádio e TV', 'Início do horário eleitoral gratuito no rádio e na televisão para o 1º turno (até 01/10). Também: publicação de edital de mesários especiais e habilitação de mesários.', 'propaganda', true),
        ('2026-08-30', 'Distribuição de recursos do Fundo Eleitoral', 'Distribuição dos recursos do Fundo Eleitoral aos candidatos; homologação dos programas de rádio/TV.', 'financiamento', false),
        ('2026-08-31', 'Agregação de seções pelos TREs', 'Prazo para os Tribunais Regionais Eleitorais concluírem a agregação de seções.', 'administrativo', false),
        ('2026-09-01', 'Consulta de seção eleitoral', 'Disponibilização da consulta de local de votação ao eleitor; requisição de notas fiscais e listas de fornecedores.', 'eleitorado', false),
        ('2026-09-04', 'Preenchimento de vagas remanescentes', 'Preenchimento de vagas remanescentes de candidaturas; divulgação de escrutinadores; instalação da Comissão Apuradora; planejamento de transporte; convocação de entidades fiscalizadoras.', 'administrativo', false),
        ('2026-09-09', 'Início do envio de prestação parcial de contas', 'Apresentação de certificado digital pelos candidatos; início do envio da prestação parcial de contas de campanha.', 'financiamento', false),
        ('2026-09-13', 'Prazo para prestação parcial de contas', 'Prazo final para envio da prestação parcial de contas de campanha.', 'financiamento', false),
        ('2026-09-14', 'Julgamento de registros e substituição de candidatos', 'Prazo para informar anulação de convenções, julgamento dos pedidos de registro de candidatura, substituição de candidatos, solicitação de transporte especial, informações sobre auditoria e lacração dos sistemas eleitorais.', 'candidatura', false),
        ('2026-09-19', 'Início da proibição de prisão de candidatos', 'Início da vedação à prisão de candidatos, exceto flagrante (até 06/10); requisição de servidores; divulgação de itinerários de propaganda volante.', 'administrativo', false),
        ('2026-09-24', 'Campanhas informativas ao eleitor', 'Início de campanhas informativas sobre o processo de votação; definição dos locais de testes das urnas.', 'urnas', false),
        ('2026-09-28', 'Prazo para registro de pesquisas eleitorais', 'Último prazo para registro de pesquisas de opinião que poderão ser divulgadas até a véspera da eleição.', 'pesquisas', false),
        ('2026-09-29', 'Proibição geral de prisão de eleitores', 'Início da vedação à prisão de eleitores, exceto flagrante; designação de horário/local de verificação das urnas; informação de fiscais no exterior.', 'administrativo', false),
        ('2026-10-01', 'Prazo final de campanha do 1º turno', 'Prazos finais para propaganda, comícios e debates do 1º turno; proibição de conteúdo gerado por IA sem identificação; emissão de salvo-conduto.', 'propaganda', true),
        ('2026-10-02', 'Restrição das Forças Armadas e propaganda em jornais', 'Confirmação do transporte especial de eleitores; prazo final para propaganda em jornais; restrição ao uso das Forças Armadas em fiscalização.', 'propaganda', false),
        ('2026-10-03', 'Véspera da eleição — 1º turno', 'Prazo final para atos de campanha; sorteio das urnas que passarão por auditoria; proibição de porte de armas.', 'votacao', true),
        ('2026-10-04', 'DIA DA ELEIÇÃO — 1º TURNO', 'Votação em todo o país. Funcionamento das Mesas de Justificativa Eleitoral para quem não votar no domicílio. Divulgação dos resultados a partir das 17h.', 'votacao', true),
        ('2026-10-05', 'Início da campanha do 2º turno', 'Início da prestação de contas do 1º turno e da campanha para os candidatos que disputarão o 2º turno; fim da restrição ao uso das Forças Armadas.', 'votacao', false),
        ('2026-10-06', 'Fim da proibição de prisão (1ª fase)', 'Encerramento da vedação à prisão de candidatos e eleitores relativa ao 1º turno.', 'administrativo', false),
        ('2026-10-07', 'Justificativa de abandono de trabalho', 'Prazo para o eleitor mesário/convocado justificar abandono de trabalho por motivo eleitoral.', 'administrativo', false),
        ('2026-10-09', 'Início da propaganda do 2º turno', 'Início da propaganda eleitoral para o 2º turno (até 23/10), onde houver.', 'propaganda', false),
        ('2026-10-15', 'Prazo para envio de notas fiscais', 'Prazo para envio de notas fiscais referentes a gastos de campanha do 1º turno.', 'financiamento', false),
        ('2026-10-20', 'Nova proibição de prisão (2º turno)', 'Início de nova vedação à prisão de candidatos e eleitores, relativa ao 2º turno (até 27/10).', 'administrativo', false),
        ('2026-10-24', 'Prazo final de campanha do 2º turno', 'Prazos finais para atos de campanha do 2º turno; proibição de porte de armas (até 26/10).', 'votacao', true),
        ('2026-10-25', 'DIA DA ELEIÇÃO — 2º TURNO', 'Votação em segundo turno onde aplicável. Divulgação oficial dos resultados a partir das 17h.', 'votacao', true),
        ('2026-10-27', 'Fim da proibição de prisão (2ª fase)', 'Encerramento da vedação à prisão relativa ao 2º turno.', 'administrativo', false),
        ('2026-11-03', 'Prazo final de prestação de contas do 1º turno', 'Prazo final para prestação de contas de campanha do 1º turno; justificativa de mesários; retomada do atendimento presencial nos cartórios eleitorais.', 'financiamento', false),
        ('2026-11-14', 'Prestação final de contas e devolução de sobras', 'Prazo para prestação final de contas de campanha e devolução de sobras de recursos não utilizados.', 'financiamento', false),
        ('2026-11-24', 'Justificativa de ausência no 2º turno', 'Prazo para o eleitor justificar ausência à votação do 2º turno.', 'administrativo', false),
        ('2026-12-03', 'Justificativa de ausência no 1º turno', 'Prazo para o eleitor justificar ausência à votação do 1º turno.', 'administrativo', false),
        ('2026-12-15', 'Decisões sobre prestação de contas', 'Publicação das decisões da Justiça Eleitoral sobre a prestação de contas de campanha.', 'financiamento', false),
        ('2026-12-18', 'DIPLOMAÇÃO DOS ELEITOS', 'Diplomação de presidente, vice-presidente, governadores, senadores e deputados federais, estaduais e distritais eleitos.', 'diplomacao', true),
        ('2026-12-31', 'Encerramento das contas de campanha', 'Prazo final para encerramento das contas bancárias de campanha; fim da vedação à concessão discricionária de benefícios sociais.', 'financiamento', false);
    END IF;
END $$;
