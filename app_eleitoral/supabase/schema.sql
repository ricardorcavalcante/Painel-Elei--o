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
-- key_result pode anexar evidência de campo; leitura é transparente)
CREATE POLICY "artefatos_select_auth" ON public.okr_artefatos FOR SELECT TO authenticated USING (true);
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
