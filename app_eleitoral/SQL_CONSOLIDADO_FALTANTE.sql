-- ============================================================
-- SQL CONSOLIDADO — roda as QUATRO migrations que faltam no projeto
-- jigvtywmlauhryvuysxj de uma vez só: Agenda Pública + Calendário
-- TSE; Quadrantes de Voluntários + Check-in Geolocalizado; a flag
-- de configuração usada pelo Painel do Coordenador; e a aprovação
-- de check-in fora de área. Ao final, também remove o dado de teste
-- (1 Coordenação + 1 quadrante "CEI-TESTE") antes da geração real
-- dos quadrantes por perímetro de RA.
--
-- NÃO precisa da senha do banco — só precisa estar logado no
-- dashboard do Supabase (supabase.com/dashboard/project/jigvtywmlauhryvuysxj)
-- e colar isto no SQL Editor. É idempotente (pode rodar mais de
-- uma vez sem erro), então não tem problema se travar no meio por
-- qualquer motivo (rede, etc.) — é só rodar de novo.
-- ============================================================

-- ============================================================
-- PARTE 1 — Agenda Pública do Candidato + Calendário Oficial TSE
-- ============================================================

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

ALTER TABLE public.agenda_eventos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prazos_eleitorais ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "agenda_public_read" ON public.agenda_eventos;
CREATE POLICY "agenda_public_read" ON public.agenda_eventos FOR SELECT TO anon, authenticated
    USING (status = 'confirmado');

DROP POLICY IF EXISTS "agenda_own_read" ON public.agenda_eventos;
CREATE POLICY "agenda_own_read" ON public.agenda_eventos FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR solicitado_por = auth.uid()
        OR (product_id IS NOT NULL AND public.is_member_of_product(product_id))
    );

DROP POLICY IF EXISTS "agenda_insert_admin" ON public.agenda_eventos;
CREATE POLICY "agenda_insert_admin" ON public.agenda_eventos FOR INSERT TO authenticated
    WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "agenda_insert_coordenador" ON public.agenda_eventos;
CREATE POLICY "agenda_insert_coordenador" ON public.agenda_eventos FOR INSERT TO authenticated
    WITH CHECK (
        tipo IN ('visita_solicitada', 'participacao_solicitada')
        AND status = 'pendente' AND solicitado_por = auth.uid()
        AND product_id IS NOT NULL AND public.is_member_of_product(product_id)
    );

DROP POLICY IF EXISTS "agenda_update_admin" ON public.agenda_eventos;
CREATE POLICY "agenda_update_admin" ON public.agenda_eventos FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "agenda_update_own_pending" ON public.agenda_eventos;
CREATE POLICY "agenda_update_own_pending" ON public.agenda_eventos FOR UPDATE TO authenticated
    USING (solicitado_por = auth.uid() AND status = 'pendente')
    WITH CHECK (solicitado_por = auth.uid() AND status = 'cancelado');

DROP POLICY IF EXISTS "agenda_delete_admin" ON public.agenda_eventos;
CREATE POLICY "agenda_delete_admin" ON public.agenda_eventos FOR DELETE TO authenticated
    USING (public.is_super_admin());

DROP POLICY IF EXISTS "prazos_eleitorais_public_read" ON public.prazos_eleitorais;
CREATE POLICY "prazos_eleitorais_public_read" ON public.prazos_eleitorais FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "prazos_eleitorais_write_admin" ON public.prazos_eleitorais;
CREATE POLICY "prazos_eleitorais_write_admin" ON public.prazos_eleitorais FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

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

-- ============================================================
-- PARTE 2 — Quadrantes de Voluntários (grade fixa) + Check-in
-- ============================================================

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

CREATE TABLE IF NOT EXISTS public.area_volunteers (
    area_id UUID NOT NULL REFERENCES public.areas(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    atribuido_por UUID REFERENCES public.profiles(id),
    atribuido_em TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (area_id, user_id)
);

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

ALTER TABLE public.okr_artefatos ADD COLUMN IF NOT EXISTS checkin_id UUID REFERENCES public.checkins(id) ON DELETE CASCADE;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'okr_artefatos_vinculo_chk') THEN
        ALTER TABLE public.okr_artefatos ADD CONSTRAINT okr_artefatos_vinculo_chk CHECK (key_result_id IS NOT NULL OR checkin_id IS NOT NULL);
    END IF;
END $$;

CREATE OR REPLACE FUNCTION public.is_member_of_area(p_area_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.area_volunteers
        WHERE area_id = p_area_id AND user_id = auth.uid()
    );
$$;

ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.area_volunteers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkins ENABLE ROW LEVEL SECURITY;

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

DROP POLICY IF EXISTS "artefatos_write_own_checkin" ON public.okr_artefatos;
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

