-- ============================================================
-- SCHEMA SUPABASE: OKRS ELEITORAIS E GESTÃO DE EQUIPES (DF)
-- Suporte a Nível Estratégico, Tático e Operacional
-- Suporte a Múltiplos Coordenadores por RA / Zona Eleitoral
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Perfis de Usuário com Nível Hierárquico
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('estrategico', 'tatico', 'operacional')),
    avatar_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Tabela de Relacionamento N:M (Múltiplos Coordenadores Táticos por RA / Zona Eleitoral)
CREATE TABLE IF NOT EXISTS public.coordenadores_regiao (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    ra_nome TEXT NOT NULL,
    zona_id TEXT,
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_coordenador_regiao UNIQUE (user_id, ra_nome, zona_id)
);

-- 3. Objetivos Estratégicos (Nível Estratégico - Direção da Campanha)
CREATE TABLE IF NOT EXISTS public.okr_objectives (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title TEXT NOT NULL,
    description TEXT,
    target_year INTEGER DEFAULT 2026,
    progress NUMERIC(5, 2) DEFAULT 0.00,
    created_by UUID REFERENCES public.profiles(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Key Results (Nível Tático por Zona Eleitoral / RA)
CREATE TABLE IF NOT EXISTS public.okr_key_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    objective_id UUID NOT NULL REFERENCES public.okr_objectives(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    zona_id TEXT,
    ra_nome TEXT,
    target_value NUMERIC(12, 2) NOT NULL DEFAULT 100,
    current_value NUMERIC(12, 2) NOT NULL DEFAULT 0,
    unit TEXT DEFAULT 'unidades',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Vinculação de Key Results aos Coordenadores Responsáveis (Nível Tático)
CREATE TABLE IF NOT EXISTS public.okr_key_result_coordenadores (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_result_id UUID NOT NULL REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    CONSTRAINT unique_kr_coordenador UNIQUE (key_result_id, user_id)
);

-- 6. Equipe Operacional de Campo (Nível Operacional por RA / Zona)
CREATE TABLE IF NOT EXISTS public.okr_equipe_operacional (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    full_name TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    ra_nome TEXT NOT NULL,
    zona_id TEXT,
    coordenador_id UUID REFERENCES public.profiles(id),
    funcao TEXT DEFAULT 'Agente de Campo',
    ativo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Artefatos e Entregáveis Digitalizados (Nível Tático / Operacional)
CREATE TABLE IF NOT EXISTS public.okr_artefatos (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key_result_id UUID REFERENCES public.okr_key_results(id) ON DELETE CASCADE,
    titulo TEXT NOT NULL,
    descricao TEXT,
    arquivo_url TEXT NOT NULL,
    tipo_artefato TEXT CHECK (tipo_artefato IN ('foto', 'comprovante', 'lista_presenca', 'relatorio', 'outro')),
    enviado_por UUID REFERENCES public.profiles(id),
    status TEXT DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'rejeitado')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================================
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coordenadores_regiao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_objectives ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_key_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_equipe_operacional ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.okr_artefatos ENABLE ROW LEVEL SECURITY;

-- Políticas de leitura pública (leitura autenticada para o painel)
CREATE POLICY "Permitir leitura para usuários autenticados" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Permitir leitura de coordenadores" ON public.coordenadores_regiao FOR SELECT USING (true);
CREATE POLICY "Permitir leitura de objetivos" ON public.okr_objectives FOR SELECT USING (true);
CREATE POLICY "Permitir leitura de key_results" ON public.okr_key_results FOR SELECT USING (true);
CREATE POLICY "Permitir leitura de equipe operacional" ON public.okr_equipe_operacional FOR SELECT USING (true);
CREATE POLICY "Permitir leitura de artefatos" ON public.okr_artefatos FOR SELECT USING (true);