DROP POLICY IF EXISTS "areas_select_auth" ON public.areas;
CREATE POLICY "areas_select_auth" ON public.areas FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "areas_write_admin" ON public.areas;
CREATE POLICY "areas_write_admin" ON public.areas FOR ALL TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

DROP POLICY IF EXISTS "area_volunteers_select_auth" ON public.area_volunteers;
CREATE POLICY "area_volunteers_select_auth" ON public.area_volunteers FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "area_volunteers_write_admin_or_product_member" ON public.area_volunteers;
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

DROP POLICY IF EXISTS "checkins_select_own_or_product_member" ON public.checkins;
CREATE POLICY "checkins_select_own_or_product_member" ON public.checkins FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.areas a WHERE a.id = checkins.area_id AND public.is_member_of_product(a.product_id))
    );
DROP POLICY IF EXISTS "checkins_insert_own_area" ON public.checkins;
CREATE POLICY "checkins_insert_own_area" ON public.checkins FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND public.is_member_of_area(area_id));
DROP POLICY IF EXISTS "checkins_write_admin" ON public.checkins;
CREATE POLICY "checkins_write_admin" ON public.checkins FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());
DROP POLICY IF EXISTS "checkins_delete_admin" ON public.checkins;
CREATE POLICY "checkins_delete_admin" ON public.checkins FOR DELETE TO authenticated
    USING (public.is_super_admin());

-- ============================================================
-- PARTE 3 — Painel do Coordenador (flag de comparativo entre regiões)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.app_settings (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id = TRUE),
    comparativo_regioes_liberado BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO public.app_settings (id) VALUES (TRUE) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "app_settings_select_auth" ON public.app_settings;
CREATE POLICY "app_settings_select_auth" ON public.app_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "app_settings_write_admin" ON public.app_settings;
CREATE POLICY "app_settings_write_admin" ON public.app_settings FOR UPDATE TO authenticated
    USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- ============================================================
-- PARTE 4 — Aprovação de Check-in fora de área
-- ============================================================

ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'pendente';
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'checkins_status_chk') THEN
        ALTER TABLE public.checkins ADD CONSTRAINT checkins_status_chk CHECK (status IN ('pendente', 'aprovado', 'rejeitado'));
    END IF;
END $$;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS resposta_aprovacao TEXT;

-- Check-ins já existentes (de antes desta coluna existir) não devem
-- ficar represados numa fila de aprovação que não existia quando
-- foram feitos: aplica retroativamente a mesma regra de nascença
-- (dentro_area = true → aprovado; fora → pendente, revisável dali pra frente).
UPDATE public.checkins SET status = CASE WHEN dentro_area THEN 'aprovado' ELSE 'pendente' END;

DROP POLICY IF EXISTS "checkins_update_coordenador" ON public.checkins;
CREATE POLICY "checkins_update_coordenador" ON public.checkins FOR UPDATE TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.areas a
            WHERE a.id = checkins.area_id AND public.is_member_of_product(a.product_id)
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.areas a
            WHERE a.id = checkins.area_id AND public.is_member_of_product(a.product_id)
        )
    );

-- ============================================================
-- PARTE 5 — Limpeza do dado de teste (1 Coordenação + 1 quadrante
-- "CEI-TESTE"), antes da geração real dos quadrantes por perímetro
-- de RA. Idempotente: se já não existir, os DELETE não fazem nada.
-- ============================================================

DELETE FROM public.checkins
    WHERE area_id IN (SELECT id FROM public.areas WHERE codigo = 'CEI-TESTE');
DELETE FROM public.area_volunteers
    WHERE area_id IN (SELECT id FROM public.areas WHERE codigo = 'CEI-TESTE');
DELETE FROM public.areas WHERE codigo = 'CEI-TESTE';
DELETE FROM public.product_team
    WHERE product_id IN (SELECT id FROM public.products WHERE nome = 'Coordenação de Teste — Ceilândia');
DELETE FROM public.products WHERE nome = 'Coordenação de Teste — Ceilândia';

-- ============================================================
-- PARTE 6 — Grupos nomeados de quadrantes (planejamento coordenador + candidato)
-- ============================================================

ALTER TABLE public.areas ADD COLUMN IF NOT EXISTS grupo_nome TEXT;

CREATE OR REPLACE FUNCTION public.is_coordenador_of_product(p_product_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.product_team
        WHERE product_id = p_product_id AND user_id = auth.uid() AND papel = 'coordenador'
    );
$$;

DROP POLICY IF EXISTS "areas_update_coordenador" ON public.areas;
CREATE POLICY "areas_update_coordenador" ON public.areas FOR UPDATE TO authenticated
    USING (public.is_coordenador_of_product(product_id))
    WITH CHECK (public.is_coordenador_of_product(product_id));
