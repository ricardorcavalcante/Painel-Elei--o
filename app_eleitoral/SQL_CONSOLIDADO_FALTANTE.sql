-- ============================================================
-- SQL CONSOLIDADO — roda de uma vez só tudo que falta no projeto
-- jigvtywmlauhryvuysxj: Agenda Pública + Calendário TSE; Quadrantes
-- de Voluntários + Check-in Geolocalizado; a flag de configuração
-- usada pelo Painel do Coordenador; a aprovação de check-in fora de
-- área; grupos nomeados de quadrantes; a geração real dos quadrantes
-- das 37 RAs oficiais do DF, recortados por mancha urbana e área
-- rural (Parte 7) — inclusive regenerando os de teste da Ceilândia
-- com a máscara nova; e, por fim (Parte 8), status por perímetro
-- (grade operacional do Painel do Coordenador) com histórico
-- auditável e link de compartilhamento somente-leitura sem login.
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

-- ============================================================
-- PARTE 7 — Quadrantes de voluntários recortados por mancha urbana e
-- área rural (37 RAs oficiais do DF). Gerado por
-- scripts/gerar-rollout-quadrantes.mjs a partir de:
--   public/regioes_administrativas.geojson (limites oficiais das 37 RAs)
--   public/perimetro_urbano.geojson (mancha urbana, união de "Evolução
--     das Ocupações", GeoPortal/SEDUH)
--   public/area_rural_assentamentos.geojson (proxy de área rural —
--     Assentamentos Rurais, GeoPortal/SEDUH; a camada oficial de
--     Concessão ETR exige token e não é acessível via script)
--   public/locais_pontos.json (zona eleitoral de cada RA, por junção
--     espacial com os pontos de votação reais)
--
-- Idempotente: get-or-create de Coordenação Regional por ra_nome +
-- apaga e regenera os quadrantes de cada RA (inclusive os de teste da
-- Ceilândia gerados manualmente antes desta Parte 7 existir).
-- ============================================================

-- ------------------------------------------------------------
-- CEILÂNDIA (CEI) — 157 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'CEILÂNDIA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — CEILÂNDIA', 'CEILÂNDIA', '3, 8, 16, 20')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('CEI-01', 'Quadrante 1', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.856801, -15.852310, -48.187844, -48.183175),
        ('CEI-02', 'Quadrante 2', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.856801, -15.852310, -48.122480, -48.117811),
        ('CEI-03', 'Quadrante 3', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.852310, -15.847818, -48.122480, -48.117811),
        ('CEI-04', 'Quadrante 4', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.852310, -15.847818, -48.117811, -48.113142),
        ('CEI-05', 'Quadrante 5', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.852310, -15.847818, -48.113142, -48.108474),
        ('CEI-06', 'Quadrante 6', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.847818, -15.843327, -48.127149, -48.122480),
        ('CEI-07', 'Quadrante 7', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.847818, -15.843327, -48.122480, -48.117811),
        ('CEI-08', 'Quadrante 8', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.847818, -15.843327, -48.117811, -48.113142),
        ('CEI-09', 'Quadrante 9', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.847818, -15.843327, -48.113142, -48.108474),
        ('CEI-10', 'Quadrante 10', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.847818, -15.843327, -48.108474, -48.103805),
        ('CEI-11', 'Quadrante 11', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.847818, -15.843327, -48.103805, -48.099136),
        ('CEI-12', 'Quadrante 12', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.131818, -48.127149),
        ('CEI-13', 'Quadrante 13', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.127149, -48.122480),
        ('CEI-14', 'Quadrante 14', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.122480, -48.117811),
        ('CEI-15', 'Quadrante 15', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.117811, -48.113142),
        ('CEI-16', 'Quadrante 16', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.113142, -48.108474),
        ('CEI-17', 'Quadrante 17', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.108474, -48.103805),
        ('CEI-18', 'Quadrante 18', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.843327, -15.838835, -48.103805, -48.099136),
        ('CEI-19', 'Quadrante 19', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.838835, -15.834344, -48.117811, -48.113142),
        ('CEI-20', 'Quadrante 20', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.838835, -15.834344, -48.113142, -48.108474),
        ('CEI-21', 'Quadrante 21', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.838835, -15.834344, -48.108474, -48.103805),
        ('CEI-22', 'Quadrante 22', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.838835, -15.834344, -48.103805, -48.099136),
        ('CEI-23', 'Quadrante 23', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.838835, -15.834344, -48.099136, -48.094467),
        ('CEI-24', 'Quadrante 24', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.838835, -15.834344, -48.094467, -48.089798),
        ('CEI-25', 'Quadrante 25', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.834344, -15.829852, -48.113142, -48.108474),
        ('CEI-26', 'Quadrante 26', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.834344, -15.829852, -48.108474, -48.103805),
        ('CEI-27', 'Quadrante 27', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.834344, -15.829852, -48.103805, -48.099136),
        ('CEI-28', 'Quadrante 28', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.834344, -15.829852, -48.099136, -48.094467),
        ('CEI-29', 'Quadrante 29', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.834344, -15.829852, -48.094467, -48.089798),
        ('CEI-30', 'Quadrante 30', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.122480, -48.117811),
        ('CEI-31', 'Quadrante 31', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.117811, -48.113142),
        ('CEI-32', 'Quadrante 32', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.113142, -48.108474),
        ('CEI-33', 'Quadrante 33', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.108474, -48.103805),
        ('CEI-34', 'Quadrante 34', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.103805, -48.099136),
        ('CEI-35', 'Quadrante 35', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.099136, -48.094467),
        ('CEI-36', 'Quadrante 36', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.829852, -15.825360, -48.094467, -48.089798),
        ('CEI-37', 'Quadrante 37', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.127149, -48.122480),
        ('CEI-38', 'Quadrante 38', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.122480, -48.117811),
        ('CEI-39', 'Quadrante 39', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.117811, -48.113142),
        ('CEI-40', 'Quadrante 40', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.113142, -48.108474),
        ('CEI-41', 'Quadrante 41', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.108474, -48.103805),
        ('CEI-42', 'Quadrante 42', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.103805, -48.099136),
        ('CEI-43', 'Quadrante 43', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.825360, -15.820869, -48.099136, -48.094467),
        ('CEI-44', 'Quadrante 44', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.220526, -48.215857),
        ('CEI-45', 'Quadrante 45', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.215857, -48.211188),
        ('CEI-46', 'Quadrante 46', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.131818, -48.127149),
        ('CEI-47', 'Quadrante 47', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.127149, -48.122480),
        ('CEI-48', 'Quadrante 48', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.122480, -48.117811),
        ('CEI-49', 'Quadrante 49', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.117811, -48.113142),
        ('CEI-50', 'Quadrante 50', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.113142, -48.108474),
        ('CEI-51', 'Quadrante 51', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.108474, -48.103805),
        ('CEI-52', 'Quadrante 52', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.103805, -48.099136),
        ('CEI-53', 'Quadrante 53', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.820869, -15.816377, -48.099136, -48.094467),
        ('CEI-54', 'Quadrante 54', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.215857, -48.211188),
        ('CEI-55', 'Quadrante 55', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.211188, -48.206519),
        ('CEI-56', 'Quadrante 56', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.206519, -48.201850),
        ('CEI-57', 'Quadrante 57', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.136487, -48.131818),
        ('CEI-58', 'Quadrante 58', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.131818, -48.127149),
        ('CEI-59', 'Quadrante 59', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.127149, -48.122480),
        ('CEI-60', 'Quadrante 60', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.122480, -48.117811),
        ('CEI-61', 'Quadrante 61', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.117811, -48.113142),
        ('CEI-62', 'Quadrante 62', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.113142, -48.108474),
        ('CEI-63', 'Quadrante 63', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.108474, -48.103805),
        ('CEI-64', 'Quadrante 64', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.103805, -48.099136),
        ('CEI-65', 'Quadrante 65', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.816377, -15.811886, -48.099136, -48.094467),
        ('CEI-66', 'Quadrante 66', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.220526, -48.215857),
        ('CEI-67', 'Quadrante 67', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.215857, -48.211188),
        ('CEI-68', 'Quadrante 68', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.211188, -48.206519),
        ('CEI-69', 'Quadrante 69', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.206519, -48.201850),
        ('CEI-70', 'Quadrante 70', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.141155, -48.136487),
        ('CEI-71', 'Quadrante 71', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.136487, -48.131818),
        ('CEI-72', 'Quadrante 72', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.131818, -48.127149),
        ('CEI-73', 'Quadrante 73', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.127149, -48.122480),
        ('CEI-74', 'Quadrante 74', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.122480, -48.117811),
        ('CEI-75', 'Quadrante 75', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.117811, -48.113142),
        ('CEI-76', 'Quadrante 76', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.113142, -48.108474),
        ('CEI-77', 'Quadrante 77', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.108474, -48.103805),
        ('CEI-78', 'Quadrante 78', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.811886, -15.807394, -48.103805, -48.099136),
        ('CEI-79', 'Quadrante 79', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.220526, -48.215857),
        ('CEI-80', 'Quadrante 80', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.215857, -48.211188),
        ('CEI-81', 'Quadrante 81', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.211188, -48.206519),
        ('CEI-82', 'Quadrante 82', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.206519, -48.201850),
        ('CEI-83', 'Quadrante 83', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.159831, -48.155162),
        ('CEI-84', 'Quadrante 84', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.155162, -48.150493),
        ('CEI-85', 'Quadrante 85', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.150493, -48.145824),
        ('CEI-86', 'Quadrante 86', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.145824, -48.141155),
        ('CEI-87', 'Quadrante 87', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.141155, -48.136487),
        ('CEI-88', 'Quadrante 88', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.136487, -48.131818),
        ('CEI-89', 'Quadrante 89', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.131818, -48.127149),
        ('CEI-90', 'Quadrante 90', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.127149, -48.122480),
        ('CEI-91', 'Quadrante 91', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.122480, -48.117811),
        ('CEI-92', 'Quadrante 92', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.117811, -48.113142),
        ('CEI-93', 'Quadrante 93', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.113142, -48.108474),
        ('CEI-94', 'Quadrante 94', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.807394, -15.802903, -48.108474, -48.103805),
        ('CEI-95', 'Quadrante 95', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.220526, -48.215857),
        ('CEI-96', 'Quadrante 96', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.215857, -48.211188),
        ('CEI-97', 'Quadrante 97', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.211188, -48.206519),
        ('CEI-98', 'Quadrante 98', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.206519, -48.201850),
        ('CEI-99', 'Quadrante 99', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.201850, -48.197182),
        ('CEI-100', 'Quadrante 100', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.159831, -48.155162),
        ('CEI-101', 'Quadrante 101', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.155162, -48.150493),
        ('CEI-102', 'Quadrante 102', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.150493, -48.145824),
        ('CEI-103', 'Quadrante 103', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.145824, -48.141155),
        ('CEI-104', 'Quadrante 104', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.141155, -48.136487),
        ('CEI-105', 'Quadrante 105', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.136487, -48.131818),
        ('CEI-106', 'Quadrante 106', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.131818, -48.127149),
        ('CEI-107', 'Quadrante 107', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.127149, -48.122480),
        ('CEI-108', 'Quadrante 108', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.122480, -48.117811),
        ('CEI-109', 'Quadrante 109', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.117811, -48.113142),
        ('CEI-110', 'Quadrante 110', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.113142, -48.108474),
        ('CEI-111', 'Quadrante 111', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.802903, -15.798411, -48.108474, -48.103805),
        ('CEI-112', 'Quadrante 112', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.220526, -48.215857),
        ('CEI-113', 'Quadrante 113', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.215857, -48.211188),
        ('CEI-114', 'Quadrante 114', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.211188, -48.206519),
        ('CEI-115', 'Quadrante 115', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.206519, -48.201850),
        ('CEI-116', 'Quadrante 116', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.201850, -48.197182),
        ('CEI-117', 'Quadrante 117', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.164500, -48.159831),
        ('CEI-118', 'Quadrante 118', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.150493, -48.145824),
        ('CEI-119', 'Quadrante 119', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.145824, -48.141155),
        ('CEI-120', 'Quadrante 120', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.141155, -48.136487),
        ('CEI-121', 'Quadrante 121', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.136487, -48.131818),
        ('CEI-122', 'Quadrante 122', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.131818, -48.127149),
        ('CEI-123', 'Quadrante 123', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.127149, -48.122480),
        ('CEI-124', 'Quadrante 124', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.122480, -48.117811),
        ('CEI-125', 'Quadrante 125', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.798411, -15.793920, -48.117811, -48.113142),
        ('CEI-126', 'Quadrante 126', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.220526, -48.215857),
        ('CEI-127', 'Quadrante 127', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.215857, -48.211188),
        ('CEI-128', 'Quadrante 128', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.211188, -48.206519),
        ('CEI-129', 'Quadrante 129', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.206519, -48.201850),
        ('CEI-130', 'Quadrante 130', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.201850, -48.197182),
        ('CEI-131', 'Quadrante 131', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.155162, -48.150493),
        ('CEI-132', 'Quadrante 132', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.150493, -48.145824),
        ('CEI-133', 'Quadrante 133', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.145824, -48.141155),
        ('CEI-134', 'Quadrante 134', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.141155, -48.136487),
        ('CEI-135', 'Quadrante 135', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.136487, -48.131818),
        ('CEI-136', 'Quadrante 136', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.131818, -48.127149),
        ('CEI-137', 'Quadrante 137', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.127149, -48.122480),
        ('CEI-138', 'Quadrante 138', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.122480, -48.117811),
        ('CEI-139', 'Quadrante 139', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.117811, -48.113142),
        ('CEI-140', 'Quadrante 140', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.793920, -15.789428, -48.113142, -48.108474),
        ('CEI-141', 'Quadrante 141', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.220526, -48.215857),
        ('CEI-142', 'Quadrante 142', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.215857, -48.211188),
        ('CEI-143', 'Quadrante 143', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.211188, -48.206519),
        ('CEI-144', 'Quadrante 144', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.141155, -48.136487),
        ('CEI-145', 'Quadrante 145', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.136487, -48.131818),
        ('CEI-146', 'Quadrante 146', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.131818, -48.127149),
        ('CEI-147', 'Quadrante 147', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.127149, -48.122480),
        ('CEI-148', 'Quadrante 148', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.789428, -15.784936, -48.122480, -48.117811),
        ('CEI-149', 'Quadrante 149', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.784936, -15.780445, -48.183175, -48.178506),
        ('CEI-150', 'Quadrante 150', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.784936, -15.780445, -48.178506, -48.173837),
        ('CEI-151', 'Quadrante 151', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.784936, -15.780445, -48.141155, -48.136487),
        ('CEI-152', 'Quadrante 152', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.780445, -15.775953, -48.183175, -48.178506),
        ('CEI-153', 'Quadrante 153', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.780445, -15.775953, -48.178506, -48.173837),
        ('CEI-154', 'Quadrante 154', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.780445, -15.775953, -48.173837, -48.169169),
        ('CEI-155', 'Quadrante 155', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.780445, -15.775953, -48.117811, -48.113142),
        ('CEI-156', 'Quadrante 156', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.775953, -15.771462, -48.127149, -48.122480),
        ('CEI-157', 'Quadrante 157', v_product_id, 'CEILÂNDIA', '3, 8, 16, 20', -15.775953, -15.771462, -48.122480, -48.117811);
END $$;

-- ------------------------------------------------------------
-- SOL NASCENTE/PÔR DO SOL (SNPD) — 34 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SOL NASCENTE/PÔR DO SOL' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SOL NASCENTE/PÔR DO SOL', 'SOL NASCENTE/PÔR DO SOL', '16, 20')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SNPD-01', 'Quadrante 1', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.858663, -15.854172, -48.120965, -48.116296),
        ('SNPD-02', 'Quadrante 2', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.858663, -15.854172, -48.116296, -48.111627),
        ('SNPD-03', 'Quadrante 3', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.854172, -15.849680, -48.125633, -48.120965),
        ('SNPD-04', 'Quadrante 4', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.854172, -15.849680, -48.116296, -48.111627),
        ('SNPD-05', 'Quadrante 5', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.845189, -15.840697, -48.134970, -48.130302),
        ('SNPD-06', 'Quadrante 6', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.840697, -15.836205, -48.139639, -48.134970),
        ('SNPD-07', 'Quadrante 7', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.840697, -15.836205, -48.130302, -48.125633),
        ('SNPD-08', 'Quadrante 8', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.836205, -15.831714, -48.153645, -48.148976),
        ('SNPD-09', 'Quadrante 9', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.836205, -15.831714, -48.139639, -48.134970),
        ('SNPD-10', 'Quadrante 10', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.836205, -15.831714, -48.130302, -48.125633),
        ('SNPD-11', 'Quadrante 11', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.836205, -15.831714, -48.120965, -48.116296),
        ('SNPD-12', 'Quadrante 12', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.831714, -15.827222, -48.144308, -48.139639),
        ('SNPD-13', 'Quadrante 13', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.831714, -15.827222, -48.139639, -48.134970),
        ('SNPD-14', 'Quadrante 14', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.831714, -15.827222, -48.134970, -48.130302),
        ('SNPD-15', 'Quadrante 15', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.831714, -15.827222, -48.125633, -48.120965),
        ('SNPD-16', 'Quadrante 16', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.831714, -15.827222, -48.120965, -48.116296),
        ('SNPD-17', 'Quadrante 17', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.827222, -15.822731, -48.158314, -48.153645),
        ('SNPD-18', 'Quadrante 18', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.827222, -15.822731, -48.144308, -48.139639),
        ('SNPD-19', 'Quadrante 19', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.827222, -15.822731, -48.139639, -48.134970),
        ('SNPD-20', 'Quadrante 20', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.827222, -15.822731, -48.134970, -48.130302),
        ('SNPD-21', 'Quadrante 21', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.827222, -15.822731, -48.130302, -48.125633),
        ('SNPD-22', 'Quadrante 22', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.822731, -15.818239, -48.158314, -48.153645),
        ('SNPD-23', 'Quadrante 23', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.822731, -15.818239, -48.153645, -48.148976),
        ('SNPD-24', 'Quadrante 24', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.822731, -15.818239, -48.148976, -48.144308),
        ('SNPD-25', 'Quadrante 25', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.822731, -15.818239, -48.144308, -48.139639),
        ('SNPD-26', 'Quadrante 26', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.822731, -15.818239, -48.134970, -48.130302),
        ('SNPD-27', 'Quadrante 27', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.818239, -15.813748, -48.158314, -48.153645),
        ('SNPD-28', 'Quadrante 28', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.818239, -15.813748, -48.153645, -48.148976),
        ('SNPD-29', 'Quadrante 29', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.818239, -15.813748, -48.148976, -48.144308),
        ('SNPD-30', 'Quadrante 30', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.813748, -15.809256, -48.158314, -48.153645),
        ('SNPD-31', 'Quadrante 31', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.813748, -15.809256, -48.153645, -48.148976),
        ('SNPD-32', 'Quadrante 32', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.813748, -15.809256, -48.148976, -48.144308),
        ('SNPD-33', 'Quadrante 33', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.813748, -15.809256, -48.144308, -48.139639),
        ('SNPD-34', 'Quadrante 34', v_product_id, 'SOL NASCENTE/PÔR DO SOL', '16, 20', -15.813748, -15.809256, -48.139639, -48.134970);
END $$;

-- ------------------------------------------------------------
-- SIA (SIA) — 55 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SIA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SIA', 'SIA', '11')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SIA-01', 'Quadrante 1', v_product_id, 'SIA', '11', -15.810153, -15.805661, -47.964105, -47.959438),
        ('SIA-02', 'Quadrante 2', v_product_id, 'SIA', '11', -15.810153, -15.805661, -47.959438, -47.954771),
        ('SIA-03', 'Quadrante 3', v_product_id, 'SIA', '11', -15.810153, -15.805661, -47.954771, -47.950103),
        ('SIA-04', 'Quadrante 4', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.992109, -47.987442),
        ('SIA-05', 'Quadrante 5', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.973440, -47.968773),
        ('SIA-06', 'Quadrante 6', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.968773, -47.964105),
        ('SIA-07', 'Quadrante 7', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.964105, -47.959438),
        ('SIA-08', 'Quadrante 8', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.959438, -47.954771),
        ('SIA-09', 'Quadrante 9', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.954771, -47.950103),
        ('SIA-10', 'Quadrante 10', v_product_id, 'SIA', '11', -15.805661, -15.801170, -47.950103, -47.945436),
        ('SIA-11', 'Quadrante 11', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.992109, -47.987442),
        ('SIA-12', 'Quadrante 12', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.987442, -47.982775),
        ('SIA-13', 'Quadrante 13', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.982775, -47.978107),
        ('SIA-14', 'Quadrante 14', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.978107, -47.973440),
        ('SIA-15', 'Quadrante 15', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.973440, -47.968773),
        ('SIA-16', 'Quadrante 16', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.968773, -47.964105),
        ('SIA-17', 'Quadrante 17', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.964105, -47.959438),
        ('SIA-18', 'Quadrante 18', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.959438, -47.954771),
        ('SIA-19', 'Quadrante 19', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.954771, -47.950103),
        ('SIA-20', 'Quadrante 20', v_product_id, 'SIA', '11', -15.801170, -15.796678, -47.950103, -47.945436),
        ('SIA-21', 'Quadrante 21', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.992109, -47.987442),
        ('SIA-22', 'Quadrante 22', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.987442, -47.982775),
        ('SIA-23', 'Quadrante 23', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.982775, -47.978107),
        ('SIA-24', 'Quadrante 24', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.978107, -47.973440),
        ('SIA-25', 'Quadrante 25', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.959438, -47.954771),
        ('SIA-26', 'Quadrante 26', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.954771, -47.950103),
        ('SIA-27', 'Quadrante 27', v_product_id, 'SIA', '11', -15.796678, -15.792186, -47.950103, -47.945436),
        ('SIA-28', 'Quadrante 28', v_product_id, 'SIA', '11', -15.792186, -15.787695, -47.992109, -47.987442),
        ('SIA-29', 'Quadrante 29', v_product_id, 'SIA', '11', -15.792186, -15.787695, -47.987442, -47.982775),
        ('SIA-30', 'Quadrante 30', v_product_id, 'SIA', '11', -15.792186, -15.787695, -47.950103, -47.945436),
        ('SIA-31', 'Quadrante 31', v_product_id, 'SIA', '11', -15.792186, -15.787695, -47.945436, -47.940769),
        ('SIA-32', 'Quadrante 32', v_product_id, 'SIA', '11', -15.778712, -15.774220, -47.940769, -47.936101),
        ('SIA-33', 'Quadrante 33', v_product_id, 'SIA', '11', -15.769729, -15.765237, -47.954771, -47.950103),
        ('SIA-34', 'Quadrante 34', v_product_id, 'SIA', '11', -15.769729, -15.765237, -47.940769, -47.936101),
        ('SIA-35', 'Quadrante 35', v_product_id, 'SIA', '11', -15.765237, -15.760746, -47.968773, -47.964105),
        ('SIA-36', 'Quadrante 36', v_product_id, 'SIA', '11', -15.765237, -15.760746, -47.964105, -47.959438),
        ('SIA-37', 'Quadrante 37', v_product_id, 'SIA', '11', -15.765237, -15.760746, -47.959438, -47.954771),
        ('SIA-38', 'Quadrante 38', v_product_id, 'SIA', '11', -15.765237, -15.760746, -47.954771, -47.950103),
        ('SIA-39', 'Quadrante 39', v_product_id, 'SIA', '11', -15.765237, -15.760746, -47.940769, -47.936101),
        ('SIA-40', 'Quadrante 40', v_product_id, 'SIA', '11', -15.765237, -15.760746, -47.936101, -47.931434),
        ('SIA-41', 'Quadrante 41', v_product_id, 'SIA', '11', -15.760746, -15.756254, -47.964105, -47.959438),
        ('SIA-42', 'Quadrante 42', v_product_id, 'SIA', '11', -15.760746, -15.756254, -47.959438, -47.954771),
        ('SIA-43', 'Quadrante 43', v_product_id, 'SIA', '11', -15.760746, -15.756254, -47.936101, -47.931434),
        ('SIA-44', 'Quadrante 44', v_product_id, 'SIA', '11', -15.760746, -15.756254, -47.931434, -47.926767),
        ('SIA-45', 'Quadrante 45', v_product_id, 'SIA', '11', -15.756254, -15.751762, -47.968773, -47.964105),
        ('SIA-46', 'Quadrante 46', v_product_id, 'SIA', '11', -15.756254, -15.751762, -47.964105, -47.959438),
        ('SIA-47', 'Quadrante 47', v_product_id, 'SIA', '11', -15.756254, -15.751762, -47.959438, -47.954771),
        ('SIA-48', 'Quadrante 48', v_product_id, 'SIA', '11', -15.756254, -15.751762, -47.936101, -47.931434),
        ('SIA-49', 'Quadrante 49', v_product_id, 'SIA', '11', -15.756254, -15.751762, -47.931434, -47.926767),
        ('SIA-50', 'Quadrante 50', v_product_id, 'SIA', '11', -15.751762, -15.747271, -47.936101, -47.931434),
        ('SIA-51', 'Quadrante 51', v_product_id, 'SIA', '11', -15.751762, -15.747271, -47.931434, -47.926767),
        ('SIA-52', 'Quadrante 52', v_product_id, 'SIA', '11', -15.751762, -15.747271, -47.926767, -47.922099),
        ('SIA-53', 'Quadrante 53', v_product_id, 'SIA', '11', -15.747271, -15.742779, -47.931434, -47.926767),
        ('SIA-54', 'Quadrante 54', v_product_id, 'SIA', '11', -15.747271, -15.742779, -47.926767, -47.922099),
        ('SIA-55', 'Quadrante 55', v_product_id, 'SIA', '11', -15.742779, -15.739968, -47.931434, -47.926767);
END $$;

-- ------------------------------------------------------------
-- CANDANGOLÂNDIA (CAN) — 12 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'CANDANGOLÂNDIA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — CANDANGOLÂNDIA', 'CANDANGOLÂNDIA', '10')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('CAN-01', 'Quadrante 1', v_product_id, 'CANDANGOLÂNDIA', '10', -15.861077, -15.856585, -47.954074, -47.949405),
        ('CAN-02', 'Quadrante 2', v_product_id, 'CANDANGOLÂNDIA', '10', -15.856585, -15.852094, -47.954074, -47.949405),
        ('CAN-03', 'Quadrante 3', v_product_id, 'CANDANGOLÂNDIA', '10', -15.856585, -15.852094, -47.949405, -47.944736),
        ('CAN-04', 'Quadrante 4', v_product_id, 'CANDANGOLÂNDIA', '10', -15.852094, -15.847602, -47.954074, -47.949405),
        ('CAN-05', 'Quadrante 5', v_product_id, 'CANDANGOLÂNDIA', '10', -15.852094, -15.847602, -47.949405, -47.944736),
        ('CAN-06', 'Quadrante 6', v_product_id, 'CANDANGOLÂNDIA', '10', -15.852094, -15.847602, -47.944736, -47.940067),
        ('CAN-07', 'Quadrante 7', v_product_id, 'CANDANGOLÂNDIA', '10', -15.852094, -15.847602, -47.940067, -47.935397),
        ('CAN-08', 'Quadrante 8', v_product_id, 'CANDANGOLÂNDIA', '10', -15.852094, -15.847602, -47.935397, -47.931483),
        ('CAN-09', 'Quadrante 9', v_product_id, 'CANDANGOLÂNDIA', '10', -15.847602, -15.843110, -47.949405, -47.944736),
        ('CAN-10', 'Quadrante 10', v_product_id, 'CANDANGOLÂNDIA', '10', -15.847602, -15.843110, -47.944736, -47.940067),
        ('CAN-11', 'Quadrante 11', v_product_id, 'CANDANGOLÂNDIA', '10', -15.847602, -15.843110, -47.940067, -47.935397),
        ('CAN-12', 'Quadrante 12', v_product_id, 'CANDANGOLÂNDIA', '10', -15.847602, -15.843110, -47.935397, -47.931483);
END $$;

-- ------------------------------------------------------------
-- RIACHO FUNDO II (RFI) — 20 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'RIACHO FUNDO II' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — RIACHO FUNDO II', 'RIACHO FUNDO II', '10')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('RFI-01', 'Quadrante 1', v_product_id, 'RIACHO FUNDO II', '10', -15.961652, -15.957161, -48.027644, -48.022973),
        ('RFI-02', 'Quadrante 2', v_product_id, 'RIACHO FUNDO II', '10', -15.948177, -15.943686, -48.036985, -48.032314),
        ('RFI-03', 'Quadrante 3', v_product_id, 'RIACHO FUNDO II', '10', -15.939194, -15.934703, -48.041656, -48.036985),
        ('RFI-04', 'Quadrante 4', v_product_id, 'RIACHO FUNDO II', '10', -15.925720, -15.921228, -48.046326, -48.041656),
        ('RFI-05', 'Quadrante 5', v_product_id, 'RIACHO FUNDO II', '10', -15.916737, -15.912245, -48.050997, -48.046326),
        ('RFI-06', 'Quadrante 6', v_product_id, 'RIACHO FUNDO II', '10', -15.912245, -15.907753, -48.050997, -48.046326),
        ('RFI-07', 'Quadrante 7', v_product_id, 'RIACHO FUNDO II', '10', -15.907753, -15.903262, -48.050997, -48.046326),
        ('RFI-08', 'Quadrante 8', v_product_id, 'RIACHO FUNDO II', '10', -15.907753, -15.903262, -48.046326, -48.041656),
        ('RFI-09', 'Quadrante 9', v_product_id, 'RIACHO FUNDO II', '10', -15.903262, -15.898770, -48.055668, -48.050997),
        ('RFI-10', 'Quadrante 10', v_product_id, 'RIACHO FUNDO II', '10', -15.903262, -15.898770, -48.050997, -48.046326),
        ('RFI-11', 'Quadrante 11', v_product_id, 'RIACHO FUNDO II', '10', -15.903262, -15.898770, -48.046326, -48.041656),
        ('RFI-12', 'Quadrante 12', v_product_id, 'RIACHO FUNDO II', '10', -15.903262, -15.898770, -48.041656, -48.036985),
        ('RFI-13', 'Quadrante 13', v_product_id, 'RIACHO FUNDO II', '10', -15.903262, -15.898770, -48.036985, -48.032314),
        ('RFI-14', 'Quadrante 14', v_product_id, 'RIACHO FUNDO II', '10', -15.903262, -15.898770, -48.032314, -48.027644),
        ('RFI-15', 'Quadrante 15', v_product_id, 'RIACHO FUNDO II', '10', -15.898770, -15.894279, -48.055668, -48.050997),
        ('RFI-16', 'Quadrante 16', v_product_id, 'RIACHO FUNDO II', '10', -15.898770, -15.894279, -48.050997, -48.046326),
        ('RFI-17', 'Quadrante 17', v_product_id, 'RIACHO FUNDO II', '10', -15.898770, -15.894279, -48.046326, -48.041656),
        ('RFI-18', 'Quadrante 18', v_product_id, 'RIACHO FUNDO II', '10', -15.898770, -15.894279, -48.041656, -48.036985),
        ('RFI-19', 'Quadrante 19', v_product_id, 'RIACHO FUNDO II', '10', -15.894279, -15.889787, -48.055668, -48.050997),
        ('RFI-20', 'Quadrante 20', v_product_id, 'RIACHO FUNDO II', '10', -15.894279, -15.889787, -48.046326, -48.041656);
END $$;

-- ------------------------------------------------------------
-- PARK WAY (PW) — 194 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'PARK WAY' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — PARK WAY', 'PARK WAY', '10')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('PW-01', 'Quadrante 1', v_product_id, 'PARK WAY', '10', -15.952510, -15.948018, -47.978692, -47.974022),
        ('PW-02', 'Quadrante 2', v_product_id, 'PARK WAY', '10', -15.952510, -15.948018, -47.974022, -47.969351),
        ('PW-03', 'Quadrante 3', v_product_id, 'PARK WAY', '10', -15.948018, -15.943526, -47.988032, -47.983362),
        ('PW-04', 'Quadrante 4', v_product_id, 'PARK WAY', '10', -15.948018, -15.943526, -47.983362, -47.978692),
        ('PW-05', 'Quadrante 5', v_product_id, 'PARK WAY', '10', -15.948018, -15.943526, -47.978692, -47.974022),
        ('PW-06', 'Quadrante 6', v_product_id, 'PARK WAY', '10', -15.948018, -15.943526, -47.974022, -47.969351),
        ('PW-07', 'Quadrante 7', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.992703, -47.988032),
        ('PW-08', 'Quadrante 8', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.988032, -47.983362),
        ('PW-09', 'Quadrante 9', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.983362, -47.978692),
        ('PW-10', 'Quadrante 10', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.978692, -47.974022),
        ('PW-11', 'Quadrante 11', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.974022, -47.969351),
        ('PW-12', 'Quadrante 12', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.969351, -47.964681),
        ('PW-13', 'Quadrante 13', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.964681, -47.960011),
        ('PW-14', 'Quadrante 14', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.960011, -47.955341),
        ('PW-15', 'Quadrante 15', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.955341, -47.950670),
        ('PW-16', 'Quadrante 16', v_product_id, 'PARK WAY', '10', -15.943526, -15.939035, -47.950670, -47.946000),
        ('PW-17', 'Quadrante 17', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.988032, -47.983362),
        ('PW-18', 'Quadrante 18', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.983362, -47.978692),
        ('PW-19', 'Quadrante 19', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.978692, -47.974022),
        ('PW-20', 'Quadrante 20', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.974022, -47.969351),
        ('PW-21', 'Quadrante 21', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.969351, -47.964681),
        ('PW-22', 'Quadrante 22', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.964681, -47.960011),
        ('PW-23', 'Quadrante 23', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.960011, -47.955341),
        ('PW-24', 'Quadrante 24', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.955341, -47.950670),
        ('PW-25', 'Quadrante 25', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.950670, -47.946000),
        ('PW-26', 'Quadrante 26', v_product_id, 'PARK WAY', '10', -15.939035, -15.934543, -47.946000, -47.941330),
        ('PW-27', 'Quadrante 27', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.983362, -47.978692),
        ('PW-28', 'Quadrante 28', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.978692, -47.974022),
        ('PW-29', 'Quadrante 29', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.974022, -47.969351),
        ('PW-30', 'Quadrante 30', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.969351, -47.964681),
        ('PW-31', 'Quadrante 31', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.964681, -47.960011),
        ('PW-32', 'Quadrante 32', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.960011, -47.955341),
        ('PW-33', 'Quadrante 33', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.955341, -47.950670),
        ('PW-34', 'Quadrante 34', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.950670, -47.946000),
        ('PW-35', 'Quadrante 35', v_product_id, 'PARK WAY', '10', -15.934543, -15.930052, -47.946000, -47.941330),
        ('PW-36', 'Quadrante 36', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.983362, -47.978692),
        ('PW-37', 'Quadrante 37', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.978692, -47.974022),
        ('PW-38', 'Quadrante 38', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.974022, -47.969351),
        ('PW-39', 'Quadrante 39', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.969351, -47.964681),
        ('PW-40', 'Quadrante 40', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.964681, -47.960011),
        ('PW-41', 'Quadrante 41', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.960011, -47.955341),
        ('PW-42', 'Quadrante 42', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.955341, -47.950670),
        ('PW-43', 'Quadrante 43', v_product_id, 'PARK WAY', '10', -15.930052, -15.925560, -47.950670, -47.946000),
        ('PW-44', 'Quadrante 44', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.978692, -47.974022),
        ('PW-45', 'Quadrante 45', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.974022, -47.969351),
        ('PW-46', 'Quadrante 46', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.969351, -47.964681),
        ('PW-47', 'Quadrante 47', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.964681, -47.960011),
        ('PW-48', 'Quadrante 48', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.960011, -47.955341),
        ('PW-49', 'Quadrante 49', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.955341, -47.950670),
        ('PW-50', 'Quadrante 50', v_product_id, 'PARK WAY', '10', -15.925560, -15.921069, -47.950670, -47.946000),
        ('PW-51', 'Quadrante 51', v_product_id, 'PARK WAY', '10', -15.921069, -15.916577, -47.974022, -47.969351),
        ('PW-52', 'Quadrante 52', v_product_id, 'PARK WAY', '10', -15.921069, -15.916577, -47.969351, -47.964681),
        ('PW-53', 'Quadrante 53', v_product_id, 'PARK WAY', '10', -15.921069, -15.916577, -47.964681, -47.960011),
        ('PW-54', 'Quadrante 54', v_product_id, 'PARK WAY', '10', -15.921069, -15.916577, -47.960011, -47.955341),
        ('PW-55', 'Quadrante 55', v_product_id, 'PARK WAY', '10', -15.921069, -15.916577, -47.955341, -47.950670),
        ('PW-56', 'Quadrante 56', v_product_id, 'PARK WAY', '10', -15.921069, -15.916577, -47.950670, -47.946000),
        ('PW-57', 'Quadrante 57', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.978692, -47.974022),
        ('PW-58', 'Quadrante 58', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.974022, -47.969351),
        ('PW-59', 'Quadrante 59', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.969351, -47.964681),
        ('PW-60', 'Quadrante 60', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.964681, -47.960011),
        ('PW-61', 'Quadrante 61', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.960011, -47.955341),
        ('PW-62', 'Quadrante 62', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.955341, -47.950670),
        ('PW-63', 'Quadrante 63', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.950670, -47.946000),
        ('PW-64', 'Quadrante 64', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.946000, -47.941330),
        ('PW-65', 'Quadrante 65', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.941330, -47.936660),
        ('PW-66', 'Quadrante 66', v_product_id, 'PARK WAY', '10', -15.916577, -15.912086, -47.936660, -47.931989),
        ('PW-67', 'Quadrante 67', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.978692, -47.974022),
        ('PW-68', 'Quadrante 68', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.974022, -47.969351),
        ('PW-69', 'Quadrante 69', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.969351, -47.964681),
        ('PW-70', 'Quadrante 70', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.964681, -47.960011),
        ('PW-71', 'Quadrante 71', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.960011, -47.955341),
        ('PW-72', 'Quadrante 72', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.950670, -47.946000),
        ('PW-73', 'Quadrante 73', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.946000, -47.941330),
        ('PW-74', 'Quadrante 74', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.941330, -47.936660),
        ('PW-75', 'Quadrante 75', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.936660, -47.931989),
        ('PW-76', 'Quadrante 76', v_product_id, 'PARK WAY', '10', -15.912086, -15.907594, -47.931989, -47.927319),
        ('PW-77', 'Quadrante 77', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.983362, -47.978692),
        ('PW-78', 'Quadrante 78', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.978692, -47.974022),
        ('PW-79', 'Quadrante 79', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.974022, -47.969351),
        ('PW-80', 'Quadrante 80', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.969351, -47.964681),
        ('PW-81', 'Quadrante 81', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.964681, -47.960011),
        ('PW-82', 'Quadrante 82', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.960011, -47.955341),
        ('PW-83', 'Quadrante 83', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.955341, -47.950670),
        ('PW-84', 'Quadrante 84', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.946000, -47.941330),
        ('PW-85', 'Quadrante 85', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.941330, -47.936660),
        ('PW-86', 'Quadrante 86', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.936660, -47.931989),
        ('PW-87', 'Quadrante 87', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.931989, -47.927319),
        ('PW-88', 'Quadrante 88', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.927319, -47.922649),
        ('PW-89', 'Quadrante 89', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.922649, -47.917979),
        ('PW-90', 'Quadrante 90', v_product_id, 'PARK WAY', '10', -15.907594, -15.903102, -47.917979, -47.913308),
        ('PW-91', 'Quadrante 91', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.983362, -47.978692),
        ('PW-92', 'Quadrante 92', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.978692, -47.974022),
        ('PW-93', 'Quadrante 93', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.974022, -47.969351),
        ('PW-94', 'Quadrante 94', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.969351, -47.964681),
        ('PW-95', 'Quadrante 95', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.964681, -47.960011),
        ('PW-96', 'Quadrante 96', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.960011, -47.955341),
        ('PW-97', 'Quadrante 97', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.955341, -47.950670),
        ('PW-98', 'Quadrante 98', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.950670, -47.946000),
        ('PW-99', 'Quadrante 99', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.946000, -47.941330),
        ('PW-100', 'Quadrante 100', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.941330, -47.936660),
        ('PW-101', 'Quadrante 101', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.936660, -47.931989),
        ('PW-102', 'Quadrante 102', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.931989, -47.927319),
        ('PW-103', 'Quadrante 103', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.927319, -47.922649),
        ('PW-104', 'Quadrante 104', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.922649, -47.917979),
        ('PW-105', 'Quadrante 105', v_product_id, 'PARK WAY', '10', -15.903102, -15.898611, -47.917979, -47.913308),
        ('PW-106', 'Quadrante 106', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.983362, -47.978692),
        ('PW-107', 'Quadrante 107', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.978692, -47.974022),
        ('PW-108', 'Quadrante 108', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.974022, -47.969351),
        ('PW-109', 'Quadrante 109', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.969351, -47.964681),
        ('PW-110', 'Quadrante 110', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.964681, -47.960011),
        ('PW-111', 'Quadrante 111', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.960011, -47.955341),
        ('PW-112', 'Quadrante 112', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.955341, -47.950670),
        ('PW-113', 'Quadrante 113', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.950670, -47.946000),
        ('PW-114', 'Quadrante 114', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.936660, -47.931989),
        ('PW-115', 'Quadrante 115', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.931989, -47.927319),
        ('PW-116', 'Quadrante 116', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.927319, -47.922649),
        ('PW-117', 'Quadrante 117', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.922649, -47.917979),
        ('PW-118', 'Quadrante 118', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.917979, -47.913308),
        ('PW-119', 'Quadrante 119', v_product_id, 'PARK WAY', '10', -15.898611, -15.894119, -47.913308, -47.908638),
        ('PW-120', 'Quadrante 120', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.988032, -47.983362),
        ('PW-121', 'Quadrante 121', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.983362, -47.978692),
        ('PW-122', 'Quadrante 122', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.978692, -47.974022),
        ('PW-123', 'Quadrante 123', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.974022, -47.969351),
        ('PW-124', 'Quadrante 124', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.969351, -47.964681),
        ('PW-125', 'Quadrante 125', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.964681, -47.960011),
        ('PW-126', 'Quadrante 126', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.960011, -47.955341),
        ('PW-127', 'Quadrante 127', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.955341, -47.950670),
        ('PW-128', 'Quadrante 128', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.931989, -47.927319),
        ('PW-129', 'Quadrante 129', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.927319, -47.922649),
        ('PW-130', 'Quadrante 130', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.922649, -47.917979),
        ('PW-131', 'Quadrante 131', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.917979, -47.913308),
        ('PW-132', 'Quadrante 132', v_product_id, 'PARK WAY', '10', -15.894119, -15.889628, -47.913308, -47.908638),
        ('PW-133', 'Quadrante 133', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.988032, -47.983362),
        ('PW-134', 'Quadrante 134', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.983362, -47.978692),
        ('PW-135', 'Quadrante 135', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.978692, -47.974022),
        ('PW-136', 'Quadrante 136', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.974022, -47.969351),
        ('PW-137', 'Quadrante 137', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.969351, -47.964681),
        ('PW-138', 'Quadrante 138', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.964681, -47.960011),
        ('PW-139', 'Quadrante 139', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.960011, -47.955341),
        ('PW-140', 'Quadrante 140', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.955341, -47.950670),
        ('PW-141', 'Quadrante 141', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.927319, -47.922649),
        ('PW-142', 'Quadrante 142', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.922649, -47.917979),
        ('PW-143', 'Quadrante 143', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.917979, -47.913308),
        ('PW-144', 'Quadrante 144', v_product_id, 'PARK WAY', '10', -15.889628, -15.885136, -47.913308, -47.908638),
        ('PW-145', 'Quadrante 145', v_product_id, 'PARK WAY', '10', -15.885136, -15.880645, -47.983362, -47.978692),
        ('PW-146', 'Quadrante 146', v_product_id, 'PARK WAY', '10', -15.885136, -15.880645, -47.960011, -47.955341),
        ('PW-147', 'Quadrante 147', v_product_id, 'PARK WAY', '10', -15.885136, -15.880645, -47.913308, -47.908638),
        ('PW-148', 'Quadrante 148', v_product_id, 'PARK WAY', '10', -15.880645, -15.876153, -47.960011, -47.955341),
        ('PW-149', 'Quadrante 149', v_product_id, 'PARK WAY', '10', -15.876153, -15.871662, -47.992703, -47.988032),
        ('PW-150', 'Quadrante 150', v_product_id, 'PARK WAY', '10', -15.876153, -15.871662, -47.988032, -47.983362),
        ('PW-151', 'Quadrante 151', v_product_id, 'PARK WAY', '10', -15.876153, -15.871662, -47.983362, -47.978692),
        ('PW-152', 'Quadrante 152', v_product_id, 'PARK WAY', '10', -15.876153, -15.871662, -47.955341, -47.950670),
        ('PW-153', 'Quadrante 153', v_product_id, 'PARK WAY', '10', -15.871662, -15.867170, -47.992703, -47.988032),
        ('PW-154', 'Quadrante 154', v_product_id, 'PARK WAY', '10', -15.871662, -15.867170, -47.988032, -47.983362),
        ('PW-155', 'Quadrante 155', v_product_id, 'PARK WAY', '10', -15.871662, -15.867170, -47.983362, -47.978692),
        ('PW-156', 'Quadrante 156', v_product_id, 'PARK WAY', '10', -15.871662, -15.867170, -47.946000, -47.941330),
        ('PW-157', 'Quadrante 157', v_product_id, 'PARK WAY', '10', -15.871662, -15.867170, -47.941330, -47.936660),
        ('PW-158', 'Quadrante 158', v_product_id, 'PARK WAY', '10', -15.867170, -15.862678, -47.988032, -47.983362),
        ('PW-159', 'Quadrante 159', v_product_id, 'PARK WAY', '10', -15.867170, -15.862678, -47.983362, -47.978692),
        ('PW-160', 'Quadrante 160', v_product_id, 'PARK WAY', '10', -15.867170, -15.862678, -47.978692, -47.974022),
        ('PW-161', 'Quadrante 161', v_product_id, 'PARK WAY', '10', -15.867170, -15.862678, -47.974022, -47.969351),
        ('PW-162', 'Quadrante 162', v_product_id, 'PARK WAY', '10', -15.867170, -15.862678, -47.969351, -47.964681),
        ('PW-163', 'Quadrante 163', v_product_id, 'PARK WAY', '10', -15.862678, -15.858187, -47.988032, -47.983362),
        ('PW-164', 'Quadrante 164', v_product_id, 'PARK WAY', '10', -15.862678, -15.858187, -47.983362, -47.978692),
        ('PW-165', 'Quadrante 165', v_product_id, 'PARK WAY', '10', -15.862678, -15.858187, -47.978692, -47.974022),
        ('PW-166', 'Quadrante 166', v_product_id, 'PARK WAY', '10', -15.858187, -15.853695, -47.997373, -47.992703),
        ('PW-167', 'Quadrante 167', v_product_id, 'PARK WAY', '10', -15.858187, -15.853695, -47.992703, -47.988032),
        ('PW-168', 'Quadrante 168', v_product_id, 'PARK WAY', '10', -15.858187, -15.853695, -47.988032, -47.983362),
        ('PW-169', 'Quadrante 169', v_product_id, 'PARK WAY', '10', -15.858187, -15.853695, -47.983362, -47.978692),
        ('PW-170', 'Quadrante 170', v_product_id, 'PARK WAY', '10', -15.853695, -15.849204, -48.002043, -47.997373),
        ('PW-171', 'Quadrante 171', v_product_id, 'PARK WAY', '10', -15.853695, -15.849204, -47.997373, -47.992703),
        ('PW-172', 'Quadrante 172', v_product_id, 'PARK WAY', '10', -15.853695, -15.849204, -47.992703, -47.988032),
        ('PW-173', 'Quadrante 173', v_product_id, 'PARK WAY', '10', -15.853695, -15.849204, -47.988032, -47.983362),
        ('PW-174', 'Quadrante 174', v_product_id, 'PARK WAY', '10', -15.853695, -15.849204, -47.983362, -47.978692),
        ('PW-175', 'Quadrante 175', v_product_id, 'PARK WAY', '10', -15.849204, -15.844712, -48.006713, -48.002043),
        ('PW-176', 'Quadrante 176', v_product_id, 'PARK WAY', '10', -15.849204, -15.844712, -47.997373, -47.992703),
        ('PW-177', 'Quadrante 177', v_product_id, 'PARK WAY', '10', -15.849204, -15.844712, -47.992703, -47.988032),
        ('PW-178', 'Quadrante 178', v_product_id, 'PARK WAY', '10', -15.844712, -15.840221, -48.011384, -48.006713),
        ('PW-179', 'Quadrante 179', v_product_id, 'PARK WAY', '10', -15.844712, -15.840221, -48.006713, -48.002043),
        ('PW-180', 'Quadrante 180', v_product_id, 'PARK WAY', '10', -15.844712, -15.840221, -48.002043, -47.997373),
        ('PW-181', 'Quadrante 181', v_product_id, 'PARK WAY', '10', -15.844712, -15.840221, -47.997373, -47.992703),
        ('PW-182', 'Quadrante 182', v_product_id, 'PARK WAY', '10', -15.844712, -15.840221, -47.992703, -47.988032),
        ('PW-183', 'Quadrante 183', v_product_id, 'PARK WAY', '10', -15.840221, -15.835729, -48.002043, -47.997373),
        ('PW-184', 'Quadrante 184', v_product_id, 'PARK WAY', '10', -15.840221, -15.835729, -47.997373, -47.992703),
        ('PW-185', 'Quadrante 185', v_product_id, 'PARK WAY', '10', -15.835729, -15.831238, -48.006713, -48.002043),
        ('PW-186', 'Quadrante 186', v_product_id, 'PARK WAY', '10', -15.835729, -15.831238, -48.002043, -47.997373),
        ('PW-187', 'Quadrante 187', v_product_id, 'PARK WAY', '10', -15.835729, -15.831238, -47.997373, -47.992703),
        ('PW-188', 'Quadrante 188', v_product_id, 'PARK WAY', '10', -15.831238, -15.826746, -48.011384, -48.006713),
        ('PW-189', 'Quadrante 189', v_product_id, 'PARK WAY', '10', -15.831238, -15.826746, -48.006713, -48.002043),
        ('PW-190', 'Quadrante 190', v_product_id, 'PARK WAY', '10', -15.831238, -15.826746, -48.002043, -47.997373),
        ('PW-191', 'Quadrante 191', v_product_id, 'PARK WAY', '10', -15.826746, -15.822254, -48.011384, -48.006713),
        ('PW-192', 'Quadrante 192', v_product_id, 'PARK WAY', '10', -15.826746, -15.822254, -48.006713, -48.002043),
        ('PW-193', 'Quadrante 193', v_product_id, 'PARK WAY', '10', -15.826746, -15.822254, -48.002043, -47.997373),
        ('PW-194', 'Quadrante 194', v_product_id, 'PARK WAY', '10', -15.822254, -15.817946, -48.006713, -48.002043);
END $$;

-- ------------------------------------------------------------
-- LAGO SUL (LS) — 171 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'LAGO SUL' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — LAGO SUL', 'LAGO SUL', '18')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('LS-01', 'Quadrante 1', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.942324, -47.937655),
        ('LS-02', 'Quadrante 2', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.937655, -47.932986),
        ('LS-03', 'Quadrante 3', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.932986, -47.928316),
        ('LS-04', 'Quadrante 4', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.928316, -47.923647),
        ('LS-05', 'Quadrante 5', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.923647, -47.918978),
        ('LS-06', 'Quadrante 6', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.918978, -47.914309),
        ('LS-07', 'Quadrante 7', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.914309, -47.909640),
        ('LS-08', 'Quadrante 8', v_product_id, 'LAGO SUL', '18', -15.882074, -15.877583, -47.909640, -47.904971),
        ('LS-09', 'Quadrante 9', v_product_id, 'LAGO SUL', '18', -15.877583, -15.873091, -47.928316, -47.923647),
        ('LS-10', 'Quadrante 10', v_product_id, 'LAGO SUL', '18', -15.877583, -15.873091, -47.923647, -47.918978),
        ('LS-11', 'Quadrante 11', v_product_id, 'LAGO SUL', '18', -15.877583, -15.873091, -47.918978, -47.914309),
        ('LS-12', 'Quadrante 12', v_product_id, 'LAGO SUL', '18', -15.877583, -15.873091, -47.914309, -47.909640),
        ('LS-13', 'Quadrante 13', v_product_id, 'LAGO SUL', '18', -15.877583, -15.873091, -47.909640, -47.904971),
        ('LS-14', 'Quadrante 14', v_product_id, 'LAGO SUL', '18', -15.877583, -15.873091, -47.872287, -47.867618),
        ('LS-15', 'Quadrante 15', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.937655, -47.932986),
        ('LS-16', 'Quadrante 16', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.932986, -47.928316),
        ('LS-17', 'Quadrante 17', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.928316, -47.923647),
        ('LS-18', 'Quadrante 18', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.923647, -47.918978),
        ('LS-19', 'Quadrante 19', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.918978, -47.914309),
        ('LS-20', 'Quadrante 20', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.914309, -47.909640),
        ('LS-21', 'Quadrante 21', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.909640, -47.904971),
        ('LS-22', 'Quadrante 22', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.904971, -47.900302),
        ('LS-23', 'Quadrante 23', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.900302, -47.895632),
        ('LS-24', 'Quadrante 24', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.872287, -47.867618),
        ('LS-25', 'Quadrante 25', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.867618, -47.862948),
        ('LS-26', 'Quadrante 26', v_product_id, 'LAGO SUL', '18', -15.873091, -15.868600, -47.862948, -47.858279),
        ('LS-27', 'Quadrante 27', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.928316, -47.923647),
        ('LS-28', 'Quadrante 28', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.923647, -47.918978),
        ('LS-29', 'Quadrante 29', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.918978, -47.914309),
        ('LS-30', 'Quadrante 30', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.914309, -47.909640),
        ('LS-31', 'Quadrante 31', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.909640, -47.904971),
        ('LS-32', 'Quadrante 32', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.904971, -47.900302),
        ('LS-33', 'Quadrante 33', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.900302, -47.895632),
        ('LS-34', 'Quadrante 34', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.881625, -47.876956),
        ('LS-35', 'Quadrante 35', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.876956, -47.872287),
        ('LS-36', 'Quadrante 36', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.872287, -47.867618),
        ('LS-37', 'Quadrante 37', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.867618, -47.862948),
        ('LS-38', 'Quadrante 38', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.862948, -47.858279),
        ('LS-39', 'Quadrante 39', v_product_id, 'LAGO SUL', '18', -15.868600, -15.864108, -47.858279, -47.853610),
        ('LS-40', 'Quadrante 40', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.909640, -47.904971),
        ('LS-41', 'Quadrante 41', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.904971, -47.900302),
        ('LS-42', 'Quadrante 42', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.900302, -47.895632),
        ('LS-43', 'Quadrante 43', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.876956, -47.872287),
        ('LS-44', 'Quadrante 44', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.872287, -47.867618),
        ('LS-45', 'Quadrante 45', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.867618, -47.862948),
        ('LS-46', 'Quadrante 46', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.862948, -47.858279),
        ('LS-47', 'Quadrante 47', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.844272, -47.839603),
        ('LS-48', 'Quadrante 48', v_product_id, 'LAGO SUL', '18', -15.864108, -15.859617, -47.839603, -47.834934),
        ('LS-49', 'Quadrante 49', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.928316, -47.923647),
        ('LS-50', 'Quadrante 50', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.923647, -47.918978),
        ('LS-51', 'Quadrante 51', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.918978, -47.914309),
        ('LS-52', 'Quadrante 52', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.914309, -47.909640),
        ('LS-53', 'Quadrante 53', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.909640, -47.904971),
        ('LS-54', 'Quadrante 54', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.904971, -47.900302),
        ('LS-55', 'Quadrante 55', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.900302, -47.895632),
        ('LS-56', 'Quadrante 56', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.895632, -47.890963),
        ('LS-57', 'Quadrante 57', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.881625, -47.876956),
        ('LS-58', 'Quadrante 58', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.867618, -47.862948),
        ('LS-59', 'Quadrante 59', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.862948, -47.858279),
        ('LS-60', 'Quadrante 60', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.848941, -47.844272),
        ('LS-61', 'Quadrante 61', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.844272, -47.839603),
        ('LS-62', 'Quadrante 62', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.839603, -47.834934),
        ('LS-63', 'Quadrante 63', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.834934, -47.830264),
        ('LS-64', 'Quadrante 64', v_product_id, 'LAGO SUL', '18', -15.859617, -15.855125, -47.830264, -47.825595),
        ('LS-65', 'Quadrante 65', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.918978, -47.914309),
        ('LS-66', 'Quadrante 66', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.914309, -47.909640),
        ('LS-67', 'Quadrante 67', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.909640, -47.904971),
        ('LS-68', 'Quadrante 68', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.904971, -47.900302),
        ('LS-69', 'Quadrante 69', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.900302, -47.895632),
        ('LS-70', 'Quadrante 70', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.895632, -47.890963),
        ('LS-71', 'Quadrante 71', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.890963, -47.886294),
        ('LS-72', 'Quadrante 72', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.886294, -47.881625),
        ('LS-73', 'Quadrante 73', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.881625, -47.876956),
        ('LS-74', 'Quadrante 74', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.876956, -47.872287),
        ('LS-75', 'Quadrante 75', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.872287, -47.867618),
        ('LS-76', 'Quadrante 76', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.867618, -47.862948),
        ('LS-77', 'Quadrante 77', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.862948, -47.858279),
        ('LS-78', 'Quadrante 78', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.858279, -47.853610),
        ('LS-79', 'Quadrante 79', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.853610, -47.848941),
        ('LS-80', 'Quadrante 80', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.848941, -47.844272),
        ('LS-81', 'Quadrante 81', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.844272, -47.839603),
        ('LS-82', 'Quadrante 82', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.839603, -47.834934),
        ('LS-83', 'Quadrante 83', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.834934, -47.830264),
        ('LS-84', 'Quadrante 84', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.830264, -47.825595),
        ('LS-85', 'Quadrante 85', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.825595, -47.820926),
        ('LS-86', 'Quadrante 86', v_product_id, 'LAGO SUL', '18', -15.855125, -15.850634, -47.820926, -47.816257),
        ('LS-87', 'Quadrante 87', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.909640, -47.904971),
        ('LS-88', 'Quadrante 88', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.904971, -47.900302),
        ('LS-89', 'Quadrante 89', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.900302, -47.895632),
        ('LS-90', 'Quadrante 90', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.895632, -47.890963),
        ('LS-91', 'Quadrante 91', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.890963, -47.886294),
        ('LS-92', 'Quadrante 92', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.886294, -47.881625),
        ('LS-93', 'Quadrante 93', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.881625, -47.876956),
        ('LS-94', 'Quadrante 94', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.876956, -47.872287),
        ('LS-95', 'Quadrante 95', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.872287, -47.867618),
        ('LS-96', 'Quadrante 96', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.862948, -47.858279),
        ('LS-97', 'Quadrante 97', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.858279, -47.853610),
        ('LS-98', 'Quadrante 98', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.853610, -47.848941),
        ('LS-99', 'Quadrante 99', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.848941, -47.844272),
        ('LS-100', 'Quadrante 100', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.844272, -47.839603),
        ('LS-101', 'Quadrante 101', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.839603, -47.834934),
        ('LS-102', 'Quadrante 102', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.834934, -47.830264),
        ('LS-103', 'Quadrante 103', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.830264, -47.825595),
        ('LS-104', 'Quadrante 104', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.825595, -47.820926),
        ('LS-105', 'Quadrante 105', v_product_id, 'LAGO SUL', '18', -15.850634, -15.846142, -47.820926, -47.816257),
        ('LS-106', 'Quadrante 106', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.900302, -47.895632),
        ('LS-107', 'Quadrante 107', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.895632, -47.890963),
        ('LS-108', 'Quadrante 108', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.890963, -47.886294),
        ('LS-109', 'Quadrante 109', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.886294, -47.881625),
        ('LS-110', 'Quadrante 110', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.881625, -47.876956),
        ('LS-111', 'Quadrante 111', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.876956, -47.872287),
        ('LS-112', 'Quadrante 112', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.872287, -47.867618),
        ('LS-113', 'Quadrante 113', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.858279, -47.853610),
        ('LS-114', 'Quadrante 114', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.853610, -47.848941),
        ('LS-115', 'Quadrante 115', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.848941, -47.844272),
        ('LS-116', 'Quadrante 116', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.844272, -47.839603),
        ('LS-117', 'Quadrante 117', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.839603, -47.834934),
        ('LS-118', 'Quadrante 118', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.834934, -47.830264),
        ('LS-119', 'Quadrante 119', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.830264, -47.825595),
        ('LS-120', 'Quadrante 120', v_product_id, 'LAGO SUL', '18', -15.846142, -15.841650, -47.825595, -47.820926),
        ('LS-121', 'Quadrante 121', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.890963, -47.886294),
        ('LS-122', 'Quadrante 122', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.886294, -47.881625),
        ('LS-123', 'Quadrante 123', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.881625, -47.876956),
        ('LS-124', 'Quadrante 124', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.876956, -47.872287),
        ('LS-125', 'Quadrante 125', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.872287, -47.867618),
        ('LS-126', 'Quadrante 126', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.867618, -47.862948),
        ('LS-127', 'Quadrante 127', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.844272, -47.839603),
        ('LS-128', 'Quadrante 128', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.839603, -47.834934),
        ('LS-129', 'Quadrante 129', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.834934, -47.830264),
        ('LS-130', 'Quadrante 130', v_product_id, 'LAGO SUL', '18', -15.841650, -15.837159, -47.820926, -47.816257),
        ('LS-131', 'Quadrante 131', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.886294, -47.881625),
        ('LS-132', 'Quadrante 132', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.881625, -47.876956),
        ('LS-133', 'Quadrante 133', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.876956, -47.872287),
        ('LS-134', 'Quadrante 134', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.872287, -47.867618),
        ('LS-135', 'Quadrante 135', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.867618, -47.862948),
        ('LS-136', 'Quadrante 136', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.839603, -47.834934),
        ('LS-137', 'Quadrante 137', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.834934, -47.830264),
        ('LS-138', 'Quadrante 138', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.830264, -47.825595),
        ('LS-139', 'Quadrante 139', v_product_id, 'LAGO SUL', '18', -15.837159, -15.832667, -47.816257, -47.811588),
        ('LS-140', 'Quadrante 140', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.881625, -47.876956),
        ('LS-141', 'Quadrante 141', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.876956, -47.872287),
        ('LS-142', 'Quadrante 142', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.872287, -47.867618),
        ('LS-143', 'Quadrante 143', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.867618, -47.862948),
        ('LS-144', 'Quadrante 144', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.862948, -47.858279),
        ('LS-145', 'Quadrante 145', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.825595, -47.820926),
        ('LS-146', 'Quadrante 146', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.820926, -47.816257),
        ('LS-147', 'Quadrante 147', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.816257, -47.811588),
        ('LS-148', 'Quadrante 148', v_product_id, 'LAGO SUL', '18', -15.832667, -15.828176, -47.811588, -47.806919),
        ('LS-149', 'Quadrante 149', v_product_id, 'LAGO SUL', '18', -15.828176, -15.823684, -47.876956, -47.872287),
        ('LS-150', 'Quadrante 150', v_product_id, 'LAGO SUL', '18', -15.828176, -15.823684, -47.825595, -47.820926),
        ('LS-151', 'Quadrante 151', v_product_id, 'LAGO SUL', '18', -15.828176, -15.823684, -47.820926, -47.816257),
        ('LS-152', 'Quadrante 152', v_product_id, 'LAGO SUL', '18', -15.828176, -15.823684, -47.816257, -47.811588),
        ('LS-153', 'Quadrante 153', v_product_id, 'LAGO SUL', '18', -15.828176, -15.823684, -47.806919, -47.802250),
        ('LS-154', 'Quadrante 154', v_product_id, 'LAGO SUL', '18', -15.823684, -15.819193, -47.806919, -47.802250),
        ('LS-155', 'Quadrante 155', v_product_id, 'LAGO SUL', '18', -15.823684, -15.819193, -47.802250, -47.797580),
        ('LS-156', 'Quadrante 156', v_product_id, 'LAGO SUL', '18', -15.819193, -15.814701, -47.820926, -47.816257),
        ('LS-157', 'Quadrante 157', v_product_id, 'LAGO SUL', '18', -15.819193, -15.814701, -47.816257, -47.811588),
        ('LS-158', 'Quadrante 158', v_product_id, 'LAGO SUL', '18', -15.819193, -15.814701, -47.811588, -47.806919),
        ('LS-159', 'Quadrante 159', v_product_id, 'LAGO SUL', '18', -15.819193, -15.814701, -47.806919, -47.802250),
        ('LS-160', 'Quadrante 160', v_product_id, 'LAGO SUL', '18', -15.819193, -15.814701, -47.802250, -47.797580),
        ('LS-161', 'Quadrante 161', v_product_id, 'LAGO SUL', '18', -15.814701, -15.810210, -47.816257, -47.811588),
        ('LS-162', 'Quadrante 162', v_product_id, 'LAGO SUL', '18', -15.814701, -15.810210, -47.811588, -47.806919),
        ('LS-163', 'Quadrante 163', v_product_id, 'LAGO SUL', '18', -15.814701, -15.810210, -47.806919, -47.802250),
        ('LS-164', 'Quadrante 164', v_product_id, 'LAGO SUL', '18', -15.814701, -15.810210, -47.802250, -47.797580),
        ('LS-165', 'Quadrante 165', v_product_id, 'LAGO SUL', '18', -15.810210, -15.805718, -47.816257, -47.811588),
        ('LS-166', 'Quadrante 166', v_product_id, 'LAGO SUL', '18', -15.810210, -15.805718, -47.792911, -47.788242),
        ('LS-167', 'Quadrante 167', v_product_id, 'LAGO SUL', '18', -15.805718, -15.801226, -47.816257, -47.811588),
        ('LS-168', 'Quadrante 168', v_product_id, 'LAGO SUL', '18', -15.805718, -15.801226, -47.811588, -47.806919),
        ('LS-169', 'Quadrante 169', v_product_id, 'LAGO SUL', '18', -15.805718, -15.801226, -47.806919, -47.802250),
        ('LS-170', 'Quadrante 170', v_product_id, 'LAGO SUL', '18', -15.801226, -15.796735, -47.811588, -47.806919),
        ('LS-171', 'Quadrante 171', v_product_id, 'LAGO SUL', '18', -15.801226, -15.796735, -47.806919, -47.802250);
END $$;

-- ------------------------------------------------------------
-- LAGO NORTE (LN) — 122 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'LAGO NORTE' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — LAGO NORTE', 'LAGO NORTE', '2')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('LN-01', 'Quadrante 1', v_product_id, 'LAGO NORTE', '2', -15.790731, -15.786240, -47.802134, -47.797468),
        ('LN-02', 'Quadrante 2', v_product_id, 'LAGO NORTE', '2', -15.786240, -15.781748, -47.797468, -47.792801),
        ('LN-03', 'Quadrante 3', v_product_id, 'LAGO NORTE', '2', -15.777257, -15.772765, -47.816134, -47.811467),
        ('LN-04', 'Quadrante 4', v_product_id, 'LAGO NORTE', '2', -15.772765, -15.768273, -47.834799, -47.830133),
        ('LN-05', 'Quadrante 5', v_product_id, 'LAGO NORTE', '2', -15.772765, -15.768273, -47.816134, -47.811467),
        ('LN-06', 'Quadrante 6', v_product_id, 'LAGO NORTE', '2', -15.768273, -15.763782, -47.834799, -47.830133),
        ('LN-07', 'Quadrante 7', v_product_id, 'LAGO NORTE', '2', -15.768273, -15.763782, -47.820800, -47.816134),
        ('LN-08', 'Quadrante 8', v_product_id, 'LAGO NORTE', '2', -15.768273, -15.763782, -47.816134, -47.811467),
        ('LN-09', 'Quadrante 9', v_product_id, 'LAGO NORTE', '2', -15.763782, -15.759290, -47.844132, -47.839466),
        ('LN-10', 'Quadrante 10', v_product_id, 'LAGO NORTE', '2', -15.763782, -15.759290, -47.839466, -47.834799),
        ('LN-11', 'Quadrante 11', v_product_id, 'LAGO NORTE', '2', -15.763782, -15.759290, -47.834799, -47.830133),
        ('LN-12', 'Quadrante 12', v_product_id, 'LAGO NORTE', '2', -15.763782, -15.759290, -47.830133, -47.825466),
        ('LN-13', 'Quadrante 13', v_product_id, 'LAGO NORTE', '2', -15.763782, -15.759290, -47.816134, -47.811467),
        ('LN-14', 'Quadrante 14', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.844132, -47.839466),
        ('LN-15', 'Quadrante 15', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.839466, -47.834799),
        ('LN-16', 'Quadrante 16', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.834799, -47.830133),
        ('LN-17', 'Quadrante 17', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.820800, -47.816134),
        ('LN-18', 'Quadrante 18', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.816134, -47.811467),
        ('LN-19', 'Quadrante 19', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.811467, -47.806801),
        ('LN-20', 'Quadrante 20', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.806801, -47.802134),
        ('LN-21', 'Quadrante 21', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.797468, -47.792801),
        ('LN-22', 'Quadrante 22', v_product_id, 'LAGO NORTE', '2', -15.759290, -15.754799, -47.792801, -47.788135),
        ('LN-23', 'Quadrante 23', v_product_id, 'LAGO NORTE', '2', -15.754799, -15.750307, -47.848799, -47.844132),
        ('LN-24', 'Quadrante 24', v_product_id, 'LAGO NORTE', '2', -15.754799, -15.750307, -47.844132, -47.839466),
        ('LN-25', 'Quadrante 25', v_product_id, 'LAGO NORTE', '2', -15.754799, -15.750307, -47.839466, -47.834799),
        ('LN-26', 'Quadrante 26', v_product_id, 'LAGO NORTE', '2', -15.754799, -15.750307, -47.834799, -47.830133),
        ('LN-27', 'Quadrante 27', v_product_id, 'LAGO NORTE', '2', -15.754799, -15.750307, -47.816134, -47.811467),
        ('LN-28', 'Quadrante 28', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.858131, -47.853465),
        ('LN-29', 'Quadrante 29', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.853465, -47.848799),
        ('LN-30', 'Quadrante 30', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.848799, -47.844132),
        ('LN-31', 'Quadrante 31', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.844132, -47.839466),
        ('LN-32', 'Quadrante 32', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.839466, -47.834799),
        ('LN-33', 'Quadrante 33', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.834799, -47.830133),
        ('LN-34', 'Quadrante 34', v_product_id, 'LAGO NORTE', '2', -15.750307, -15.745816, -47.802134, -47.797468),
        ('LN-35', 'Quadrante 35', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.867464, -47.862798),
        ('LN-36', 'Quadrante 36', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.862798, -47.858131),
        ('LN-37', 'Quadrante 37', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.858131, -47.853465),
        ('LN-38', 'Quadrante 38', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.853465, -47.848799),
        ('LN-39', 'Quadrante 39', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.848799, -47.844132),
        ('LN-40', 'Quadrante 40', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.844132, -47.839466),
        ('LN-41', 'Quadrante 41', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.830133, -47.825466),
        ('LN-42', 'Quadrante 42', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.825466, -47.820800),
        ('LN-43', 'Quadrante 43', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.802134, -47.797468),
        ('LN-44', 'Quadrante 44', v_product_id, 'LAGO NORTE', '2', -15.745816, -15.741324, -47.797468, -47.792801),
        ('LN-45', 'Quadrante 45', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.872131, -47.867464),
        ('LN-46', 'Quadrante 46', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.867464, -47.862798),
        ('LN-47', 'Quadrante 47', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.862798, -47.858131),
        ('LN-48', 'Quadrante 48', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.858131, -47.853465),
        ('LN-49', 'Quadrante 49', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.853465, -47.848799),
        ('LN-50', 'Quadrante 50', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.848799, -47.844132),
        ('LN-51', 'Quadrante 51', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.834799, -47.830133),
        ('LN-52', 'Quadrante 52', v_product_id, 'LAGO NORTE', '2', -15.741324, -15.736833, -47.830133, -47.825466),
        ('LN-53', 'Quadrante 53', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.876797, -47.872131),
        ('LN-54', 'Quadrante 54', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.872131, -47.867464),
        ('LN-55', 'Quadrante 55', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.867464, -47.862798),
        ('LN-56', 'Quadrante 56', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.862798, -47.858131),
        ('LN-57', 'Quadrante 57', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.858131, -47.853465),
        ('LN-58', 'Quadrante 58', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.853465, -47.848799),
        ('LN-59', 'Quadrante 59', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.844132, -47.839466),
        ('LN-60', 'Quadrante 60', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.839466, -47.834799),
        ('LN-61', 'Quadrante 61', v_product_id, 'LAGO NORTE', '2', -15.736833, -15.732341, -47.830133, -47.825466),
        ('LN-62', 'Quadrante 62', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.881464, -47.876797),
        ('LN-63', 'Quadrante 63', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.876797, -47.872131),
        ('LN-64', 'Quadrante 64', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.872131, -47.867464),
        ('LN-65', 'Quadrante 65', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.867464, -47.862798),
        ('LN-66', 'Quadrante 66', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.862798, -47.858131),
        ('LN-67', 'Quadrante 67', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.848799, -47.844132),
        ('LN-68', 'Quadrante 68', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.844132, -47.839466),
        ('LN-69', 'Quadrante 69', v_product_id, 'LAGO NORTE', '2', -15.732341, -15.727849, -47.839466, -47.834799),
        ('LN-70', 'Quadrante 70', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.895463, -47.890796),
        ('LN-71', 'Quadrante 71', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.890796, -47.886130),
        ('LN-72', 'Quadrante 72', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.886130, -47.881464),
        ('LN-73', 'Quadrante 73', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.881464, -47.876797),
        ('LN-74', 'Quadrante 74', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.876797, -47.872131),
        ('LN-75', 'Quadrante 75', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.872131, -47.867464),
        ('LN-76', 'Quadrante 76', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.867464, -47.862798),
        ('LN-77', 'Quadrante 77', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.853465, -47.848799),
        ('LN-78', 'Quadrante 78', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.848799, -47.844132),
        ('LN-79', 'Quadrante 79', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.844132, -47.839466),
        ('LN-80', 'Quadrante 80', v_product_id, 'LAGO NORTE', '2', -15.727849, -15.723358, -47.839466, -47.834799),
        ('LN-81', 'Quadrante 81', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.890796, -47.886130),
        ('LN-82', 'Quadrante 82', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.886130, -47.881464),
        ('LN-83', 'Quadrante 83', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.881464, -47.876797),
        ('LN-84', 'Quadrante 84', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.876797, -47.872131),
        ('LN-85', 'Quadrante 85', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.872131, -47.867464),
        ('LN-86', 'Quadrante 86', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.867464, -47.862798),
        ('LN-87', 'Quadrante 87', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.862798, -47.858131),
        ('LN-88', 'Quadrante 88', v_product_id, 'LAGO NORTE', '2', -15.723358, -15.718866, -47.858131, -47.853465),
        ('LN-89', 'Quadrante 89', v_product_id, 'LAGO NORTE', '2', -15.718866, -15.714375, -47.895463, -47.890796),
        ('LN-90', 'Quadrante 90', v_product_id, 'LAGO NORTE', '2', -15.718866, -15.714375, -47.890796, -47.886130),
        ('LN-91', 'Quadrante 91', v_product_id, 'LAGO NORTE', '2', -15.718866, -15.714375, -47.886130, -47.881464),
        ('LN-92', 'Quadrante 92', v_product_id, 'LAGO NORTE', '2', -15.718866, -15.714375, -47.881464, -47.876797),
        ('LN-93', 'Quadrante 93', v_product_id, 'LAGO NORTE', '2', -15.718866, -15.714375, -47.867464, -47.862798),
        ('LN-94', 'Quadrante 94', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.895463, -47.890796),
        ('LN-95', 'Quadrante 95', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.890796, -47.886130),
        ('LN-96', 'Quadrante 96', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.886130, -47.881464),
        ('LN-97', 'Quadrante 97', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.867464, -47.862798),
        ('LN-98', 'Quadrante 98', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.862798, -47.858131),
        ('LN-99', 'Quadrante 99', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.858131, -47.853465),
        ('LN-100', 'Quadrante 100', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.820800, -47.816134),
        ('LN-101', 'Quadrante 101', v_product_id, 'LAGO NORTE', '2', -15.714375, -15.709883, -47.816134, -47.811467),
        ('LN-102', 'Quadrante 102', v_product_id, 'LAGO NORTE', '2', -15.709883, -15.705392, -47.918795, -47.914129),
        ('LN-103', 'Quadrante 103', v_product_id, 'LAGO NORTE', '2', -15.709883, -15.705392, -47.914129, -47.909462),
        ('LN-104', 'Quadrante 104', v_product_id, 'LAGO NORTE', '2', -15.709883, -15.705392, -47.867464, -47.862798),
        ('LN-105', 'Quadrante 105', v_product_id, 'LAGO NORTE', '2', -15.709883, -15.705392, -47.820800, -47.816134),
        ('LN-106', 'Quadrante 106', v_product_id, 'LAGO NORTE', '2', -15.705392, -15.700900, -47.918795, -47.914129),
        ('LN-107', 'Quadrante 107', v_product_id, 'LAGO NORTE', '2', -15.705392, -15.700900, -47.900129, -47.895463),
        ('LN-108', 'Quadrante 108', v_product_id, 'LAGO NORTE', '2', -15.705392, -15.700900, -47.876797, -47.872131),
        ('LN-109', 'Quadrante 109', v_product_id, 'LAGO NORTE', '2', -15.705392, -15.700900, -47.872131, -47.867464),
        ('LN-110', 'Quadrante 110', v_product_id, 'LAGO NORTE', '2', -15.705392, -15.700900, -47.825466, -47.820800),
        ('LN-111', 'Quadrante 111', v_product_id, 'LAGO NORTE', '2', -15.700900, -15.696409, -47.914129, -47.909462),
        ('LN-112', 'Quadrante 112', v_product_id, 'LAGO NORTE', '2', -15.700900, -15.696409, -47.900129, -47.895463),
        ('LN-113', 'Quadrante 113', v_product_id, 'LAGO NORTE', '2', -15.700900, -15.696409, -47.881464, -47.876797),
        ('LN-114', 'Quadrante 114', v_product_id, 'LAGO NORTE', '2', -15.700900, -15.696409, -47.876797, -47.872131),
        ('LN-115', 'Quadrante 115', v_product_id, 'LAGO NORTE', '2', -15.700900, -15.696409, -47.872131, -47.867464),
        ('LN-116', 'Quadrante 116', v_product_id, 'LAGO NORTE', '2', -15.696409, -15.691917, -47.886130, -47.881464),
        ('LN-117', 'Quadrante 117', v_product_id, 'LAGO NORTE', '2', -15.696409, -15.691917, -47.881464, -47.876797),
        ('LN-118', 'Quadrante 118', v_product_id, 'LAGO NORTE', '2', -15.696409, -15.691917, -47.872131, -47.867464),
        ('LN-119', 'Quadrante 119', v_product_id, 'LAGO NORTE', '2', -15.696409, -15.691917, -47.867464, -47.862798),
        ('LN-120', 'Quadrante 120', v_product_id, 'LAGO NORTE', '2', -15.696409, -15.691917, -47.848799, -47.844132),
        ('LN-121', 'Quadrante 121', v_product_id, 'LAGO NORTE', '2', -15.696409, -15.691917, -47.844132, -47.839466),
        ('LN-122', 'Quadrante 122', v_product_id, 'LAGO NORTE', '2', -15.691917, -15.687425, -47.862798, -47.858131);
END $$;

-- ------------------------------------------------------------
-- ARAPOANGA (ARA) — 35 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'ARAPOANGA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — ARAPOANGA', 'ARAPOANGA', '6')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('ARA-01', 'Quadrante 1', v_product_id, 'ARAPOANGA', '6', -15.672359, -15.667867, -47.660714, -47.656050),
        ('ARA-02', 'Quadrante 2', v_product_id, 'ARAPOANGA', '6', -15.663376, -15.658884, -47.660714, -47.656050),
        ('ARA-03', 'Quadrante 3', v_product_id, 'ARAPOANGA', '6', -15.663376, -15.658884, -47.656050, -47.651385),
        ('ARA-04', 'Quadrante 4', v_product_id, 'ARAPOANGA', '6', -15.663376, -15.658884, -47.651385, -47.646721),
        ('ARA-05', 'Quadrante 5', v_product_id, 'ARAPOANGA', '6', -15.663376, -15.658884, -47.646721, -47.642056),
        ('ARA-06', 'Quadrante 6', v_product_id, 'ARAPOANGA', '6', -15.658884, -15.654393, -47.660714, -47.656050),
        ('ARA-07', 'Quadrante 7', v_product_id, 'ARAPOANGA', '6', -15.658884, -15.654393, -47.656050, -47.651385),
        ('ARA-08', 'Quadrante 8', v_product_id, 'ARAPOANGA', '6', -15.658884, -15.654393, -47.651385, -47.646721),
        ('ARA-09', 'Quadrante 9', v_product_id, 'ARAPOANGA', '6', -15.654393, -15.649901, -47.660714, -47.656050),
        ('ARA-10', 'Quadrante 10', v_product_id, 'ARAPOANGA', '6', -15.654393, -15.649901, -47.656050, -47.651385),
        ('ARA-11', 'Quadrante 11', v_product_id, 'ARAPOANGA', '6', -15.654393, -15.649901, -47.651385, -47.646721),
        ('ARA-12', 'Quadrante 12', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.670043, -47.665379),
        ('ARA-13', 'Quadrante 13', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.651385, -47.646721),
        ('ARA-14', 'Quadrante 14', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.646721, -47.642056),
        ('ARA-15', 'Quadrante 15', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.642056, -47.637392),
        ('ARA-16', 'Quadrante 16', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.637392, -47.632727),
        ('ARA-17', 'Quadrante 17', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.632727, -47.628063),
        ('ARA-18', 'Quadrante 18', v_product_id, 'ARAPOANGA', '6', -15.649901, -15.645410, -47.628063, -47.623398),
        ('ARA-19', 'Quadrante 19', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.660714, -47.656050),
        ('ARA-20', 'Quadrante 20', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.656050, -47.651385),
        ('ARA-21', 'Quadrante 21', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.651385, -47.646721),
        ('ARA-22', 'Quadrante 22', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.646721, -47.642056),
        ('ARA-23', 'Quadrante 23', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.642056, -47.637392),
        ('ARA-24', 'Quadrante 24', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.637392, -47.632727),
        ('ARA-25', 'Quadrante 25', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.632727, -47.628063),
        ('ARA-26', 'Quadrante 26', v_product_id, 'ARAPOANGA', '6', -15.645410, -15.640918, -47.628063, -47.623398),
        ('ARA-27', 'Quadrante 27', v_product_id, 'ARAPOANGA', '6', -15.640918, -15.636426, -47.656050, -47.651385),
        ('ARA-28', 'Quadrante 28', v_product_id, 'ARAPOANGA', '6', -15.640918, -15.636426, -47.651385, -47.646721),
        ('ARA-29', 'Quadrante 29', v_product_id, 'ARAPOANGA', '6', -15.640918, -15.636426, -47.646721, -47.642056),
        ('ARA-30', 'Quadrante 30', v_product_id, 'ARAPOANGA', '6', -15.640918, -15.636426, -47.642056, -47.637392),
        ('ARA-31', 'Quadrante 31', v_product_id, 'ARAPOANGA', '6', -15.640918, -15.636426, -47.637392, -47.632727),
        ('ARA-32', 'Quadrante 32', v_product_id, 'ARAPOANGA', '6', -15.636426, -15.631935, -47.651385, -47.646721),
        ('ARA-33', 'Quadrante 33', v_product_id, 'ARAPOANGA', '6', -15.636426, -15.631935, -47.646721, -47.642056),
        ('ARA-34', 'Quadrante 34', v_product_id, 'ARAPOANGA', '6', -15.636426, -15.631935, -47.642056, -47.637392),
        ('ARA-35', 'Quadrante 35', v_product_id, 'ARAPOANGA', '6', -15.636426, -15.631935, -47.637392, -47.632727);
END $$;

-- ------------------------------------------------------------
-- NÚCLEO BANDEIRANTE (NB) — 19 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'NÚCLEO BANDEIRANTE' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — NÚCLEO BANDEIRANTE', 'NÚCLEO BANDEIRANTE', '10')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('NB-01', 'Quadrante 1', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.883752, -15.879261, -47.977133, -47.972464),
        ('NB-02', 'Quadrante 2', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.879261, -15.874769, -47.995811, -47.991141),
        ('NB-03', 'Quadrante 3', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.879261, -15.874769, -47.991141, -47.986472),
        ('NB-04', 'Quadrante 4', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.879261, -15.874769, -47.981803, -47.977133),
        ('NB-05', 'Quadrante 5', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.879261, -15.874769, -47.977133, -47.972464),
        ('NB-06', 'Quadrante 6', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.879261, -15.874769, -47.972464, -47.967794),
        ('NB-07', 'Quadrante 7', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.879261, -15.874769, -47.967794, -47.963125),
        ('NB-08', 'Quadrante 8', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.874769, -15.870278, -47.977133, -47.972464),
        ('NB-09', 'Quadrante 9', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.874769, -15.870278, -47.972464, -47.967794),
        ('NB-10', 'Quadrante 10', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.874769, -15.870278, -47.967794, -47.963125),
        ('NB-11', 'Quadrante 11', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.874769, -15.870278, -47.963125, -47.958455),
        ('NB-12', 'Quadrante 12', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.870278, -15.865786, -47.977133, -47.972464),
        ('NB-13', 'Quadrante 13', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.870278, -15.865786, -47.972464, -47.967794),
        ('NB-14', 'Quadrante 14', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.870278, -15.865786, -47.967794, -47.963125),
        ('NB-15', 'Quadrante 15', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.870278, -15.865786, -47.963125, -47.958455),
        ('NB-16', 'Quadrante 16', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.861295, -15.856803, -47.963125, -47.958455),
        ('NB-17', 'Quadrante 17', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.861295, -15.856803, -47.958455, -47.954545),
        ('NB-18', 'Quadrante 18', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.856803, -15.852312, -47.963125, -47.958455),
        ('NB-19', 'Quadrante 19', v_product_id, 'NÚCLEO BANDEIRANTE', '10', -15.856803, -15.852312, -47.958455, -47.954545);
END $$;

-- ------------------------------------------------------------
-- ÁGUAS CLARAS (AC) — 39 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'ÁGUAS CLARAS' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — ÁGUAS CLARAS', 'ÁGUAS CLARAS', '15')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('AC-01', 'Quadrante 1', v_product_id, 'ÁGUAS CLARAS', '15', -15.850519, -15.846028, -48.036329, -48.031660),
        ('AC-02', 'Quadrante 2', v_product_id, 'ÁGUAS CLARAS', '15', -15.846028, -15.841536, -48.040998, -48.036329),
        ('AC-03', 'Quadrante 3', v_product_id, 'ÁGUAS CLARAS', '15', -15.846028, -15.841536, -48.036329, -48.031660),
        ('AC-04', 'Quadrante 4', v_product_id, 'ÁGUAS CLARAS', '15', -15.846028, -15.841536, -48.031660, -48.026991),
        ('AC-05', 'Quadrante 5', v_product_id, 'ÁGUAS CLARAS', '15', -15.846028, -15.841536, -48.026991, -48.022323),
        ('AC-06', 'Quadrante 6', v_product_id, 'ÁGUAS CLARAS', '15', -15.846028, -15.841536, -48.022323, -48.017654),
        ('AC-07', 'Quadrante 7', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.040998, -48.036329),
        ('AC-08', 'Quadrante 8', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.036329, -48.031660),
        ('AC-09', 'Quadrante 9', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.031660, -48.026991),
        ('AC-10', 'Quadrante 10', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.026991, -48.022323),
        ('AC-11', 'Quadrante 11', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.022323, -48.017654),
        ('AC-12', 'Quadrante 12', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.017654, -48.012985),
        ('AC-13', 'Quadrante 13', v_product_id, 'ÁGUAS CLARAS', '15', -15.841536, -15.837045, -48.012985, -48.008317),
        ('AC-14', 'Quadrante 14', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.050335, -48.045666),
        ('AC-15', 'Quadrante 15', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.045666, -48.040998),
        ('AC-16', 'Quadrante 16', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.040998, -48.036329),
        ('AC-17', 'Quadrante 17', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.036329, -48.031660),
        ('AC-18', 'Quadrante 18', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.031660, -48.026991),
        ('AC-19', 'Quadrante 19', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.026991, -48.022323),
        ('AC-20', 'Quadrante 20', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.022323, -48.017654),
        ('AC-21', 'Quadrante 21', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.017654, -48.012985),
        ('AC-22', 'Quadrante 22', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.012985, -48.008317),
        ('AC-23', 'Quadrante 23', v_product_id, 'ÁGUAS CLARAS', '15', -15.837045, -15.832553, -48.008317, -48.003648),
        ('AC-24', 'Quadrante 24', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.040998, -48.036329),
        ('AC-25', 'Quadrante 25', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.036329, -48.031660),
        ('AC-26', 'Quadrante 26', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.031660, -48.026991),
        ('AC-27', 'Quadrante 27', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.026991, -48.022323),
        ('AC-28', 'Quadrante 28', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.022323, -48.017654),
        ('AC-29', 'Quadrante 29', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.017654, -48.012985),
        ('AC-30', 'Quadrante 30', v_product_id, 'ÁGUAS CLARAS', '15', -15.832553, -15.828062, -48.012985, -48.008317),
        ('AC-31', 'Quadrante 31', v_product_id, 'ÁGUAS CLARAS', '15', -15.828062, -15.823570, -48.026991, -48.022323),
        ('AC-32', 'Quadrante 32', v_product_id, 'ÁGUAS CLARAS', '15', -15.828062, -15.823570, -48.022323, -48.017654),
        ('AC-33', 'Quadrante 33', v_product_id, 'ÁGUAS CLARAS', '15', -15.828062, -15.823570, -48.017654, -48.012985),
        ('AC-34', 'Quadrante 34', v_product_id, 'ÁGUAS CLARAS', '15', -15.823570, -15.819079, -48.022323, -48.017654),
        ('AC-35', 'Quadrante 35', v_product_id, 'ÁGUAS CLARAS', '15', -15.823570, -15.819079, -48.017654, -48.012985),
        ('AC-36', 'Quadrante 36', v_product_id, 'ÁGUAS CLARAS', '15', -15.823570, -15.819079, -48.012985, -48.008317),
        ('AC-37', 'Quadrante 37', v_product_id, 'ÁGUAS CLARAS', '15', -15.819079, -15.814633, -48.012985, -48.008317),
        ('AC-38', 'Quadrante 38', v_product_id, 'ÁGUAS CLARAS', '15', -15.819079, -15.814633, -48.008317, -48.003648),
        ('AC-39', 'Quadrante 39', v_product_id, 'ÁGUAS CLARAS', '15', -15.819079, -15.814633, -48.003648, -48.000847);
END $$;

-- ------------------------------------------------------------
-- SUDOESTE/OCTOGONAL (SO) — 26 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SUDOESTE/OCTOGONAL' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SUDOESTE/OCTOGONAL', 'SUDOESTE/OCTOGONAL', '11')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SO-01', 'Quadrante 1', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.811059, -15.806567, -47.948400, -47.943733),
        ('SO-02', 'Quadrante 2', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.811059, -15.806567, -47.943733, -47.939065),
        ('SO-03', 'Quadrante 3', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.811059, -15.806567, -47.939065, -47.934397),
        ('SO-04', 'Quadrante 4', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.806567, -15.802076, -47.948400, -47.943733),
        ('SO-05', 'Quadrante 5', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.806567, -15.802076, -47.943733, -47.939065),
        ('SO-06', 'Quadrante 6', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.806567, -15.802076, -47.934397, -47.929729),
        ('SO-07', 'Quadrante 7', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.806567, -15.802076, -47.929729, -47.925061),
        ('SO-08', 'Quadrante 8', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.802076, -15.797584, -47.934397, -47.929729),
        ('SO-09', 'Quadrante 9', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.802076, -15.797584, -47.929729, -47.925061),
        ('SO-10', 'Quadrante 10', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.802076, -15.797584, -47.925061, -47.920394),
        ('SO-11', 'Quadrante 11', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.802076, -15.797584, -47.920394, -47.915726),
        ('SO-12', 'Quadrante 12', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.797584, -15.793093, -47.934397, -47.929729),
        ('SO-13', 'Quadrante 13', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.797584, -15.793093, -47.929729, -47.925061),
        ('SO-14', 'Quadrante 14', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.797584, -15.793093, -47.925061, -47.920394),
        ('SO-15', 'Quadrante 15', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.797584, -15.793093, -47.920394, -47.915726),
        ('SO-16', 'Quadrante 16', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.797584, -15.793093, -47.915726, -47.911058),
        ('SO-17', 'Quadrante 17', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.793093, -15.788601, -47.934397, -47.929729),
        ('SO-18', 'Quadrante 18', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.793093, -15.788601, -47.929729, -47.925061),
        ('SO-19', 'Quadrante 19', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.793093, -15.788601, -47.925061, -47.920394),
        ('SO-20', 'Quadrante 20', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.793093, -15.788601, -47.920394, -47.915726),
        ('SO-21', 'Quadrante 21', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.793093, -15.788601, -47.915726, -47.911058),
        ('SO-22', 'Quadrante 22', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.793093, -15.788601, -47.911058, -47.908475),
        ('SO-23', 'Quadrante 23', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.788601, -15.784110, -47.929729, -47.925061),
        ('SO-24', 'Quadrante 24', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.788601, -15.784110, -47.925061, -47.920394),
        ('SO-25', 'Quadrante 25', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.788601, -15.784110, -47.920394, -47.915726),
        ('SO-26', 'Quadrante 26', v_product_id, 'SUDOESTE/OCTOGONAL', '11', -15.784110, -15.780173, -47.929729, -47.925061);
END $$;

-- ------------------------------------------------------------
-- PLANO PILOTO (PP) — 329 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'PLANO PILOTO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — PLANO PILOTO', 'PLANO PILOTO', '1, 11, 14')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('PP-01', 'Quadrante 1', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.850586, -15.846095, -47.926398, -47.921732),
        ('PP-02', 'Quadrante 2', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.945062, -47.940396),
        ('PP-03', 'Quadrante 3', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.940396, -47.935730),
        ('PP-04', 'Quadrante 4', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.935730, -47.931064),
        ('PP-05', 'Quadrante 5', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.931064, -47.926398),
        ('PP-06', 'Quadrante 6', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.926398, -47.921732),
        ('PP-07', 'Quadrante 7', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.921732, -47.917066),
        ('PP-08', 'Quadrante 8', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.917066, -47.912400),
        ('PP-09', 'Quadrante 9', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.846095, -15.841603, -47.912400, -47.907734),
        ('PP-10', 'Quadrante 10', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.954394, -47.949728),
        ('PP-11', 'Quadrante 11', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.949728, -47.945062),
        ('PP-12', 'Quadrante 12', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.945062, -47.940396),
        ('PP-13', 'Quadrante 13', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.940396, -47.935730),
        ('PP-14', 'Quadrante 14', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.935730, -47.931064),
        ('PP-15', 'Quadrante 15', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.931064, -47.926398),
        ('PP-16', 'Quadrante 16', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.926398, -47.921732),
        ('PP-17', 'Quadrante 17', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.921732, -47.917066),
        ('PP-18', 'Quadrante 18', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.917066, -47.912400),
        ('PP-19', 'Quadrante 19', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.841603, -15.837112, -47.912400, -47.907734),
        ('PP-20', 'Quadrante 20', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.954394, -47.949728),
        ('PP-21', 'Quadrante 21', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.949728, -47.945062),
        ('PP-22', 'Quadrante 22', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.945062, -47.940396),
        ('PP-23', 'Quadrante 23', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.940396, -47.935730),
        ('PP-24', 'Quadrante 24', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.935730, -47.931064),
        ('PP-25', 'Quadrante 25', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.931064, -47.926398),
        ('PP-26', 'Quadrante 26', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.926398, -47.921732),
        ('PP-27', 'Quadrante 27', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.921732, -47.917066),
        ('PP-28', 'Quadrante 28', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.917066, -47.912400),
        ('PP-29', 'Quadrante 29', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.912400, -47.907734),
        ('PP-30', 'Quadrante 30', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.907734, -47.903068),
        ('PP-31', 'Quadrante 31', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.903068, -47.898401),
        ('PP-32', 'Quadrante 32', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.837112, -15.832620, -47.898401, -47.893735),
        ('PP-33', 'Quadrante 33', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.949728, -47.945062),
        ('PP-34', 'Quadrante 34', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.945062, -47.940396),
        ('PP-35', 'Quadrante 35', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.940396, -47.935730),
        ('PP-36', 'Quadrante 36', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.935730, -47.931064),
        ('PP-37', 'Quadrante 37', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.931064, -47.926398),
        ('PP-38', 'Quadrante 38', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.926398, -47.921732),
        ('PP-39', 'Quadrante 39', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.921732, -47.917066),
        ('PP-40', 'Quadrante 40', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.917066, -47.912400),
        ('PP-41', 'Quadrante 41', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.912400, -47.907734),
        ('PP-42', 'Quadrante 42', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.907734, -47.903068),
        ('PP-43', 'Quadrante 43', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.903068, -47.898401),
        ('PP-44', 'Quadrante 44', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.898401, -47.893735),
        ('PP-45', 'Quadrante 45', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.832620, -15.828128, -47.893735, -47.889069),
        ('PP-46', 'Quadrante 46', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.949728, -47.945062),
        ('PP-47', 'Quadrante 47', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.945062, -47.940396),
        ('PP-48', 'Quadrante 48', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.940396, -47.935730),
        ('PP-49', 'Quadrante 49', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.935730, -47.931064),
        ('PP-50', 'Quadrante 50', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.931064, -47.926398),
        ('PP-51', 'Quadrante 51', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.926398, -47.921732),
        ('PP-52', 'Quadrante 52', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.921732, -47.917066),
        ('PP-53', 'Quadrante 53', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.917066, -47.912400),
        ('PP-54', 'Quadrante 54', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.912400, -47.907734),
        ('PP-55', 'Quadrante 55', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.907734, -47.903068),
        ('PP-56', 'Quadrante 56', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.903068, -47.898401),
        ('PP-57', 'Quadrante 57', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.898401, -47.893735),
        ('PP-58', 'Quadrante 58', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.893735, -47.889069),
        ('PP-59', 'Quadrante 59', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.828128, -15.823637, -47.889069, -47.884403),
        ('PP-60', 'Quadrante 60', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.949728, -47.945062),
        ('PP-61', 'Quadrante 61', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.945062, -47.940396),
        ('PP-62', 'Quadrante 62', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.940396, -47.935730),
        ('PP-63', 'Quadrante 63', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.935730, -47.931064),
        ('PP-64', 'Quadrante 64', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.931064, -47.926398),
        ('PP-65', 'Quadrante 65', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.926398, -47.921732),
        ('PP-66', 'Quadrante 66', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.921732, -47.917066),
        ('PP-67', 'Quadrante 67', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.917066, -47.912400),
        ('PP-68', 'Quadrante 68', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.912400, -47.907734),
        ('PP-69', 'Quadrante 69', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.907734, -47.903068),
        ('PP-70', 'Quadrante 70', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.903068, -47.898401),
        ('PP-71', 'Quadrante 71', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.898401, -47.893735),
        ('PP-72', 'Quadrante 72', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.893735, -47.889069),
        ('PP-73', 'Quadrante 73', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.889069, -47.884403),
        ('PP-74', 'Quadrante 74', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.823637, -15.819145, -47.884403, -47.879737),
        ('PP-75', 'Quadrante 75', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.949728, -47.945062),
        ('PP-76', 'Quadrante 76', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.945062, -47.940396),
        ('PP-77', 'Quadrante 77', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.940396, -47.935730),
        ('PP-78', 'Quadrante 78', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.935730, -47.931064),
        ('PP-79', 'Quadrante 79', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.931064, -47.926398),
        ('PP-80', 'Quadrante 80', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.926398, -47.921732),
        ('PP-81', 'Quadrante 81', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.917066, -47.912400),
        ('PP-82', 'Quadrante 82', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.912400, -47.907734),
        ('PP-83', 'Quadrante 83', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.907734, -47.903068),
        ('PP-84', 'Quadrante 84', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.903068, -47.898401),
        ('PP-85', 'Quadrante 85', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.898401, -47.893735),
        ('PP-86', 'Quadrante 86', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.893735, -47.889069),
        ('PP-87', 'Quadrante 87', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.889069, -47.884403),
        ('PP-88', 'Quadrante 88', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.884403, -47.879737),
        ('PP-89', 'Quadrante 89', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.879737, -47.875071),
        ('PP-90', 'Quadrante 90', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.875071, -47.870405),
        ('PP-91', 'Quadrante 91', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.870405, -47.865739),
        ('PP-92', 'Quadrante 92', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.865739, -47.861073),
        ('PP-93', 'Quadrante 93', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.861073, -47.856407),
        ('PP-94', 'Quadrante 94', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.856407, -47.851741),
        ('PP-95', 'Quadrante 95', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.851741, -47.847075),
        ('PP-96', 'Quadrante 96', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.847075, -47.842409),
        ('PP-97', 'Quadrante 97', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.819145, -15.814654, -47.842409, -47.837743),
        ('PP-98', 'Quadrante 98', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.949728, -47.945062),
        ('PP-99', 'Quadrante 99', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.945062, -47.940396),
        ('PP-100', 'Quadrante 100', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.940396, -47.935730),
        ('PP-101', 'Quadrante 101', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.935730, -47.931064),
        ('PP-102', 'Quadrante 102', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.931064, -47.926398),
        ('PP-103', 'Quadrante 103', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.926398, -47.921732),
        ('PP-104', 'Quadrante 104', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.921732, -47.917066),
        ('PP-105', 'Quadrante 105', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.917066, -47.912400),
        ('PP-106', 'Quadrante 106', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.912400, -47.907734),
        ('PP-107', 'Quadrante 107', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.907734, -47.903068),
        ('PP-108', 'Quadrante 108', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.903068, -47.898401),
        ('PP-109', 'Quadrante 109', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.898401, -47.893735),
        ('PP-110', 'Quadrante 110', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.893735, -47.889069),
        ('PP-111', 'Quadrante 111', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.889069, -47.884403),
        ('PP-112', 'Quadrante 112', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.884403, -47.879737),
        ('PP-113', 'Quadrante 113', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.879737, -47.875071),
        ('PP-114', 'Quadrante 114', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.870405, -47.865739),
        ('PP-115', 'Quadrante 115', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.856407, -47.851741),
        ('PP-116', 'Quadrante 116', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.847075, -47.842409),
        ('PP-117', 'Quadrante 117', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.837743, -47.833077),
        ('PP-118', 'Quadrante 118', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.814654, -15.810162, -47.833077, -47.828411),
        ('PP-119', 'Quadrante 119', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.931064, -47.926398),
        ('PP-120', 'Quadrante 120', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.926398, -47.921732),
        ('PP-121', 'Quadrante 121', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.921732, -47.917066),
        ('PP-122', 'Quadrante 122', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.917066, -47.912400),
        ('PP-123', 'Quadrante 123', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.912400, -47.907734),
        ('PP-124', 'Quadrante 124', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.907734, -47.903068),
        ('PP-125', 'Quadrante 125', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.903068, -47.898401),
        ('PP-126', 'Quadrante 126', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.898401, -47.893735),
        ('PP-127', 'Quadrante 127', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.893735, -47.889069),
        ('PP-128', 'Quadrante 128', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.889069, -47.884403),
        ('PP-129', 'Quadrante 129', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.884403, -47.879737),
        ('PP-130', 'Quadrante 130', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.875071, -47.870405),
        ('PP-131', 'Quadrante 131', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.870405, -47.865739),
        ('PP-132', 'Quadrante 132', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.837743, -47.833077),
        ('PP-133', 'Quadrante 133', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.810162, -15.805671, -47.833077, -47.828411),
        ('PP-134', 'Quadrante 134', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.921732, -47.917066),
        ('PP-135', 'Quadrante 135', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.917066, -47.912400),
        ('PP-136', 'Quadrante 136', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.912400, -47.907734),
        ('PP-137', 'Quadrante 137', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.907734, -47.903068),
        ('PP-138', 'Quadrante 138', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.903068, -47.898401),
        ('PP-139', 'Quadrante 139', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.898401, -47.893735),
        ('PP-140', 'Quadrante 140', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.893735, -47.889069),
        ('PP-141', 'Quadrante 141', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.889069, -47.884403),
        ('PP-142', 'Quadrante 142', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.884403, -47.879737),
        ('PP-143', 'Quadrante 143', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.879737, -47.875071),
        ('PP-144', 'Quadrante 144', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.875071, -47.870405),
        ('PP-145', 'Quadrante 145', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.870405, -47.865739),
        ('PP-146', 'Quadrante 146', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.865739, -47.861073),
        ('PP-147', 'Quadrante 147', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.805671, -15.801179, -47.833077, -47.828411),
        ('PP-148', 'Quadrante 148', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.912400, -47.907734),
        ('PP-149', 'Quadrante 149', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.907734, -47.903068),
        ('PP-150', 'Quadrante 150', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.903068, -47.898401),
        ('PP-151', 'Quadrante 151', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.893735, -47.889069),
        ('PP-152', 'Quadrante 152', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.889069, -47.884403),
        ('PP-153', 'Quadrante 153', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.884403, -47.879737),
        ('PP-154', 'Quadrante 154', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.879737, -47.875071),
        ('PP-155', 'Quadrante 155', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.875071, -47.870405),
        ('PP-156', 'Quadrante 156', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.870405, -47.865739),
        ('PP-157', 'Quadrante 157', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.865739, -47.861073),
        ('PP-158', 'Quadrante 158', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.801179, -15.796688, -47.861073, -47.856407),
        ('PP-159', 'Quadrante 159', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.912400, -47.907734),
        ('PP-160', 'Quadrante 160', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.907734, -47.903068),
        ('PP-161', 'Quadrante 161', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.903068, -47.898401),
        ('PP-162', 'Quadrante 162', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.898401, -47.893735),
        ('PP-163', 'Quadrante 163', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.893735, -47.889069),
        ('PP-164', 'Quadrante 164', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.889069, -47.884403),
        ('PP-165', 'Quadrante 165', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.884403, -47.879737),
        ('PP-166', 'Quadrante 166', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.879737, -47.875071),
        ('PP-167', 'Quadrante 167', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.875071, -47.870405),
        ('PP-168', 'Quadrante 168', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.870405, -47.865739),
        ('PP-169', 'Quadrante 169', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.865739, -47.861073),
        ('PP-170', 'Quadrante 170', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.861073, -47.856407),
        ('PP-171', 'Quadrante 171', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.856407, -47.851741),
        ('PP-172', 'Quadrante 172', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.851741, -47.847075),
        ('PP-173', 'Quadrante 173', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.847075, -47.842409),
        ('PP-174', 'Quadrante 174', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.796688, -15.792196, -47.842409, -47.837743),
        ('PP-175', 'Quadrante 175', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.907734, -47.903068),
        ('PP-176', 'Quadrante 176', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.903068, -47.898401),
        ('PP-177', 'Quadrante 177', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.898401, -47.893735),
        ('PP-178', 'Quadrante 178', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.893735, -47.889069),
        ('PP-179', 'Quadrante 179', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.889069, -47.884403),
        ('PP-180', 'Quadrante 180', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.884403, -47.879737),
        ('PP-181', 'Quadrante 181', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.879737, -47.875071),
        ('PP-182', 'Quadrante 182', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.875071, -47.870405),
        ('PP-183', 'Quadrante 183', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.870405, -47.865739),
        ('PP-184', 'Quadrante 184', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.856407, -47.851741),
        ('PP-185', 'Quadrante 185', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.851741, -47.847075),
        ('PP-186', 'Quadrante 186', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.847075, -47.842409),
        ('PP-187', 'Quadrante 187', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.842409, -47.837743),
        ('PP-188', 'Quadrante 188', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.837743, -47.833077),
        ('PP-189', 'Quadrante 189', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.833077, -47.828411),
        ('PP-190', 'Quadrante 190', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.792196, -15.787704, -47.828411, -47.823745),
        ('PP-191', 'Quadrante 191', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.912400, -47.907734),
        ('PP-192', 'Quadrante 192', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.907734, -47.903068),
        ('PP-193', 'Quadrante 193', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.903068, -47.898401),
        ('PP-194', 'Quadrante 194', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.898401, -47.893735),
        ('PP-195', 'Quadrante 195', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.893735, -47.889069),
        ('PP-196', 'Quadrante 196', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.889069, -47.884403),
        ('PP-197', 'Quadrante 197', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.884403, -47.879737),
        ('PP-198', 'Quadrante 198', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.879737, -47.875071),
        ('PP-199', 'Quadrante 199', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.875071, -47.870405),
        ('PP-200', 'Quadrante 200', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.870405, -47.865739),
        ('PP-201', 'Quadrante 201', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.856407, -47.851741),
        ('PP-202', 'Quadrante 202', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.787704, -15.783213, -47.851741, -47.847075),
        ('PP-203', 'Quadrante 203', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.926398, -47.921732),
        ('PP-204', 'Quadrante 204', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.921732, -47.917066),
        ('PP-205', 'Quadrante 205', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.917066, -47.912400),
        ('PP-206', 'Quadrante 206', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.912400, -47.907734),
        ('PP-207', 'Quadrante 207', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.907734, -47.903068),
        ('PP-208', 'Quadrante 208', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.903068, -47.898401),
        ('PP-209', 'Quadrante 209', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.898401, -47.893735),
        ('PP-210', 'Quadrante 210', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.893735, -47.889069),
        ('PP-211', 'Quadrante 211', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.889069, -47.884403),
        ('PP-212', 'Quadrante 212', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.884403, -47.879737),
        ('PP-213', 'Quadrante 213', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.879737, -47.875071),
        ('PP-214', 'Quadrante 214', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.783213, -15.778721, -47.875071, -47.870405),
        ('PP-215', 'Quadrante 215', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.940396, -47.935730),
        ('PP-216', 'Quadrante 216', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.935730, -47.931064),
        ('PP-217', 'Quadrante 217', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.931064, -47.926398),
        ('PP-218', 'Quadrante 218', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.926398, -47.921732),
        ('PP-219', 'Quadrante 219', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.921732, -47.917066),
        ('PP-220', 'Quadrante 220', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.917066, -47.912400),
        ('PP-221', 'Quadrante 221', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.912400, -47.907734),
        ('PP-222', 'Quadrante 222', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.907734, -47.903068),
        ('PP-223', 'Quadrante 223', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.903068, -47.898401),
        ('PP-224', 'Quadrante 224', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.898401, -47.893735),
        ('PP-225', 'Quadrante 225', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.893735, -47.889069),
        ('PP-226', 'Quadrante 226', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.889069, -47.884403),
        ('PP-227', 'Quadrante 227', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.884403, -47.879737),
        ('PP-228', 'Quadrante 228', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.879737, -47.875071),
        ('PP-229', 'Quadrante 229', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.875071, -47.870405),
        ('PP-230', 'Quadrante 230', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.778721, -15.774230, -47.861073, -47.856407),
        ('PP-231', 'Quadrante 231', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.935730, -47.931064),
        ('PP-232', 'Quadrante 232', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.931064, -47.926398),
        ('PP-233', 'Quadrante 233', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.926398, -47.921732),
        ('PP-234', 'Quadrante 234', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.921732, -47.917066),
        ('PP-235', 'Quadrante 235', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.917066, -47.912400),
        ('PP-236', 'Quadrante 236', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.912400, -47.907734),
        ('PP-237', 'Quadrante 237', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.907734, -47.903068),
        ('PP-238', 'Quadrante 238', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.903068, -47.898401),
        ('PP-239', 'Quadrante 239', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.898401, -47.893735),
        ('PP-240', 'Quadrante 240', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.893735, -47.889069),
        ('PP-241', 'Quadrante 241', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.889069, -47.884403),
        ('PP-242', 'Quadrante 242', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.884403, -47.879737),
        ('PP-243', 'Quadrante 243', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.879737, -47.875071),
        ('PP-244', 'Quadrante 244', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.875071, -47.870405),
        ('PP-245', 'Quadrante 245', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.865739, -47.861073),
        ('PP-246', 'Quadrante 246', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.861073, -47.856407),
        ('PP-247', 'Quadrante 247', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.774230, -15.769738, -47.856407, -47.851741),
        ('PP-248', 'Quadrante 248', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.935730, -47.931064),
        ('PP-249', 'Quadrante 249', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.931064, -47.926398),
        ('PP-250', 'Quadrante 250', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.926398, -47.921732),
        ('PP-251', 'Quadrante 251', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.921732, -47.917066),
        ('PP-252', 'Quadrante 252', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.917066, -47.912400),
        ('PP-253', 'Quadrante 253', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.912400, -47.907734),
        ('PP-254', 'Quadrante 254', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.898401, -47.893735),
        ('PP-255', 'Quadrante 255', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.893735, -47.889069),
        ('PP-256', 'Quadrante 256', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.889069, -47.884403),
        ('PP-257', 'Quadrante 257', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.884403, -47.879737),
        ('PP-258', 'Quadrante 258', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.879737, -47.875071),
        ('PP-259', 'Quadrante 259', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.875071, -47.870405),
        ('PP-260', 'Quadrante 260', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.870405, -47.865739),
        ('PP-261', 'Quadrante 261', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.865739, -47.861073),
        ('PP-262', 'Quadrante 262', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.769738, -15.765247, -47.861073, -47.856407),
        ('PP-263', 'Quadrante 263', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.931064, -47.926398),
        ('PP-264', 'Quadrante 264', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.926398, -47.921732),
        ('PP-265', 'Quadrante 265', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.921732, -47.917066),
        ('PP-266', 'Quadrante 266', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.917066, -47.912400),
        ('PP-267', 'Quadrante 267', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.912400, -47.907734),
        ('PP-268', 'Quadrante 268', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.898401, -47.893735),
        ('PP-269', 'Quadrante 269', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.893735, -47.889069),
        ('PP-270', 'Quadrante 270', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.889069, -47.884403),
        ('PP-271', 'Quadrante 271', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.884403, -47.879737),
        ('PP-272', 'Quadrante 272', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.879737, -47.875071),
        ('PP-273', 'Quadrante 273', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.875071, -47.870405),
        ('PP-274', 'Quadrante 274', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.870405, -47.865739),
        ('PP-275', 'Quadrante 275', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.865739, -47.861073),
        ('PP-276', 'Quadrante 276', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.765247, -15.760755, -47.861073, -47.856407),
        ('PP-277', 'Quadrante 277', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.917066, -47.912400),
        ('PP-278', 'Quadrante 278', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.912400, -47.907734),
        ('PP-279', 'Quadrante 279', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.903068, -47.898401),
        ('PP-280', 'Quadrante 280', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.898401, -47.893735),
        ('PP-281', 'Quadrante 281', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.893735, -47.889069),
        ('PP-282', 'Quadrante 282', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.889069, -47.884403),
        ('PP-283', 'Quadrante 283', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.884403, -47.879737),
        ('PP-284', 'Quadrante 284', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.879737, -47.875071),
        ('PP-285', 'Quadrante 285', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.875071, -47.870405),
        ('PP-286', 'Quadrante 286', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.760755, -15.756264, -47.870405, -47.865739),
        ('PP-287', 'Quadrante 287', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.912400, -47.907734),
        ('PP-288', 'Quadrante 288', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.898401, -47.893735),
        ('PP-289', 'Quadrante 289', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.893735, -47.889069),
        ('PP-290', 'Quadrante 290', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.889069, -47.884403),
        ('PP-291', 'Quadrante 291', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.884403, -47.879737),
        ('PP-292', 'Quadrante 292', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.879737, -47.875071),
        ('PP-293', 'Quadrante 293', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.875071, -47.870405),
        ('PP-294', 'Quadrante 294', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.756264, -15.751772, -47.870405, -47.865739),
        ('PP-295', 'Quadrante 295', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.917066, -47.912400),
        ('PP-296', 'Quadrante 296', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.912400, -47.907734),
        ('PP-297', 'Quadrante 297', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.903068, -47.898401),
        ('PP-298', 'Quadrante 298', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.898401, -47.893735),
        ('PP-299', 'Quadrante 299', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.893735, -47.889069),
        ('PP-300', 'Quadrante 300', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.889069, -47.884403),
        ('PP-301', 'Quadrante 301', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.884403, -47.879737),
        ('PP-302', 'Quadrante 302', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.879737, -47.875071),
        ('PP-303', 'Quadrante 303', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.875071, -47.870405),
        ('PP-304', 'Quadrante 304', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.751772, -15.747280, -47.823745, -47.819079),
        ('PP-305', 'Quadrante 305', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.917066, -47.912400),
        ('PP-306', 'Quadrante 306', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.912400, -47.907734),
        ('PP-307', 'Quadrante 307', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.903068, -47.898401),
        ('PP-308', 'Quadrante 308', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.898401, -47.893735),
        ('PP-309', 'Quadrante 309', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.893735, -47.889069),
        ('PP-310', 'Quadrante 310', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.889069, -47.884403),
        ('PP-311', 'Quadrante 311', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.884403, -47.879737),
        ('PP-312', 'Quadrante 312', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.747280, -15.742789, -47.879737, -47.875071),
        ('PP-313', 'Quadrante 313', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.917066, -47.912400),
        ('PP-314', 'Quadrante 314', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.912400, -47.907734),
        ('PP-315', 'Quadrante 315', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.903068, -47.898401),
        ('PP-316', 'Quadrante 316', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.898401, -47.893735),
        ('PP-317', 'Quadrante 317', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.893735, -47.889069),
        ('PP-318', 'Quadrante 318', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.889069, -47.884403),
        ('PP-319', 'Quadrante 319', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.742789, -15.738297, -47.884403, -47.879737),
        ('PP-320', 'Quadrante 320', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.738297, -15.733806, -47.907734, -47.903068),
        ('PP-321', 'Quadrante 321', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.738297, -15.733806, -47.903068, -47.898401),
        ('PP-322', 'Quadrante 322', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.738297, -15.733806, -47.898401, -47.893735),
        ('PP-323', 'Quadrante 323', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.738297, -15.733806, -47.893735, -47.889069),
        ('PP-324', 'Quadrante 324', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.738297, -15.733806, -47.889069, -47.884403),
        ('PP-325', 'Quadrante 325', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.738297, -15.733806, -47.884403, -47.879737),
        ('PP-326', 'Quadrante 326', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.733806, -15.729314, -47.903068, -47.898401),
        ('PP-327', 'Quadrante 327', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.733806, -15.729314, -47.898401, -47.893735),
        ('PP-328', 'Quadrante 328', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.733806, -15.729314, -47.893735, -47.889069),
        ('PP-329', 'Quadrante 329', v_product_id, 'PLANO PILOTO', '1, 11, 14', -15.693382, -15.688890, -47.875071, -47.870405);
END $$;

-- ------------------------------------------------------------
-- SOBRADINHO (SOB) — 83 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SOBRADINHO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SOBRADINHO', 'SOBRADINHO', '5')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SOB-01', 'Quadrante 1', v_product_id, 'SOBRADINHO', '5', -15.720431, -15.715939, -47.780214, -47.775550),
        ('SOB-02', 'Quadrante 2', v_product_id, 'SOBRADINHO', '5', -15.720431, -15.715939, -47.770886, -47.766222),
        ('SOB-03', 'Quadrante 3', v_product_id, 'SOBRADINHO', '5', -15.715939, -15.711448, -47.747566, -47.742902),
        ('SOB-04', 'Quadrante 4', v_product_id, 'SOBRADINHO', '5', -15.711448, -15.706956, -47.747566, -47.742902),
        ('SOB-05', 'Quadrante 5', v_product_id, 'SOBRADINHO', '5', -15.706956, -15.702465, -47.756894, -47.752230),
        ('SOB-06', 'Quadrante 6', v_product_id, 'SOBRADINHO', '5', -15.706956, -15.702465, -47.747566, -47.742902),
        ('SOB-07', 'Quadrante 7', v_product_id, 'SOBRADINHO', '5', -15.702465, -15.697973, -47.812862, -47.808198),
        ('SOB-08', 'Quadrante 8', v_product_id, 'SOBRADINHO', '5', -15.702465, -15.697973, -47.808198, -47.803534),
        ('SOB-09', 'Quadrante 9', v_product_id, 'SOBRADINHO', '5', -15.697973, -15.693481, -47.812862, -47.808198),
        ('SOB-10', 'Quadrante 10', v_product_id, 'SOBRADINHO', '5', -15.693481, -15.688990, -47.854838, -47.850174),
        ('SOB-11', 'Quadrante 11', v_product_id, 'SOBRADINHO', '5', -15.693481, -15.688990, -47.850174, -47.845510),
        ('SOB-12', 'Quadrante 12', v_product_id, 'SOBRADINHO', '5', -15.693481, -15.688990, -47.831518, -47.826854),
        ('SOB-13', 'Quadrante 13', v_product_id, 'SOBRADINHO', '5', -15.693481, -15.688990, -47.826854, -47.822190),
        ('SOB-14', 'Quadrante 14', v_product_id, 'SOBRADINHO', '5', -15.693481, -15.688990, -47.822190, -47.817526),
        ('SOB-15', 'Quadrante 15', v_product_id, 'SOBRADINHO', '5', -15.693481, -15.688990, -47.817526, -47.812862),
        ('SOB-16', 'Quadrante 16', v_product_id, 'SOBRADINHO', '5', -15.688990, -15.684498, -47.854838, -47.850174),
        ('SOB-17', 'Quadrante 17', v_product_id, 'SOBRADINHO', '5', -15.688990, -15.684498, -47.845510, -47.840846),
        ('SOB-18', 'Quadrante 18', v_product_id, 'SOBRADINHO', '5', -15.688990, -15.684498, -47.836182, -47.831518),
        ('SOB-19', 'Quadrante 19', v_product_id, 'SOBRADINHO', '5', -15.688990, -15.684498, -47.826854, -47.822190),
        ('SOB-20', 'Quadrante 20', v_product_id, 'SOBRADINHO', '5', -15.688990, -15.684498, -47.822190, -47.817526),
        ('SOB-21', 'Quadrante 21', v_product_id, 'SOBRADINHO', '5', -15.688990, -15.684498, -47.770886, -47.766222),
        ('SOB-22', 'Quadrante 22', v_product_id, 'SOBRADINHO', '5', -15.684498, -15.680007, -47.840846, -47.836182),
        ('SOB-23', 'Quadrante 23', v_product_id, 'SOBRADINHO', '5', -15.684498, -15.680007, -47.836182, -47.831518),
        ('SOB-24', 'Quadrante 24', v_product_id, 'SOBRADINHO', '5', -15.666532, -15.662041, -47.808198, -47.803534),
        ('SOB-25', 'Quadrante 25', v_product_id, 'SOBRADINHO', '5', -15.666532, -15.662041, -47.803534, -47.798870),
        ('SOB-26', 'Quadrante 26', v_product_id, 'SOBRADINHO', '5', -15.666532, -15.662041, -47.752230, -47.747566),
        ('SOB-27', 'Quadrante 27', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.812862, -47.808198),
        ('SOB-28', 'Quadrante 28', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.808198, -47.803534),
        ('SOB-29', 'Quadrante 29', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.803534, -47.798870),
        ('SOB-30', 'Quadrante 30', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.798870, -47.794206),
        ('SOB-31', 'Quadrante 31', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.794206, -47.789542),
        ('SOB-32', 'Quadrante 32', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.756894, -47.752230),
        ('SOB-33', 'Quadrante 33', v_product_id, 'SOBRADINHO', '5', -15.662041, -15.657549, -47.752230, -47.747566),
        ('SOB-34', 'Quadrante 34', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.812862, -47.808198),
        ('SOB-35', 'Quadrante 35', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.808198, -47.803534),
        ('SOB-36', 'Quadrante 36', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.803534, -47.798870),
        ('SOB-37', 'Quadrante 37', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.798870, -47.794206),
        ('SOB-38', 'Quadrante 38', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.794206, -47.789542),
        ('SOB-39', 'Quadrante 39', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.789542, -47.784878),
        ('SOB-40', 'Quadrante 40', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.784878, -47.780214),
        ('SOB-41', 'Quadrante 41', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.780214, -47.775550),
        ('SOB-42', 'Quadrante 42', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.761558, -47.756894),
        ('SOB-43', 'Quadrante 43', v_product_id, 'SOBRADINHO', '5', -15.657549, -15.653057, -47.756894, -47.752230),
        ('SOB-44', 'Quadrante 44', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.812862, -47.808198),
        ('SOB-45', 'Quadrante 45', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.808198, -47.803534),
        ('SOB-46', 'Quadrante 46', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.803534, -47.798870),
        ('SOB-47', 'Quadrante 47', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.798870, -47.794206),
        ('SOB-48', 'Quadrante 48', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.794206, -47.789542),
        ('SOB-49', 'Quadrante 49', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.789542, -47.784878),
        ('SOB-50', 'Quadrante 50', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.784878, -47.780214),
        ('SOB-51', 'Quadrante 51', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.780214, -47.775550),
        ('SOB-52', 'Quadrante 52', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.775550, -47.770886),
        ('SOB-53', 'Quadrante 53', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.766222, -47.761558),
        ('SOB-54', 'Quadrante 54', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.761558, -47.756894),
        ('SOB-55', 'Quadrante 55', v_product_id, 'SOBRADINHO', '5', -15.653057, -15.648566, -47.756894, -47.752230),
        ('SOB-56', 'Quadrante 56', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.812862, -47.808198),
        ('SOB-57', 'Quadrante 57', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.808198, -47.803534),
        ('SOB-58', 'Quadrante 58', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.803534, -47.798870),
        ('SOB-59', 'Quadrante 59', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.798870, -47.794206),
        ('SOB-60', 'Quadrante 60', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.794206, -47.789542),
        ('SOB-61', 'Quadrante 61', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.789542, -47.784878),
        ('SOB-62', 'Quadrante 62', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.784878, -47.780214),
        ('SOB-63', 'Quadrante 63', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.780214, -47.775550),
        ('SOB-64', 'Quadrante 64', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.775550, -47.770886),
        ('SOB-65', 'Quadrante 65', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.770886, -47.766222),
        ('SOB-66', 'Quadrante 66', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.766222, -47.761558),
        ('SOB-67', 'Quadrante 67', v_product_id, 'SOBRADINHO', '5', -15.648566, -15.644074, -47.761558, -47.756894),
        ('SOB-68', 'Quadrante 68', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.808198, -47.803534),
        ('SOB-69', 'Quadrante 69', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.803534, -47.798870),
        ('SOB-70', 'Quadrante 70', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.798870, -47.794206),
        ('SOB-71', 'Quadrante 71', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.794206, -47.789542),
        ('SOB-72', 'Quadrante 72', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.789542, -47.784878),
        ('SOB-73', 'Quadrante 73', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.784878, -47.780214),
        ('SOB-74', 'Quadrante 74', v_product_id, 'SOBRADINHO', '5', -15.644074, -15.639583, -47.780214, -47.775550),
        ('SOB-75', 'Quadrante 75', v_product_id, 'SOBRADINHO', '5', -15.639583, -15.635091, -47.784878, -47.780214),
        ('SOB-76', 'Quadrante 76', v_product_id, 'SOBRADINHO', '5', -15.639583, -15.635091, -47.766222, -47.761558),
        ('SOB-77', 'Quadrante 77', v_product_id, 'SOBRADINHO', '5', -15.639583, -15.635091, -47.761558, -47.756894),
        ('SOB-78', 'Quadrante 78', v_product_id, 'SOBRADINHO', '5', -15.635091, -15.630600, -47.766222, -47.761558),
        ('SOB-79', 'Quadrante 79', v_product_id, 'SOBRADINHO', '5', -15.635091, -15.630600, -47.761558, -47.756894),
        ('SOB-80', 'Quadrante 80', v_product_id, 'SOBRADINHO', '5', -15.630600, -15.626108, -47.766222, -47.761558),
        ('SOB-81', 'Quadrante 81', v_product_id, 'SOBRADINHO', '5', -15.626108, -15.621617, -47.775550, -47.770886),
        ('SOB-82', 'Quadrante 82', v_product_id, 'SOBRADINHO', '5', -15.626108, -15.621617, -47.770886, -47.766222),
        ('SOB-83', 'Quadrante 83', v_product_id, 'SOBRADINHO', '5', -15.626108, -15.621617, -47.766222, -47.761558);
END $$;

-- ------------------------------------------------------------
-- GUARÁ (GUA) — 72 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'GUARÁ' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — GUARÁ', 'GUARÁ', '9')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('GUA-01', 'Quadrante 1', v_product_id, 'GUARÁ', '9', -15.859820, -15.855328, -47.976861, -47.972192),
        ('GUA-02', 'Quadrante 2', v_product_id, 'GUARÁ', '9', -15.859820, -15.855328, -47.972192, -47.967523),
        ('GUA-03', 'Quadrante 3', v_product_id, 'GUARÁ', '9', -15.859820, -15.855328, -47.967523, -47.962855),
        ('GUA-04', 'Quadrante 4', v_product_id, 'GUARÁ', '9', -15.855328, -15.850837, -47.981529, -47.976861),
        ('GUA-05', 'Quadrante 5', v_product_id, 'GUARÁ', '9', -15.855328, -15.850837, -47.976861, -47.972192),
        ('GUA-06', 'Quadrante 6', v_product_id, 'GUARÁ', '9', -15.855328, -15.850837, -47.972192, -47.967523),
        ('GUA-07', 'Quadrante 7', v_product_id, 'GUARÁ', '9', -15.855328, -15.850837, -47.967523, -47.962855),
        ('GUA-08', 'Quadrante 8', v_product_id, 'GUARÁ', '9', -15.850837, -15.846345, -47.986198, -47.981529),
        ('GUA-09', 'Quadrante 9', v_product_id, 'GUARÁ', '9', -15.850837, -15.846345, -47.981529, -47.976861),
        ('GUA-10', 'Quadrante 10', v_product_id, 'GUARÁ', '9', -15.850837, -15.846345, -47.976861, -47.972192),
        ('GUA-11', 'Quadrante 11', v_product_id, 'GUARÁ', '9', -15.850837, -15.846345, -47.972192, -47.967523),
        ('GUA-12', 'Quadrante 12', v_product_id, 'GUARÁ', '9', -15.850837, -15.846345, -47.967523, -47.962855),
        ('GUA-13', 'Quadrante 13', v_product_id, 'GUARÁ', '9', -15.850837, -15.846345, -47.958186, -47.953517),
        ('GUA-14', 'Quadrante 14', v_product_id, 'GUARÁ', '9', -15.846345, -15.841854, -47.990867, -47.986198),
        ('GUA-15', 'Quadrante 15', v_product_id, 'GUARÁ', '9', -15.846345, -15.841854, -47.986198, -47.981529),
        ('GUA-16', 'Quadrante 16', v_product_id, 'GUARÁ', '9', -15.846345, -15.841854, -47.981529, -47.976861),
        ('GUA-17', 'Quadrante 17', v_product_id, 'GUARÁ', '9', -15.846345, -15.841854, -47.976861, -47.972192),
        ('GUA-18', 'Quadrante 18', v_product_id, 'GUARÁ', '9', -15.846345, -15.841854, -47.972192, -47.967523),
        ('GUA-19', 'Quadrante 19', v_product_id, 'GUARÁ', '9', -15.841854, -15.837362, -47.990867, -47.986198),
        ('GUA-20', 'Quadrante 20', v_product_id, 'GUARÁ', '9', -15.841854, -15.837362, -47.986198, -47.981529),
        ('GUA-21', 'Quadrante 21', v_product_id, 'GUARÁ', '9', -15.841854, -15.837362, -47.981529, -47.976861),
        ('GUA-22', 'Quadrante 22', v_product_id, 'GUARÁ', '9', -15.841854, -15.837362, -47.976861, -47.972192),
        ('GUA-23', 'Quadrante 23', v_product_id, 'GUARÁ', '9', -15.841854, -15.837362, -47.972192, -47.967523),
        ('GUA-24', 'Quadrante 24', v_product_id, 'GUARÁ', '9', -15.837362, -15.832871, -47.990867, -47.986198),
        ('GUA-25', 'Quadrante 25', v_product_id, 'GUARÁ', '9', -15.837362, -15.832871, -47.986198, -47.981529),
        ('GUA-26', 'Quadrante 26', v_product_id, 'GUARÁ', '9', -15.837362, -15.832871, -47.981529, -47.976861),
        ('GUA-27', 'Quadrante 27', v_product_id, 'GUARÁ', '9', -15.837362, -15.832871, -47.976861, -47.972192),
        ('GUA-28', 'Quadrante 28', v_product_id, 'GUARÁ', '9', -15.837362, -15.832871, -47.972192, -47.967523),
        ('GUA-29', 'Quadrante 29', v_product_id, 'GUARÁ', '9', -15.837362, -15.832871, -47.958186, -47.953517),
        ('GUA-30', 'Quadrante 30', v_product_id, 'GUARÁ', '9', -15.832871, -15.828379, -47.995535, -47.990867),
        ('GUA-31', 'Quadrante 31', v_product_id, 'GUARÁ', '9', -15.832871, -15.828379, -47.990867, -47.986198),
        ('GUA-32', 'Quadrante 32', v_product_id, 'GUARÁ', '9', -15.832871, -15.828379, -47.986198, -47.981529),
        ('GUA-33', 'Quadrante 33', v_product_id, 'GUARÁ', '9', -15.832871, -15.828379, -47.981529, -47.976861),
        ('GUA-34', 'Quadrante 34', v_product_id, 'GUARÁ', '9', -15.832871, -15.828379, -47.976861, -47.972192),
        ('GUA-35', 'Quadrante 35', v_product_id, 'GUARÁ', '9', -15.832871, -15.828379, -47.958186, -47.953517),
        ('GUA-36', 'Quadrante 36', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.995535, -47.990867),
        ('GUA-37', 'Quadrante 37', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.990867, -47.986198),
        ('GUA-38', 'Quadrante 38', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.986198, -47.981529),
        ('GUA-39', 'Quadrante 39', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.981529, -47.976861),
        ('GUA-40', 'Quadrante 40', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.976861, -47.972192),
        ('GUA-41', 'Quadrante 41', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.962855, -47.958186),
        ('GUA-42', 'Quadrante 42', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.958186, -47.953517),
        ('GUA-43', 'Quadrante 43', v_product_id, 'GUARÁ', '9', -15.828379, -15.823888, -47.953517, -47.948849),
        ('GUA-44', 'Quadrante 44', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -48.000204, -47.995535),
        ('GUA-45', 'Quadrante 45', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.995535, -47.990867),
        ('GUA-46', 'Quadrante 46', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.990867, -47.986198),
        ('GUA-47', 'Quadrante 47', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.986198, -47.981529),
        ('GUA-48', 'Quadrante 48', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.981529, -47.976861),
        ('GUA-49', 'Quadrante 49', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.976861, -47.972192),
        ('GUA-50', 'Quadrante 50', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.958186, -47.953517),
        ('GUA-51', 'Quadrante 51', v_product_id, 'GUARÁ', '9', -15.823888, -15.819396, -47.953517, -47.948849),
        ('GUA-52', 'Quadrante 52', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -48.000204, -47.995535),
        ('GUA-53', 'Quadrante 53', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.995535, -47.990867),
        ('GUA-54', 'Quadrante 54', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.990867, -47.986198),
        ('GUA-55', 'Quadrante 55', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.986198, -47.981529),
        ('GUA-56', 'Quadrante 56', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.981529, -47.976861),
        ('GUA-57', 'Quadrante 57', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.976861, -47.972192),
        ('GUA-58', 'Quadrante 58', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.967523, -47.962855),
        ('GUA-59', 'Quadrante 59', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.958186, -47.953517),
        ('GUA-60', 'Quadrante 60', v_product_id, 'GUARÁ', '9', -15.819396, -15.814904, -47.953517, -47.948849),
        ('GUA-61', 'Quadrante 61', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -48.000204, -47.995535),
        ('GUA-62', 'Quadrante 62', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.995535, -47.990867),
        ('GUA-63', 'Quadrante 63', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.990867, -47.986198),
        ('GUA-64', 'Quadrante 64', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.986198, -47.981529),
        ('GUA-65', 'Quadrante 65', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.981529, -47.976861),
        ('GUA-66', 'Quadrante 66', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.976861, -47.972192),
        ('GUA-67', 'Quadrante 67', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.967523, -47.962855),
        ('GUA-68', 'Quadrante 68', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.962855, -47.958186),
        ('GUA-69', 'Quadrante 69', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.958186, -47.953517),
        ('GUA-70', 'Quadrante 70', v_product_id, 'GUARÁ', '9', -15.814904, -15.810413, -47.953517, -47.948849),
        ('GUA-71', 'Quadrante 71', v_product_id, 'GUARÁ', '9', -15.810413, -15.805921, -47.990867, -47.986198),
        ('GUA-72', 'Quadrante 72', v_product_id, 'GUARÁ', '9', -15.810413, -15.805921, -47.967523, -47.962855);
END $$;

-- ------------------------------------------------------------
-- CRUZEIRO (CRU) — 15 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'CRUZEIRO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — CRUZEIRO', 'CRUZEIRO', '11')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('CRU-01', 'Quadrante 1', v_product_id, 'CRUZEIRO', '11', -15.806477, -15.801985, -47.941517, -47.936849),
        ('CRU-02', 'Quadrante 2', v_product_id, 'CRUZEIRO', '11', -15.806477, -15.801985, -47.936849, -47.932181),
        ('CRU-03', 'Quadrante 3', v_product_id, 'CRUZEIRO', '11', -15.801985, -15.797494, -47.946184, -47.941517),
        ('CRU-04', 'Quadrante 4', v_product_id, 'CRUZEIRO', '11', -15.801985, -15.797494, -47.941517, -47.936849),
        ('CRU-05', 'Quadrante 5', v_product_id, 'CRUZEIRO', '11', -15.801985, -15.797494, -47.936849, -47.932181),
        ('CRU-06', 'Quadrante 6', v_product_id, 'CRUZEIRO', '11', -15.797494, -15.793002, -47.946184, -47.941517),
        ('CRU-07', 'Quadrante 7', v_product_id, 'CRUZEIRO', '11', -15.797494, -15.793002, -47.941517, -47.936849),
        ('CRU-08', 'Quadrante 8', v_product_id, 'CRUZEIRO', '11', -15.797494, -15.793002, -47.936849, -47.932181),
        ('CRU-09', 'Quadrante 9', v_product_id, 'CRUZEIRO', '11', -15.793002, -15.788511, -47.941517, -47.936849),
        ('CRU-10', 'Quadrante 10', v_product_id, 'CRUZEIRO', '11', -15.793002, -15.788511, -47.936849, -47.932181),
        ('CRU-11', 'Quadrante 11', v_product_id, 'CRUZEIRO', '11', -15.788511, -15.784019, -47.941517, -47.936849),
        ('CRU-12', 'Quadrante 12', v_product_id, 'CRUZEIRO', '11', -15.788511, -15.784019, -47.936849, -47.932181),
        ('CRU-13', 'Quadrante 13', v_product_id, 'CRUZEIRO', '11', -15.784019, -15.779528, -47.941517, -47.936849),
        ('CRU-14', 'Quadrante 14', v_product_id, 'CRUZEIRO', '11', -15.784019, -15.779528, -47.936849, -47.932181),
        ('CRU-15', 'Quadrante 15', v_product_id, 'CRUZEIRO', '11', -15.784019, -15.779528, -47.932181, -47.929268);
END $$;

-- ------------------------------------------------------------
-- RIACHO FUNDO (RF) — 18 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'RIACHO FUNDO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — RIACHO FUNDO', 'RIACHO FUNDO', '10')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('RF-01', 'Quadrante 1', v_product_id, 'RIACHO FUNDO', '10', -15.898074, -15.893583, -48.021337, -48.016667),
        ('RF-02', 'Quadrante 2', v_product_id, 'RIACHO FUNDO', '10', -15.893583, -15.889091, -48.026007, -48.021337),
        ('RF-03', 'Quadrante 3', v_product_id, 'RIACHO FUNDO', '10', -15.893583, -15.889091, -48.016667, -48.011997),
        ('RF-04', 'Quadrante 4', v_product_id, 'RIACHO FUNDO', '10', -15.889091, -15.884600, -48.021337, -48.016667),
        ('RF-05', 'Quadrante 5', v_product_id, 'RIACHO FUNDO', '10', -15.889091, -15.884600, -48.016667, -48.011997),
        ('RF-06', 'Quadrante 6', v_product_id, 'RIACHO FUNDO', '10', -15.889091, -15.884600, -48.011997, -48.007327),
        ('RF-07', 'Quadrante 7', v_product_id, 'RIACHO FUNDO', '10', -15.884600, -15.880108, -48.026007, -48.021337),
        ('RF-08', 'Quadrante 8', v_product_id, 'RIACHO FUNDO', '10', -15.884600, -15.880108, -48.021337, -48.016667),
        ('RF-09', 'Quadrante 9', v_product_id, 'RIACHO FUNDO', '10', -15.884600, -15.880108, -48.016667, -48.011997),
        ('RF-10', 'Quadrante 10', v_product_id, 'RIACHO FUNDO', '10', -15.884600, -15.880108, -48.011997, -48.007327),
        ('RF-11', 'Quadrante 11', v_product_id, 'RIACHO FUNDO', '10', -15.884600, -15.880108, -47.997986, -47.993316),
        ('RF-12', 'Quadrante 12', v_product_id, 'RIACHO FUNDO', '10', -15.884600, -15.880108, -47.988646, -47.983975),
        ('RF-13', 'Quadrante 13', v_product_id, 'RIACHO FUNDO', '10', -15.880108, -15.875617, -48.030678, -48.026007),
        ('RF-14', 'Quadrante 14', v_product_id, 'RIACHO FUNDO', '10', -15.880108, -15.875617, -48.026007, -48.021337),
        ('RF-15', 'Quadrante 15', v_product_id, 'RIACHO FUNDO', '10', -15.880108, -15.875617, -48.021337, -48.016667),
        ('RF-16', 'Quadrante 16', v_product_id, 'RIACHO FUNDO', '10', -15.880108, -15.875617, -48.007327, -48.002656),
        ('RF-17', 'Quadrante 17', v_product_id, 'RIACHO FUNDO', '10', -15.880108, -15.875617, -47.988646, -47.983975),
        ('RF-18', 'Quadrante 18', v_product_id, 'RIACHO FUNDO', '10', -15.875617, -15.874396, -48.040018, -48.035348);
END $$;

-- ------------------------------------------------------------
-- TAGUATINGA (TAG) — 117 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'TAGUATINGA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — TAGUATINGA', 'TAGUATINGA', '3, 10, 15, 19')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('TAG-01', 'Quadrante 1', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.875908, -15.871416, -48.042396, -48.037728),
        ('TAG-02', 'Quadrante 2', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.875908, -15.871416, -48.037728, -48.033060),
        ('TAG-03', 'Quadrante 3', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.875908, -15.871416, -48.033060, -48.028392),
        ('TAG-04', 'Quadrante 4', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.871416, -15.866925, -48.037728, -48.033060),
        ('TAG-05', 'Quadrante 5', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.871416, -15.866925, -48.033060, -48.028392),
        ('TAG-06', 'Quadrante 6', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.866925, -15.862433, -48.037728, -48.033060),
        ('TAG-07', 'Quadrante 7', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.866925, -15.862433, -48.033060, -48.028392),
        ('TAG-08', 'Quadrante 8', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.862433, -15.857942, -48.047064, -48.042396),
        ('TAG-09', 'Quadrante 9', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.862433, -15.857942, -48.042396, -48.037728),
        ('TAG-10', 'Quadrante 10', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.862433, -15.857942, -48.037728, -48.033060),
        ('TAG-11', 'Quadrante 11', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.862433, -15.857942, -48.033060, -48.028392),
        ('TAG-12', 'Quadrante 12', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.857942, -15.853450, -48.065736, -48.061068),
        ('TAG-13', 'Quadrante 13', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.857942, -15.853450, -48.061068, -48.056400),
        ('TAG-14', 'Quadrante 14', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.857942, -15.853450, -48.047064, -48.042396),
        ('TAG-15', 'Quadrante 15', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.857942, -15.853450, -48.042396, -48.037728),
        ('TAG-16', 'Quadrante 16', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.857942, -15.853450, -48.037728, -48.033060),
        ('TAG-17', 'Quadrante 17', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.857942, -15.853450, -48.033060, -48.028392),
        ('TAG-18', 'Quadrante 18', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.070405, -48.065736),
        ('TAG-19', 'Quadrante 19', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.065736, -48.061068),
        ('TAG-20', 'Quadrante 20', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.061068, -48.056400),
        ('TAG-21', 'Quadrante 21', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.051732, -48.047064),
        ('TAG-22', 'Quadrante 22', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.047064, -48.042396),
        ('TAG-23', 'Quadrante 23', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.042396, -48.037728),
        ('TAG-24', 'Quadrante 24', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.853450, -15.848958, -48.037728, -48.033060),
        ('TAG-25', 'Quadrante 25', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.070405, -48.065736),
        ('TAG-26', 'Quadrante 26', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.065736, -48.061068),
        ('TAG-27', 'Quadrante 27', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.061068, -48.056400),
        ('TAG-28', 'Quadrante 28', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.056400, -48.051732),
        ('TAG-29', 'Quadrante 29', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.051732, -48.047064),
        ('TAG-30', 'Quadrante 30', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.047064, -48.042396),
        ('TAG-31', 'Quadrante 31', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.848958, -15.844467, -48.042396, -48.037728),
        ('TAG-32', 'Quadrante 32', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.844467, -15.839975, -48.084409, -48.079741),
        ('TAG-33', 'Quadrante 33', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.844467, -15.839975, -48.061068, -48.056400),
        ('TAG-34', 'Quadrante 34', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.844467, -15.839975, -48.056400, -48.051732),
        ('TAG-35', 'Quadrante 35', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.844467, -15.839975, -48.051732, -48.047064),
        ('TAG-36', 'Quadrante 36', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.844467, -15.839975, -48.047064, -48.042396),
        ('TAG-37', 'Quadrante 37', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.093745, -48.089077),
        ('TAG-38', 'Quadrante 38', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.089077, -48.084409),
        ('TAG-39', 'Quadrante 39', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.084409, -48.079741),
        ('TAG-40', 'Quadrante 40', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.070405, -48.065736),
        ('TAG-41', 'Quadrante 41', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.065736, -48.061068),
        ('TAG-42', 'Quadrante 42', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.061068, -48.056400),
        ('TAG-43', 'Quadrante 43', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.056400, -48.051732),
        ('TAG-44', 'Quadrante 44', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.051732, -48.047064),
        ('TAG-45', 'Quadrante 45', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.839975, -15.835484, -48.047064, -48.042396),
        ('TAG-46', 'Quadrante 46', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.835484, -15.830992, -48.089077, -48.084409),
        ('TAG-47', 'Quadrante 47', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.835484, -15.830992, -48.084409, -48.079741),
        ('TAG-48', 'Quadrante 48', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.835484, -15.830992, -48.079741, -48.075073),
        ('TAG-49', 'Quadrante 49', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.835484, -15.830992, -48.061068, -48.056400),
        ('TAG-50', 'Quadrante 50', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.835484, -15.830992, -48.056400, -48.051732),
        ('TAG-51', 'Quadrante 51', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.830992, -15.826501, -48.089077, -48.084409),
        ('TAG-52', 'Quadrante 52', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.830992, -15.826501, -48.084409, -48.079741),
        ('TAG-53', 'Quadrante 53', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.830992, -15.826501, -48.079741, -48.075073),
        ('TAG-54', 'Quadrante 54', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.830992, -15.826501, -48.065736, -48.061068),
        ('TAG-55', 'Quadrante 55', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.830992, -15.826501, -48.061068, -48.056400),
        ('TAG-56', 'Quadrante 56', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.830992, -15.826501, -48.056400, -48.051732),
        ('TAG-57', 'Quadrante 57', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.093745, -48.089077),
        ('TAG-58', 'Quadrante 58', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.089077, -48.084409),
        ('TAG-59', 'Quadrante 59', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.084409, -48.079741),
        ('TAG-60', 'Quadrante 60', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.079741, -48.075073),
        ('TAG-61', 'Quadrante 61', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.070405, -48.065736),
        ('TAG-62', 'Quadrante 62', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.065736, -48.061068),
        ('TAG-63', 'Quadrante 63', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.061068, -48.056400),
        ('TAG-64', 'Quadrante 64', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.826501, -15.822009, -48.056400, -48.051732),
        ('TAG-65', 'Quadrante 65', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.093745, -48.089077),
        ('TAG-66', 'Quadrante 66', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.089077, -48.084409),
        ('TAG-67', 'Quadrante 67', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.084409, -48.079741),
        ('TAG-68', 'Quadrante 68', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.079741, -48.075073),
        ('TAG-69', 'Quadrante 69', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.075073, -48.070405),
        ('TAG-70', 'Quadrante 70', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.070405, -48.065736),
        ('TAG-71', 'Quadrante 71', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.065736, -48.061068),
        ('TAG-72', 'Quadrante 72', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.061068, -48.056400),
        ('TAG-73', 'Quadrante 73', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.822009, -15.817517, -48.056400, -48.051732),
        ('TAG-74', 'Quadrante 74', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.093745, -48.089077),
        ('TAG-75', 'Quadrante 75', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.089077, -48.084409),
        ('TAG-76', 'Quadrante 76', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.084409, -48.079741),
        ('TAG-77', 'Quadrante 77', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.075073, -48.070405),
        ('TAG-78', 'Quadrante 78', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.070405, -48.065736),
        ('TAG-79', 'Quadrante 79', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.065736, -48.061068),
        ('TAG-80', 'Quadrante 80', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.817517, -15.813026, -48.061068, -48.056400),
        ('TAG-81', 'Quadrante 81', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.098413, -48.093745),
        ('TAG-82', 'Quadrante 82', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.093745, -48.089077),
        ('TAG-83', 'Quadrante 83', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.089077, -48.084409),
        ('TAG-84', 'Quadrante 84', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.084409, -48.079741),
        ('TAG-85', 'Quadrante 85', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.079741, -48.075073),
        ('TAG-86', 'Quadrante 86', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.075073, -48.070405),
        ('TAG-87', 'Quadrante 87', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.070405, -48.065736),
        ('TAG-88', 'Quadrante 88', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.065736, -48.061068),
        ('TAG-89', 'Quadrante 89', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.813026, -15.808534, -48.061068, -48.056400),
        ('TAG-90', 'Quadrante 90', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.103081, -48.098413),
        ('TAG-91', 'Quadrante 91', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.098413, -48.093745),
        ('TAG-92', 'Quadrante 92', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.093745, -48.089077),
        ('TAG-93', 'Quadrante 93', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.089077, -48.084409),
        ('TAG-94', 'Quadrante 94', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.084409, -48.079741),
        ('TAG-95', 'Quadrante 95', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.079741, -48.075073),
        ('TAG-96', 'Quadrante 96', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.075073, -48.070405),
        ('TAG-97', 'Quadrante 97', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.070405, -48.065736),
        ('TAG-98', 'Quadrante 98', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.065736, -48.061068),
        ('TAG-99', 'Quadrante 99', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.808534, -15.804043, -48.061068, -48.056400),
        ('TAG-100', 'Quadrante 100', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.103081, -48.098413),
        ('TAG-101', 'Quadrante 101', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.098413, -48.093745),
        ('TAG-102', 'Quadrante 102', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.093745, -48.089077),
        ('TAG-103', 'Quadrante 103', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.089077, -48.084409),
        ('TAG-104', 'Quadrante 104', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.079741, -48.075073),
        ('TAG-105', 'Quadrante 105', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.075073, -48.070405),
        ('TAG-106', 'Quadrante 106', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.070405, -48.065736),
        ('TAG-107', 'Quadrante 107', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.065736, -48.061068),
        ('TAG-108', 'Quadrante 108', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.804043, -15.799551, -48.061068, -48.056400),
        ('TAG-109', 'Quadrante 109', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.112417, -48.107749),
        ('TAG-110', 'Quadrante 110', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.107749, -48.103081),
        ('TAG-111', 'Quadrante 111', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.103081, -48.098413),
        ('TAG-112', 'Quadrante 112', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.070405, -48.065736),
        ('TAG-113', 'Quadrante 113', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.065736, -48.061068),
        ('TAG-114', 'Quadrante 114', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.061068, -48.056400),
        ('TAG-115', 'Quadrante 115', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.799551, -15.795060, -48.056400, -48.051732),
        ('TAG-116', 'Quadrante 116', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.795060, -15.790568, -48.112417, -48.107749),
        ('TAG-117', 'Quadrante 117', v_product_id, 'TAGUATINGA', '3, 10, 15, 19', -15.795060, -15.790568, -48.107749, -48.103081);
END $$;

-- ------------------------------------------------------------
-- VARJÃO (VAR) — 4 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'VARJÃO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — VARJÃO', 'VARJÃO', '2')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('VAR-01', 'Quadrante 1', v_product_id, 'VARJÃO', '2', -15.719512, -15.715020, -47.873312, -47.868646),
        ('VAR-02', 'Quadrante 2', v_product_id, 'VARJÃO', '2', -15.715020, -15.710528, -47.877978, -47.873312),
        ('VAR-03', 'Quadrante 3', v_product_id, 'VARJÃO', '2', -15.710528, -15.706037, -47.882644, -47.877978),
        ('VAR-04', 'Quadrante 4', v_product_id, 'VARJÃO', '2', -15.710528, -15.706037, -47.877978, -47.873312);
END $$;

-- ------------------------------------------------------------
-- SCIA/ESTRUTURAL (SE) — 22 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SCIA/ESTRUTURAL' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SCIA/ESTRUTURAL', 'SCIA/ESTRUTURAL', '9')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SE-01', 'Quadrante 1', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.795526, -15.791034, -47.974622, -47.969955),
        ('SE-02', 'Quadrante 2', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.791034, -15.786543, -47.983957, -47.979290),
        ('SE-03', 'Quadrante 3', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.791034, -15.786543, -47.979290, -47.974622),
        ('SE-04', 'Quadrante 4', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.791034, -15.786543, -47.974622, -47.969955),
        ('SE-05', 'Quadrante 5', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.786543, -15.782051, -48.002626, -47.997959),
        ('SE-06', 'Quadrante 6', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.786543, -15.782051, -47.997959, -47.993292),
        ('SE-07', 'Quadrante 7', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.786543, -15.782051, -47.993292, -47.988624),
        ('SE-08', 'Quadrante 8', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.786543, -15.782051, -47.988624, -47.983957),
        ('SE-09', 'Quadrante 9', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.786543, -15.782051, -47.983957, -47.979290),
        ('SE-10', 'Quadrante 10', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.782051, -15.777560, -48.007294, -48.002626),
        ('SE-11', 'Quadrante 11', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.782051, -15.777560, -48.002626, -47.997959),
        ('SE-12', 'Quadrante 12', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.782051, -15.777560, -47.997959, -47.993292),
        ('SE-13', 'Quadrante 13', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.782051, -15.777560, -47.993292, -47.988624),
        ('SE-14', 'Quadrante 14', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.782051, -15.777560, -47.988624, -47.983957),
        ('SE-15', 'Quadrante 15', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.777560, -15.773068, -48.007294, -48.002626),
        ('SE-16', 'Quadrante 16', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.777560, -15.773068, -48.002626, -47.997959),
        ('SE-17', 'Quadrante 17', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.777560, -15.773068, -47.997959, -47.993292),
        ('SE-18', 'Quadrante 18', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.777560, -15.773068, -47.988624, -47.983957),
        ('SE-19', 'Quadrante 19', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.773068, -15.768577, -48.007294, -48.002626),
        ('SE-20', 'Quadrante 20', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.773068, -15.768577, -48.002626, -47.997959),
        ('SE-21', 'Quadrante 21', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.768577, -15.764085, -48.002626, -47.997959),
        ('SE-22', 'Quadrante 22', v_product_id, 'SCIA/ESTRUTURAL', '9', -15.768577, -15.764085, -47.997959, -47.993292);
END $$;

-- ------------------------------------------------------------
-- ARNIQUEIRA (ARN) — 56 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'ARNIQUEIRA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — ARNIQUEIRA', 'ARNIQUEIRA', '15')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('ARN-01', 'Quadrante 1', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.028298, -48.023629),
        ('ARN-02', 'Quadrante 2', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.023629, -48.018960),
        ('ARN-03', 'Quadrante 3', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.018960, -48.014291),
        ('ARN-04', 'Quadrante 4', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.014291, -48.009621),
        ('ARN-05', 'Quadrante 5', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.009621, -48.004952),
        ('ARN-06', 'Quadrante 6', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.004952, -48.000283),
        ('ARN-07', 'Quadrante 7', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -48.000283, -47.995613),
        ('ARN-08', 'Quadrante 8', v_product_id, 'ARNIQUEIRA', '15', -15.878227, -15.873736, -47.995613, -47.990944),
        ('ARN-09', 'Quadrante 9', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.028298, -48.023629),
        ('ARN-10', 'Quadrante 10', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.023629, -48.018960),
        ('ARN-11', 'Quadrante 11', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.018960, -48.014291),
        ('ARN-12', 'Quadrante 12', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.014291, -48.009621),
        ('ARN-13', 'Quadrante 13', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.009621, -48.004952),
        ('ARN-14', 'Quadrante 14', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.004952, -48.000283),
        ('ARN-15', 'Quadrante 15', v_product_id, 'ARNIQUEIRA', '15', -15.873736, -15.869244, -48.000283, -47.995613),
        ('ARN-16', 'Quadrante 16', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.028298, -48.023629),
        ('ARN-17', 'Quadrante 17', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.023629, -48.018960),
        ('ARN-18', 'Quadrante 18', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.018960, -48.014291),
        ('ARN-19', 'Quadrante 19', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.014291, -48.009621),
        ('ARN-20', 'Quadrante 20', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.009621, -48.004952),
        ('ARN-21', 'Quadrante 21', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.004952, -48.000283),
        ('ARN-22', 'Quadrante 22', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -48.000283, -47.995613),
        ('ARN-23', 'Quadrante 23', v_product_id, 'ARNIQUEIRA', '15', -15.869244, -15.864752, -47.995613, -47.990944),
        ('ARN-24', 'Quadrante 24', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.028298, -48.023629),
        ('ARN-25', 'Quadrante 25', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.023629, -48.018960),
        ('ARN-26', 'Quadrante 26', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.018960, -48.014291),
        ('ARN-27', 'Quadrante 27', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.014291, -48.009621),
        ('ARN-28', 'Quadrante 28', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.009621, -48.004952),
        ('ARN-29', 'Quadrante 29', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.004952, -48.000283),
        ('ARN-30', 'Quadrante 30', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -48.000283, -47.995613),
        ('ARN-31', 'Quadrante 31', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -47.995613, -47.990944),
        ('ARN-32', 'Quadrante 32', v_product_id, 'ARNIQUEIRA', '15', -15.864752, -15.860261, -47.990944, -47.986660),
        ('ARN-33', 'Quadrante 33', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.028298, -48.023629),
        ('ARN-34', 'Quadrante 34', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.023629, -48.018960),
        ('ARN-35', 'Quadrante 35', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.018960, -48.014291),
        ('ARN-36', 'Quadrante 36', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.014291, -48.009621),
        ('ARN-37', 'Quadrante 37', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.009621, -48.004952),
        ('ARN-38', 'Quadrante 38', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.004952, -48.000283),
        ('ARN-39', 'Quadrante 39', v_product_id, 'ARNIQUEIRA', '15', -15.860261, -15.855769, -48.000283, -47.995613),
        ('ARN-40', 'Quadrante 40', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.032968, -48.028298),
        ('ARN-41', 'Quadrante 41', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.028298, -48.023629),
        ('ARN-42', 'Quadrante 42', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.023629, -48.018960),
        ('ARN-43', 'Quadrante 43', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.018960, -48.014291),
        ('ARN-44', 'Quadrante 44', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.014291, -48.009621),
        ('ARN-45', 'Quadrante 45', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.009621, -48.004952),
        ('ARN-46', 'Quadrante 46', v_product_id, 'ARNIQUEIRA', '15', -15.855769, -15.851278, -48.004952, -48.000283),
        ('ARN-47', 'Quadrante 47', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.032968, -48.028298),
        ('ARN-48', 'Quadrante 48', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.028298, -48.023629),
        ('ARN-49', 'Quadrante 49', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.023629, -48.018960),
        ('ARN-50', 'Quadrante 50', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.018960, -48.014291),
        ('ARN-51', 'Quadrante 51', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.014291, -48.009621),
        ('ARN-52', 'Quadrante 52', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.009621, -48.004952),
        ('ARN-53', 'Quadrante 53', v_product_id, 'ARNIQUEIRA', '15', -15.851278, -15.846786, -48.004952, -48.000283),
        ('ARN-54', 'Quadrante 54', v_product_id, 'ARNIQUEIRA', '15', -15.846786, -15.842295, -48.018960, -48.014291),
        ('ARN-55', 'Quadrante 55', v_product_id, 'ARNIQUEIRA', '15', -15.846786, -15.842295, -48.014291, -48.009621),
        ('ARN-56', 'Quadrante 56', v_product_id, 'ARNIQUEIRA', '15', -15.842295, -15.841127, -48.014291, -48.009621);
END $$;

-- ------------------------------------------------------------
-- PLANALTINA (PLA) — 98 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'PLANALTINA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — PLANALTINA', 'PLANALTINA', '5, 6')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('PLA-01', 'Quadrante 1', v_product_id, 'PLANALTINA', '5, 6', -15.769077, -15.764585, -47.547909, -47.543244),
        ('PLA-02', 'Quadrante 2', v_product_id, 'PLANALTINA', '5, 6', -15.751111, -15.746619, -47.664543, -47.659877),
        ('PLA-03', 'Quadrante 3', v_product_id, 'PLANALTINA', '5, 6', -15.751111, -15.746619, -47.655212, -47.650547),
        ('PLA-04', 'Quadrante 4', v_product_id, 'PLANALTINA', '5, 6', -15.746619, -15.742128, -47.655212, -47.650547),
        ('PLA-05', 'Quadrante 5', v_product_id, 'PLANALTINA', '5, 6', -15.742128, -15.737636, -47.659877, -47.655212),
        ('PLA-06', 'Quadrante 6', v_product_id, 'PLANALTINA', '5, 6', -15.742128, -15.737636, -47.655212, -47.650547),
        ('PLA-07', 'Quadrante 7', v_product_id, 'PLANALTINA', '5, 6', -15.706195, -15.701704, -47.375292, -47.370627),
        ('PLA-08', 'Quadrante 8', v_product_id, 'PLANALTINA', '5, 6', -15.688229, -15.683737, -47.711196, -47.706530),
        ('PLA-09', 'Quadrante 9', v_product_id, 'PLANALTINA', '5, 6', -15.683737, -15.679246, -47.659877, -47.655212),
        ('PLA-10', 'Quadrante 10', v_product_id, 'PLANALTINA', '5, 6', -15.683737, -15.679246, -47.655212, -47.650547),
        ('PLA-11', 'Quadrante 11', v_product_id, 'PLANALTINA', '5, 6', -15.679246, -15.674754, -47.655212, -47.650547),
        ('PLA-12', 'Quadrante 12', v_product_id, 'PLANALTINA', '5, 6', -15.679246, -15.674754, -47.650547, -47.645881),
        ('PLA-13', 'Quadrante 13', v_product_id, 'PLANALTINA', '5, 6', -15.674754, -15.670263, -47.650547, -47.645881),
        ('PLA-14', 'Quadrante 14', v_product_id, 'PLANALTINA', '5, 6', -15.661280, -15.656788, -47.697200, -47.692534),
        ('PLA-15', 'Quadrante 15', v_product_id, 'PLANALTINA', '5, 6', -15.656788, -15.652296, -47.697200, -47.692534),
        ('PLA-16', 'Quadrante 16', v_product_id, 'PLANALTINA', '5, 6', -15.647805, -15.643313, -47.692534, -47.687869),
        ('PLA-17', 'Quadrante 17', v_product_id, 'PLANALTINA', '5, 6', -15.647805, -15.643313, -47.683204, -47.678538),
        ('PLA-18', 'Quadrante 18', v_product_id, 'PLANALTINA', '5, 6', -15.643313, -15.638822, -47.729857, -47.725192),
        ('PLA-19', 'Quadrante 19', v_product_id, 'PLANALTINA', '5, 6', -15.643313, -15.638822, -47.711196, -47.706530),
        ('PLA-20', 'Quadrante 20', v_product_id, 'PLANALTINA', '5, 6', -15.643313, -15.638822, -47.697200, -47.692534),
        ('PLA-21', 'Quadrante 21', v_product_id, 'PLANALTINA', '5, 6', -15.643313, -15.638822, -47.687869, -47.683204),
        ('PLA-22', 'Quadrante 22', v_product_id, 'PLANALTINA', '5, 6', -15.643313, -15.638822, -47.683204, -47.678538),
        ('PLA-23', 'Quadrante 23', v_product_id, 'PLANALTINA', '5, 6', -15.643313, -15.638822, -47.678538, -47.673873),
        ('PLA-24', 'Quadrante 24', v_product_id, 'PLANALTINA', '5, 6', -15.638822, -15.634330, -47.725192, -47.720526),
        ('PLA-25', 'Quadrante 25', v_product_id, 'PLANALTINA', '5, 6', -15.638822, -15.634330, -47.683204, -47.678538),
        ('PLA-26', 'Quadrante 26', v_product_id, 'PLANALTINA', '5, 6', -15.638822, -15.634330, -47.678538, -47.673873),
        ('PLA-27', 'Quadrante 27', v_product_id, 'PLANALTINA', '5, 6', -15.638822, -15.634330, -47.673873, -47.669208),
        ('PLA-28', 'Quadrante 28', v_product_id, 'PLANALTINA', '5, 6', -15.634330, -15.629839, -47.720526, -47.715861),
        ('PLA-29', 'Quadrante 29', v_product_id, 'PLANALTINA', '5, 6', -15.634330, -15.629839, -47.678538, -47.673873),
        ('PLA-30', 'Quadrante 30', v_product_id, 'PLANALTINA', '5, 6', -15.634330, -15.629839, -47.664543, -47.659877),
        ('PLA-31', 'Quadrante 31', v_product_id, 'PLANALTINA', '5, 6', -15.634330, -15.629839, -47.659877, -47.655212),
        ('PLA-32', 'Quadrante 32', v_product_id, 'PLANALTINA', '5, 6', -15.634330, -15.629839, -47.655212, -47.650547),
        ('PLA-33', 'Quadrante 33', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.720526, -47.715861),
        ('PLA-34', 'Quadrante 34', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.701865, -47.697200),
        ('PLA-35', 'Quadrante 35', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.687869, -47.683204),
        ('PLA-36', 'Quadrante 36', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.664543, -47.659877),
        ('PLA-37', 'Quadrante 37', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.659877, -47.655212),
        ('PLA-38', 'Quadrante 38', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.655212, -47.650547),
        ('PLA-39', 'Quadrante 39', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.650547, -47.645881),
        ('PLA-40', 'Quadrante 40', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.645881, -47.641216),
        ('PLA-41', 'Quadrante 41', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.641216, -47.636551),
        ('PLA-42', 'Quadrante 42', v_product_id, 'PLANALTINA', '5, 6', -15.629839, -15.625347, -47.519917, -47.515252),
        ('PLA-43', 'Quadrante 43', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.715861, -47.711196),
        ('PLA-44', 'Quadrante 44', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.706530, -47.701865),
        ('PLA-45', 'Quadrante 45', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.664543, -47.659877),
        ('PLA-46', 'Quadrante 46', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.659877, -47.655212),
        ('PLA-47', 'Quadrante 47', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.655212, -47.650547),
        ('PLA-48', 'Quadrante 48', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.650547, -47.645881),
        ('PLA-49', 'Quadrante 49', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.645881, -47.641216),
        ('PLA-50', 'Quadrante 50', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.641216, -47.636551),
        ('PLA-51', 'Quadrante 51', v_product_id, 'PLANALTINA', '5, 6', -15.625347, -15.620856, -47.631885, -47.627220),
        ('PLA-52', 'Quadrante 52', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.687869, -47.683204),
        ('PLA-53', 'Quadrante 53', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.683204, -47.678538),
        ('PLA-54', 'Quadrante 54', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.678538, -47.673873),
        ('PLA-55', 'Quadrante 55', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.664543, -47.659877),
        ('PLA-56', 'Quadrante 56', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.659877, -47.655212),
        ('PLA-57', 'Quadrante 57', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.655212, -47.650547),
        ('PLA-58', 'Quadrante 58', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.650547, -47.645881),
        ('PLA-59', 'Quadrante 59', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.645881, -47.641216),
        ('PLA-60', 'Quadrante 60', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.641216, -47.636551),
        ('PLA-61', 'Quadrante 61', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.636551, -47.631885),
        ('PLA-62', 'Quadrante 62', v_product_id, 'PLANALTINA', '5, 6', -15.620856, -15.616364, -47.631885, -47.627220),
        ('PLA-63', 'Quadrante 63', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.692534, -47.687869),
        ('PLA-64', 'Quadrante 64', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.687869, -47.683204),
        ('PLA-65', 'Quadrante 65', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.683204, -47.678538),
        ('PLA-66', 'Quadrante 66', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.678538, -47.673873),
        ('PLA-67', 'Quadrante 67', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.659877, -47.655212),
        ('PLA-68', 'Quadrante 68', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.655212, -47.650547),
        ('PLA-69', 'Quadrante 69', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.650547, -47.645881),
        ('PLA-70', 'Quadrante 70', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.645881, -47.641216),
        ('PLA-71', 'Quadrante 71', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.636551, -47.631885),
        ('PLA-72', 'Quadrante 72', v_product_id, 'PLANALTINA', '5, 6', -15.616364, -15.611872, -47.631885, -47.627220),
        ('PLA-73', 'Quadrante 73', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.692534, -47.687869),
        ('PLA-74', 'Quadrante 74', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.687869, -47.683204),
        ('PLA-75', 'Quadrante 75', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.673873, -47.669208),
        ('PLA-76', 'Quadrante 76', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.659877, -47.655212),
        ('PLA-77', 'Quadrante 77', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.655212, -47.650547),
        ('PLA-78', 'Quadrante 78', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.650547, -47.645881),
        ('PLA-79', 'Quadrante 79', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.645881, -47.641216),
        ('PLA-80', 'Quadrante 80', v_product_id, 'PLANALTINA', '5, 6', -15.611872, -15.607381, -47.631885, -47.627220),
        ('PLA-81', 'Quadrante 81', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.692534, -47.687869),
        ('PLA-82', 'Quadrante 82', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.683204, -47.678538),
        ('PLA-83', 'Quadrante 83', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.678538, -47.673873),
        ('PLA-84', 'Quadrante 84', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.673873, -47.669208),
        ('PLA-85', 'Quadrante 85', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.659877, -47.655212),
        ('PLA-86', 'Quadrante 86', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.655212, -47.650547),
        ('PLA-87', 'Quadrante 87', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.650547, -47.645881),
        ('PLA-88', 'Quadrante 88', v_product_id, 'PLANALTINA', '5, 6', -15.607381, -15.602889, -47.645881, -47.641216),
        ('PLA-89', 'Quadrante 89', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.692534, -47.687869),
        ('PLA-90', 'Quadrante 90', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.687869, -47.683204),
        ('PLA-91', 'Quadrante 91', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.683204, -47.678538),
        ('PLA-92', 'Quadrante 92', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.678538, -47.673873),
        ('PLA-93', 'Quadrante 93', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.659877, -47.655212),
        ('PLA-94', 'Quadrante 94', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.655212, -47.650547),
        ('PLA-95', 'Quadrante 95', v_product_id, 'PLANALTINA', '5, 6', -15.602889, -15.598398, -47.650547, -47.645881),
        ('PLA-96', 'Quadrante 96', v_product_id, 'PLANALTINA', '5, 6', -15.593906, -15.589415, -47.575901, -47.571236),
        ('PLA-97', 'Quadrante 97', v_product_id, 'PLANALTINA', '5, 6', -15.584923, -15.580432, -47.748518, -47.743853),
        ('PLA-98', 'Quadrante 98', v_product_id, 'PLANALTINA', '5, 6', -15.522041, -15.517550, -47.678538, -47.673873);
END $$;

-- ------------------------------------------------------------
-- ITAPOÃ (ITA) — 69 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'ITAPOÃ' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — ITAPOÃ', 'ITAPOÃ', '2, 20')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('ITA-01', 'Quadrante 1', v_product_id, 'ITAPOÃ', '2, 20', -15.762924, -15.758433, -47.740181, -47.735514),
        ('ITA-02', 'Quadrante 2', v_product_id, 'ITAPOÃ', '2, 20', -15.762924, -15.758433, -47.735514, -47.730848),
        ('ITA-03', 'Quadrante 3', v_product_id, 'ITAPOÃ', '2, 20', -15.758433, -15.753941, -47.782179, -47.777513),
        ('ITA-04', 'Quadrante 4', v_product_id, 'ITAPOÃ', '2, 20', -15.758433, -15.753941, -47.777513, -47.772846),
        ('ITA-05', 'Quadrante 5', v_product_id, 'ITAPOÃ', '2, 20', -15.758433, -15.753941, -47.749514, -47.744847),
        ('ITA-06', 'Quadrante 6', v_product_id, 'ITAPOÃ', '2, 20', -15.758433, -15.753941, -47.744847, -47.740181),
        ('ITA-07', 'Quadrante 7', v_product_id, 'ITAPOÃ', '2, 20', -15.758433, -15.753941, -47.740181, -47.735514),
        ('ITA-08', 'Quadrante 8', v_product_id, 'ITAPOÃ', '2, 20', -15.758433, -15.753941, -47.735514, -47.730848),
        ('ITA-09', 'Quadrante 9', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.782179, -47.777513),
        ('ITA-10', 'Quadrante 10', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.777513, -47.772846),
        ('ITA-11', 'Quadrante 11', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.772846, -47.768180),
        ('ITA-12', 'Quadrante 12', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.768180, -47.763513),
        ('ITA-13', 'Quadrante 13', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.763513, -47.758847),
        ('ITA-14', 'Quadrante 14', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.758847, -47.754180),
        ('ITA-15', 'Quadrante 15', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.754180, -47.749514),
        ('ITA-16', 'Quadrante 16', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.749514, -47.744847),
        ('ITA-17', 'Quadrante 17', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.744847, -47.740181),
        ('ITA-18', 'Quadrante 18', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.740181, -47.735514),
        ('ITA-19', 'Quadrante 19', v_product_id, 'ITAPOÃ', '2, 20', -15.753941, -15.749450, -47.735514, -47.730848),
        ('ITA-20', 'Quadrante 20', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.777513, -47.772846),
        ('ITA-21', 'Quadrante 21', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.772846, -47.768180),
        ('ITA-22', 'Quadrante 22', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.768180, -47.763513),
        ('ITA-23', 'Quadrante 23', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.763513, -47.758847),
        ('ITA-24', 'Quadrante 24', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.758847, -47.754180),
        ('ITA-25', 'Quadrante 25', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.754180, -47.749514),
        ('ITA-26', 'Quadrante 26', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.749514, -47.744847),
        ('ITA-27', 'Quadrante 27', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.744847, -47.740181),
        ('ITA-28', 'Quadrante 28', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.740181, -47.735514),
        ('ITA-29', 'Quadrante 29', v_product_id, 'ITAPOÃ', '2, 20', -15.749450, -15.744958, -47.735514, -47.730848),
        ('ITA-30', 'Quadrante 30', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.772846, -47.768180),
        ('ITA-31', 'Quadrante 31', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.768180, -47.763513),
        ('ITA-32', 'Quadrante 32', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.763513, -47.758847),
        ('ITA-33', 'Quadrante 33', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.758847, -47.754180),
        ('ITA-34', 'Quadrante 34', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.754180, -47.749514),
        ('ITA-35', 'Quadrante 35', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.749514, -47.744847),
        ('ITA-36', 'Quadrante 36', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.744847, -47.740181),
        ('ITA-37', 'Quadrante 37', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.740181, -47.735514),
        ('ITA-38', 'Quadrante 38', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.735514, -47.730848),
        ('ITA-39', 'Quadrante 39', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.712182, -47.707516),
        ('ITA-40', 'Quadrante 40', v_product_id, 'ITAPOÃ', '2, 20', -15.744958, -15.740466, -47.707516, -47.702849),
        ('ITA-41', 'Quadrante 41', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.777513, -47.772846),
        ('ITA-42', 'Quadrante 42', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.772846, -47.768180),
        ('ITA-43', 'Quadrante 43', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.768180, -47.763513),
        ('ITA-44', 'Quadrante 44', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.763513, -47.758847),
        ('ITA-45', 'Quadrante 45', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.758847, -47.754180),
        ('ITA-46', 'Quadrante 46', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.754180, -47.749514),
        ('ITA-47', 'Quadrante 47', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.749514, -47.744847),
        ('ITA-48', 'Quadrante 48', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.744847, -47.740181),
        ('ITA-49', 'Quadrante 49', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.740181, -47.735514),
        ('ITA-50', 'Quadrante 50', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.712182, -47.707516),
        ('ITA-51', 'Quadrante 51', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.707516, -47.702849),
        ('ITA-52', 'Quadrante 52', v_product_id, 'ITAPOÃ', '2, 20', -15.740466, -15.735975, -47.698183, -47.693516),
        ('ITA-53', 'Quadrante 53', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.772846, -47.768180),
        ('ITA-54', 'Quadrante 54', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.754180, -47.749514),
        ('ITA-55', 'Quadrante 55', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.749514, -47.744847),
        ('ITA-56', 'Quadrante 56', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.744847, -47.740181),
        ('ITA-57', 'Quadrante 57', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.712182, -47.707516),
        ('ITA-58', 'Quadrante 58', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.707516, -47.702849),
        ('ITA-59', 'Quadrante 59', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.702849, -47.698183),
        ('ITA-60', 'Quadrante 60', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.693516, -47.688850),
        ('ITA-61', 'Quadrante 61', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.688850, -47.684183),
        ('ITA-62', 'Quadrante 62', v_product_id, 'ITAPOÃ', '2, 20', -15.735975, -15.731483, -47.684183, -47.679517),
        ('ITA-63', 'Quadrante 63', v_product_id, 'ITAPOÃ', '2, 20', -15.731483, -15.726992, -47.749514, -47.744847),
        ('ITA-64', 'Quadrante 64', v_product_id, 'ITAPOÃ', '2, 20', -15.731483, -15.726992, -47.707516, -47.702849),
        ('ITA-65', 'Quadrante 65', v_product_id, 'ITAPOÃ', '2, 20', -15.731483, -15.726992, -47.702849, -47.698183),
        ('ITA-66', 'Quadrante 66', v_product_id, 'ITAPOÃ', '2, 20', -15.726992, -15.722500, -47.768180, -47.763513),
        ('ITA-67', 'Quadrante 67', v_product_id, 'ITAPOÃ', '2, 20', -15.726992, -15.722500, -47.763513, -47.758847),
        ('ITA-68', 'Quadrante 68', v_product_id, 'ITAPOÃ', '2, 20', -15.726992, -15.722500, -47.754180, -47.749514),
        ('ITA-69', 'Quadrante 69', v_product_id, 'ITAPOÃ', '2, 20', -15.722500, -15.718009, -47.768180, -47.763513);
END $$;

-- ------------------------------------------------------------
-- RECANTO DAS EMAS (RDE) — 62 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'RECANTO DAS EMAS' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — RECANTO DAS EMAS', 'RECANTO DAS EMAS', '21')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('RDE-01', 'Quadrante 1', v_product_id, 'RECANTO DAS EMAS', '21', -15.955248, -15.950756, -48.125116, -48.120445),
        ('RDE-02', 'Quadrante 2', v_product_id, 'RECANTO DAS EMAS', '21', -15.955248, -15.950756, -48.120445, -48.115774),
        ('RDE-03', 'Quadrante 3', v_product_id, 'RECANTO DAS EMAS', '21', -15.950756, -15.946265, -48.125116, -48.120445),
        ('RDE-04', 'Quadrante 4', v_product_id, 'RECANTO DAS EMAS', '21', -15.950756, -15.946265, -48.120445, -48.115774),
        ('RDE-05', 'Quadrante 5', v_product_id, 'RECANTO DAS EMAS', '21', -15.946265, -15.941773, -48.125116, -48.120445),
        ('RDE-06', 'Quadrante 6', v_product_id, 'RECANTO DAS EMAS', '21', -15.941773, -15.937281, -48.125116, -48.120445),
        ('RDE-07', 'Quadrante 7', v_product_id, 'RECANTO DAS EMAS', '21', -15.941773, -15.937281, -48.083078, -48.078407),
        ('RDE-08', 'Quadrante 8', v_product_id, 'RECANTO DAS EMAS', '21', -15.932790, -15.928298, -48.115774, -48.111103),
        ('RDE-09', 'Quadrante 9', v_product_id, 'RECANTO DAS EMAS', '21', -15.932790, -15.928298, -48.111103, -48.106432),
        ('RDE-10', 'Quadrante 10', v_product_id, 'RECANTO DAS EMAS', '21', -15.932790, -15.928298, -48.106432, -48.101761),
        ('RDE-11', 'Quadrante 11', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.176496, -48.171825),
        ('RDE-12', 'Quadrante 12', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.171825, -48.167154),
        ('RDE-13', 'Quadrante 13', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.111103, -48.106432),
        ('RDE-14', 'Quadrante 14', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.106432, -48.101761),
        ('RDE-15', 'Quadrante 15', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.101761, -48.097091),
        ('RDE-16', 'Quadrante 16', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.055052, -48.050381),
        ('RDE-17', 'Quadrante 17', v_product_id, 'RECANTO DAS EMAS', '21', -15.928298, -15.923807, -48.050381, -48.045710),
        ('RDE-18', 'Quadrante 18', v_product_id, 'RECANTO DAS EMAS', '21', -15.923807, -15.919315, -48.111103, -48.106432),
        ('RDE-19', 'Quadrante 19', v_product_id, 'RECANTO DAS EMAS', '21', -15.923807, -15.919315, -48.106432, -48.101761),
        ('RDE-20', 'Quadrante 20', v_product_id, 'RECANTO DAS EMAS', '21', -15.923807, -15.919315, -48.101761, -48.097091),
        ('RDE-21', 'Quadrante 21', v_product_id, 'RECANTO DAS EMAS', '21', -15.923807, -15.919315, -48.059723, -48.055052),
        ('RDE-22', 'Quadrante 22', v_product_id, 'RECANTO DAS EMAS', '21', -15.923807, -15.919315, -48.055052, -48.050381),
        ('RDE-23', 'Quadrante 23', v_product_id, 'RECANTO DAS EMAS', '21', -15.923807, -15.919315, -48.050381, -48.045710),
        ('RDE-24', 'Quadrante 24', v_product_id, 'RECANTO DAS EMAS', '21', -15.919315, -15.914824, -48.106432, -48.101761),
        ('RDE-25', 'Quadrante 25', v_product_id, 'RECANTO DAS EMAS', '21', -15.919315, -15.914824, -48.101761, -48.097091),
        ('RDE-26', 'Quadrante 26', v_product_id, 'RECANTO DAS EMAS', '21', -15.919315, -15.914824, -48.069065, -48.064394),
        ('RDE-27', 'Quadrante 27', v_product_id, 'RECANTO DAS EMAS', '21', -15.919315, -15.914824, -48.064394, -48.059723),
        ('RDE-28', 'Quadrante 28', v_product_id, 'RECANTO DAS EMAS', '21', -15.919315, -15.914824, -48.059723, -48.055052),
        ('RDE-29', 'Quadrante 29', v_product_id, 'RECANTO DAS EMAS', '21', -15.919315, -15.914824, -48.055052, -48.050381),
        ('RDE-30', 'Quadrante 30', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.101761, -48.097091),
        ('RDE-31', 'Quadrante 31', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.097091, -48.092420),
        ('RDE-32', 'Quadrante 32', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.092420, -48.087749),
        ('RDE-33', 'Quadrante 33', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.073736, -48.069065),
        ('RDE-34', 'Quadrante 34', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.069065, -48.064394),
        ('RDE-35', 'Quadrante 35', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.064394, -48.059723),
        ('RDE-36', 'Quadrante 36', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.059723, -48.055052),
        ('RDE-37', 'Quadrante 37', v_product_id, 'RECANTO DAS EMAS', '21', -15.914824, -15.910332, -48.055052, -48.050381),
        ('RDE-38', 'Quadrante 38', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.092420, -48.087749),
        ('RDE-39', 'Quadrante 39', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.087749, -48.083078),
        ('RDE-40', 'Quadrante 40', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.083078, -48.078407),
        ('RDE-41', 'Quadrante 41', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.078407, -48.073736),
        ('RDE-42', 'Quadrante 42', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.073736, -48.069065),
        ('RDE-43', 'Quadrante 43', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.069065, -48.064394),
        ('RDE-44', 'Quadrante 44', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.064394, -48.059723),
        ('RDE-45', 'Quadrante 45', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.059723, -48.055052),
        ('RDE-46', 'Quadrante 46', v_product_id, 'RECANTO DAS EMAS', '21', -15.910332, -15.905841, -48.055052, -48.050381),
        ('RDE-47', 'Quadrante 47', v_product_id, 'RECANTO DAS EMAS', '21', -15.905841, -15.901349, -48.078407, -48.073736),
        ('RDE-48', 'Quadrante 48', v_product_id, 'RECANTO DAS EMAS', '21', -15.905841, -15.901349, -48.073736, -48.069065),
        ('RDE-49', 'Quadrante 49', v_product_id, 'RECANTO DAS EMAS', '21', -15.905841, -15.901349, -48.069065, -48.064394),
        ('RDE-50', 'Quadrante 50', v_product_id, 'RECANTO DAS EMAS', '21', -15.905841, -15.901349, -48.064394, -48.059723),
        ('RDE-51', 'Quadrante 51', v_product_id, 'RECANTO DAS EMAS', '21', -15.905841, -15.901349, -48.059723, -48.055052),
        ('RDE-52', 'Quadrante 52', v_product_id, 'RECANTO DAS EMAS', '21', -15.901349, -15.896857, -48.073736, -48.069065),
        ('RDE-53', 'Quadrante 53', v_product_id, 'RECANTO DAS EMAS', '21', -15.901349, -15.896857, -48.069065, -48.064394),
        ('RDE-54', 'Quadrante 54', v_product_id, 'RECANTO DAS EMAS', '21', -15.901349, -15.896857, -48.064394, -48.059723),
        ('RDE-55', 'Quadrante 55', v_product_id, 'RECANTO DAS EMAS', '21', -15.901349, -15.896857, -48.059723, -48.055052),
        ('RDE-56', 'Quadrante 56', v_product_id, 'RECANTO DAS EMAS', '21', -15.896857, -15.892366, -48.083078, -48.078407),
        ('RDE-57', 'Quadrante 57', v_product_id, 'RECANTO DAS EMAS', '21', -15.896857, -15.892366, -48.078407, -48.073736),
        ('RDE-58', 'Quadrante 58', v_product_id, 'RECANTO DAS EMAS', '21', -15.896857, -15.892366, -48.069065, -48.064394),
        ('RDE-59', 'Quadrante 59', v_product_id, 'RECANTO DAS EMAS', '21', -15.892366, -15.887874, -48.083078, -48.078407),
        ('RDE-60', 'Quadrante 60', v_product_id, 'RECANTO DAS EMAS', '21', -15.892366, -15.887874, -48.078407, -48.073736),
        ('RDE-61', 'Quadrante 61', v_product_id, 'RECANTO DAS EMAS', '21', -15.892366, -15.887874, -48.073736, -48.069065),
        ('RDE-62', 'Quadrante 62', v_product_id, 'RECANTO DAS EMAS', '21', -15.887874, -15.883383, -48.069065, -48.064394);
END $$;

-- ------------------------------------------------------------
-- SAMAMBAIA (SAM) — 106 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SAMAMBAIA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SAMAMBAIA', 'SAMAMBAIA', '10, 13, 21')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SAM-01', 'Quadrante 1', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.905424, -15.900932, -48.142797, -48.138127),
        ('SAM-02', 'Quadrante 2', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.900932, -15.896441, -48.128787, -48.124117),
        ('SAM-03', 'Quadrante 3', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.900932, -15.896441, -48.124117, -48.119447),
        ('SAM-04', 'Quadrante 4', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.900932, -15.896441, -48.119447, -48.114777),
        ('SAM-05', 'Quadrante 5', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.147467, -48.142797),
        ('SAM-06', 'Quadrante 6', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.142797, -48.138127),
        ('SAM-07', 'Quadrante 7', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.128787, -48.124117),
        ('SAM-08', 'Quadrante 8', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.124117, -48.119447),
        ('SAM-09', 'Quadrante 9', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.119447, -48.114777),
        ('SAM-10', 'Quadrante 10', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.114777, -48.110107),
        ('SAM-11', 'Quadrante 11', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.110107, -48.105437),
        ('SAM-12', 'Quadrante 12', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.896441, -15.891949, -48.105437, -48.100767),
        ('SAM-13', 'Quadrante 13', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.152137, -48.147467),
        ('SAM-14', 'Quadrante 14', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.147467, -48.142797),
        ('SAM-15', 'Quadrante 15', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.128787, -48.124117),
        ('SAM-16', 'Quadrante 16', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.124117, -48.119447),
        ('SAM-17', 'Quadrante 17', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.119447, -48.114777),
        ('SAM-18', 'Quadrante 18', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.114777, -48.110107),
        ('SAM-19', 'Quadrante 19', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.110107, -48.105437),
        ('SAM-20', 'Quadrante 20', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.105437, -48.100767),
        ('SAM-21', 'Quadrante 21', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.100767, -48.096097),
        ('SAM-22', 'Quadrante 22', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.096097, -48.091427),
        ('SAM-23', 'Quadrante 23', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.891949, -15.887458, -48.091427, -48.086757),
        ('SAM-24', 'Quadrante 24', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.152137, -48.147467),
        ('SAM-25', 'Quadrante 25', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.147467, -48.142797),
        ('SAM-26', 'Quadrante 26', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.142797, -48.138127),
        ('SAM-27', 'Quadrante 27', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.133457, -48.128787),
        ('SAM-28', 'Quadrante 28', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.128787, -48.124117),
        ('SAM-29', 'Quadrante 29', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.124117, -48.119447),
        ('SAM-30', 'Quadrante 30', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.119447, -48.114777),
        ('SAM-31', 'Quadrante 31', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.114777, -48.110107),
        ('SAM-32', 'Quadrante 32', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.110107, -48.105437),
        ('SAM-33', 'Quadrante 33', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.105437, -48.100767),
        ('SAM-34', 'Quadrante 34', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.100767, -48.096097),
        ('SAM-35', 'Quadrante 35', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.096097, -48.091427),
        ('SAM-36', 'Quadrante 36', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.091427, -48.086757),
        ('SAM-37', 'Quadrante 37', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.086757, -48.082087),
        ('SAM-38', 'Quadrante 38', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.082087, -48.077417),
        ('SAM-39', 'Quadrante 39', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.887458, -15.882966, -48.077417, -48.072747),
        ('SAM-40', 'Quadrante 40', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.124117, -48.119447),
        ('SAM-41', 'Quadrante 41', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.119447, -48.114777),
        ('SAM-42', 'Quadrante 42', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.114777, -48.110107),
        ('SAM-43', 'Quadrante 43', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.110107, -48.105437),
        ('SAM-44', 'Quadrante 44', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.105437, -48.100767),
        ('SAM-45', 'Quadrante 45', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.100767, -48.096097),
        ('SAM-46', 'Quadrante 46', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.096097, -48.091427),
        ('SAM-47', 'Quadrante 47', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.091427, -48.086757),
        ('SAM-48', 'Quadrante 48', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.086757, -48.082087),
        ('SAM-49', 'Quadrante 49', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.082087, -48.077417),
        ('SAM-50', 'Quadrante 50', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.077417, -48.072747),
        ('SAM-51', 'Quadrante 51', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.072747, -48.068077),
        ('SAM-52', 'Quadrante 52', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.068077, -48.063407),
        ('SAM-53', 'Quadrante 53', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.882966, -15.878474, -48.063407, -48.058737),
        ('SAM-54', 'Quadrante 54', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.152137, -48.147467),
        ('SAM-55', 'Quadrante 55', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.128787, -48.124117),
        ('SAM-56', 'Quadrante 56', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.119447, -48.114777),
        ('SAM-57', 'Quadrante 57', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.114777, -48.110107),
        ('SAM-58', 'Quadrante 58', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.110107, -48.105437),
        ('SAM-59', 'Quadrante 59', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.105437, -48.100767),
        ('SAM-60', 'Quadrante 60', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.100767, -48.096097),
        ('SAM-61', 'Quadrante 61', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.096097, -48.091427),
        ('SAM-62', 'Quadrante 62', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.091427, -48.086757),
        ('SAM-63', 'Quadrante 63', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.086757, -48.082087),
        ('SAM-64', 'Quadrante 64', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.082087, -48.077417),
        ('SAM-65', 'Quadrante 65', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.077417, -48.072747),
        ('SAM-66', 'Quadrante 66', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.072747, -48.068077),
        ('SAM-67', 'Quadrante 67', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.068077, -48.063407),
        ('SAM-68', 'Quadrante 68', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.063407, -48.058737),
        ('SAM-69', 'Quadrante 69', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.058737, -48.054067),
        ('SAM-70', 'Quadrante 70', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.878474, -15.873983, -48.054067, -48.049397),
        ('SAM-71', 'Quadrante 71', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.152137, -48.147467),
        ('SAM-72', 'Quadrante 72', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.105437, -48.100767),
        ('SAM-73', 'Quadrante 73', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.100767, -48.096097),
        ('SAM-74', 'Quadrante 74', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.096097, -48.091427),
        ('SAM-75', 'Quadrante 75', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.091427, -48.086757),
        ('SAM-76', 'Quadrante 76', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.086757, -48.082087),
        ('SAM-77', 'Quadrante 77', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.082087, -48.077417),
        ('SAM-78', 'Quadrante 78', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.077417, -48.072747),
        ('SAM-79', 'Quadrante 79', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.072747, -48.068077),
        ('SAM-80', 'Quadrante 80', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.068077, -48.063407),
        ('SAM-81', 'Quadrante 81', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.063407, -48.058737),
        ('SAM-82', 'Quadrante 82', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.873983, -15.869491, -48.054067, -48.049397),
        ('SAM-83', 'Quadrante 83', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.100767, -48.096097),
        ('SAM-84', 'Quadrante 84', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.096097, -48.091427),
        ('SAM-85', 'Quadrante 85', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.091427, -48.086757),
        ('SAM-86', 'Quadrante 86', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.086757, -48.082087),
        ('SAM-87', 'Quadrante 87', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.082087, -48.077417),
        ('SAM-88', 'Quadrante 88', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.077417, -48.072747),
        ('SAM-89', 'Quadrante 89', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.072747, -48.068077),
        ('SAM-90', 'Quadrante 90', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.068077, -48.063407),
        ('SAM-91', 'Quadrante 91', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.063407, -48.058737),
        ('SAM-92', 'Quadrante 92', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.869491, -15.865000, -48.058737, -48.054067),
        ('SAM-93', 'Quadrante 93', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.096097, -48.091427),
        ('SAM-94', 'Quadrante 94', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.091427, -48.086757),
        ('SAM-95', 'Quadrante 95', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.086757, -48.082087),
        ('SAM-96', 'Quadrante 96', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.082087, -48.077417),
        ('SAM-97', 'Quadrante 97', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.077417, -48.072747),
        ('SAM-98', 'Quadrante 98', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.072747, -48.068077),
        ('SAM-99', 'Quadrante 99', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.068077, -48.063407),
        ('SAM-100', 'Quadrante 100', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.865000, -15.860508, -48.058737, -48.054067),
        ('SAM-101', 'Quadrante 101', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.860508, -15.856017, -48.086757, -48.082087),
        ('SAM-102', 'Quadrante 102', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.860508, -15.856017, -48.082087, -48.077417),
        ('SAM-103', 'Quadrante 103', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.860508, -15.856017, -48.077417, -48.072747),
        ('SAM-104', 'Quadrante 104', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.860508, -15.856017, -48.072747, -48.068077),
        ('SAM-105', 'Quadrante 105', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.856017, -15.851525, -48.077417, -48.072747),
        ('SAM-106', 'Quadrante 106', v_product_id, 'SAMAMBAIA', '10, 13, 21', -15.856017, -15.851525, -48.072747, -48.068077);
END $$;

-- ------------------------------------------------------------
-- SANTA MARIA (SM) — 81 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SANTA MARIA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SANTA MARIA', 'SANTA MARIA', '4, 9')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SM-01', 'Quadrante 1', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -48.044739, -48.040066),
        ('SM-02', 'Quadrante 2', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -48.040066, -48.035393),
        ('SM-03', 'Quadrante 3', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -48.035393, -48.030720),
        ('SM-04', 'Quadrante 4', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -48.030720, -48.026048),
        ('SM-05', 'Quadrante 5', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -48.007356, -48.002684),
        ('SM-06', 'Quadrante 6', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -47.998011, -47.993338),
        ('SM-07', 'Quadrante 7', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -47.993338, -47.988665),
        ('SM-08', 'Quadrante 8', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -47.983992, -47.979320),
        ('SM-09', 'Quadrante 9', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -47.979320, -47.974647),
        ('SM-10', 'Quadrante 10', v_product_id, 'SANTA MARIA', '4, 9', -16.050283, -16.045792, -47.969974, -47.965301),
        ('SM-11', 'Quadrante 11', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -48.044739, -48.040066),
        ('SM-12', 'Quadrante 12', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -48.040066, -48.035393),
        ('SM-13', 'Quadrante 13', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -48.035393, -48.030720),
        ('SM-14', 'Quadrante 14', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -48.030720, -48.026048),
        ('SM-15', 'Quadrante 15', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -47.998011, -47.993338),
        ('SM-16', 'Quadrante 16', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -47.979320, -47.974647),
        ('SM-17', 'Quadrante 17', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -47.974647, -47.969974),
        ('SM-18', 'Quadrante 18', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -47.969974, -47.965301),
        ('SM-19', 'Quadrante 19', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -47.965301, -47.960629),
        ('SM-20', 'Quadrante 20', v_product_id, 'SANTA MARIA', '4, 9', -16.045792, -16.041300, -47.960629, -47.955956),
        ('SM-21', 'Quadrante 21', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -48.040066, -48.035393),
        ('SM-22', 'Quadrante 22', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -48.035393, -48.030720),
        ('SM-23', 'Quadrante 23', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -48.030720, -48.026048),
        ('SM-24', 'Quadrante 24', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -48.026048, -48.021375),
        ('SM-25', 'Quadrante 25', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -48.021375, -48.016702),
        ('SM-26', 'Quadrante 26', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -47.993338, -47.988665),
        ('SM-27', 'Quadrante 27', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -47.988665, -47.983992),
        ('SM-28', 'Quadrante 28', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -47.983992, -47.979320),
        ('SM-29', 'Quadrante 29', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -47.979320, -47.974647),
        ('SM-30', 'Quadrante 30', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -47.965301, -47.960629),
        ('SM-31', 'Quadrante 31', v_product_id, 'SANTA MARIA', '4, 9', -16.041300, -16.036808, -47.932592, -47.927919),
        ('SM-32', 'Quadrante 32', v_product_id, 'SANTA MARIA', '4, 9', -16.036808, -16.032317, -48.040066, -48.035393),
        ('SM-33', 'Quadrante 33', v_product_id, 'SANTA MARIA', '4, 9', -16.036808, -16.032317, -48.035393, -48.030720),
        ('SM-34', 'Quadrante 34', v_product_id, 'SANTA MARIA', '4, 9', -16.036808, -16.032317, -48.030720, -48.026048),
        ('SM-35', 'Quadrante 35', v_product_id, 'SANTA MARIA', '4, 9', -16.036808, -16.032317, -48.026048, -48.021375),
        ('SM-36', 'Quadrante 36', v_product_id, 'SANTA MARIA', '4, 9', -16.036808, -16.032317, -48.021375, -48.016702),
        ('SM-37', 'Quadrante 37', v_product_id, 'SANTA MARIA', '4, 9', -16.036808, -16.032317, -47.979320, -47.974647),
        ('SM-38', 'Quadrante 38', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -48.040066, -48.035393),
        ('SM-39', 'Quadrante 39', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -48.035393, -48.030720),
        ('SM-40', 'Quadrante 40', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -48.030720, -48.026048),
        ('SM-41', 'Quadrante 41', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -48.026048, -48.021375),
        ('SM-42', 'Quadrante 42', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -47.993338, -47.988665),
        ('SM-43', 'Quadrante 43', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -47.988665, -47.983992),
        ('SM-44', 'Quadrante 44', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -47.979320, -47.974647),
        ('SM-45', 'Quadrante 45', v_product_id, 'SANTA MARIA', '4, 9', -16.032317, -16.027825, -47.974647, -47.969974),
        ('SM-46', 'Quadrante 46', v_product_id, 'SANTA MARIA', '4, 9', -16.027825, -16.023334, -48.035393, -48.030720),
        ('SM-47', 'Quadrante 47', v_product_id, 'SANTA MARIA', '4, 9', -16.027825, -16.023334, -48.030720, -48.026048),
        ('SM-48', 'Quadrante 48', v_product_id, 'SANTA MARIA', '4, 9', -16.027825, -16.023334, -48.026048, -48.021375),
        ('SM-49', 'Quadrante 49', v_product_id, 'SANTA MARIA', '4, 9', -16.027825, -16.023334, -48.021375, -48.016702),
        ('SM-50', 'Quadrante 50', v_product_id, 'SANTA MARIA', '4, 9', -16.023334, -16.018842, -48.026048, -48.021375),
        ('SM-51', 'Quadrante 51', v_product_id, 'SANTA MARIA', '4, 9', -16.023334, -16.018842, -48.021375, -48.016702),
        ('SM-52', 'Quadrante 52', v_product_id, 'SANTA MARIA', '4, 9', -16.023334, -16.018842, -48.016702, -48.012029),
        ('SM-53', 'Quadrante 53', v_product_id, 'SANTA MARIA', '4, 9', -16.018842, -16.014351, -48.026048, -48.021375),
        ('SM-54', 'Quadrante 54', v_product_id, 'SANTA MARIA', '4, 9', -16.018842, -16.014351, -48.016702, -48.012029),
        ('SM-55', 'Quadrante 55', v_product_id, 'SANTA MARIA', '4, 9', -16.018842, -16.014351, -48.007356, -48.002684),
        ('SM-56', 'Quadrante 56', v_product_id, 'SANTA MARIA', '4, 9', -16.018842, -16.014351, -47.993338, -47.988665),
        ('SM-57', 'Quadrante 57', v_product_id, 'SANTA MARIA', '4, 9', -16.018842, -16.014351, -47.988665, -47.983992),
        ('SM-58', 'Quadrante 58', v_product_id, 'SANTA MARIA', '4, 9', -16.018842, -16.014351, -47.974647, -47.969974),
        ('SM-59', 'Quadrante 59', v_product_id, 'SANTA MARIA', '4, 9', -16.014351, -16.009859, -48.012029, -48.007356),
        ('SM-60', 'Quadrante 60', v_product_id, 'SANTA MARIA', '4, 9', -16.014351, -16.009859, -48.007356, -48.002684),
        ('SM-61', 'Quadrante 61', v_product_id, 'SANTA MARIA', '4, 9', -16.014351, -16.009859, -48.002684, -47.998011),
        ('SM-62', 'Quadrante 62', v_product_id, 'SANTA MARIA', '4, 9', -16.014351, -16.009859, -47.998011, -47.993338),
        ('SM-63', 'Quadrante 63', v_product_id, 'SANTA MARIA', '4, 9', -16.014351, -16.009859, -47.993338, -47.988665),
        ('SM-64', 'Quadrante 64', v_product_id, 'SANTA MARIA', '4, 9', -16.014351, -16.009859, -47.988665, -47.983992),
        ('SM-65', 'Quadrante 65', v_product_id, 'SANTA MARIA', '4, 9', -16.009859, -16.005368, -48.002684, -47.998011),
        ('SM-66', 'Quadrante 66', v_product_id, 'SANTA MARIA', '4, 9', -16.009859, -16.005368, -47.998011, -47.993338),
        ('SM-67', 'Quadrante 67', v_product_id, 'SANTA MARIA', '4, 9', -16.009859, -16.005368, -47.993338, -47.988665),
        ('SM-68', 'Quadrante 68', v_product_id, 'SANTA MARIA', '4, 9', -16.009859, -16.005368, -47.988665, -47.983992),
        ('SM-69', 'Quadrante 69', v_product_id, 'SANTA MARIA', '4, 9', -16.005368, -16.000876, -47.998011, -47.993338),
        ('SM-70', 'Quadrante 70', v_product_id, 'SANTA MARIA', '4, 9', -16.005368, -16.000876, -47.993338, -47.988665),
        ('SM-71', 'Quadrante 71', v_product_id, 'SANTA MARIA', '4, 9', -16.005368, -16.000876, -47.988665, -47.983992),
        ('SM-72', 'Quadrante 72', v_product_id, 'SANTA MARIA', '4, 9', -16.000876, -15.996384, -48.002684, -47.998011),
        ('SM-73', 'Quadrante 73', v_product_id, 'SANTA MARIA', '4, 9', -16.000876, -15.996384, -47.998011, -47.993338),
        ('SM-74', 'Quadrante 74', v_product_id, 'SANTA MARIA', '4, 9', -16.000876, -15.996384, -47.993338, -47.988665),
        ('SM-75', 'Quadrante 75', v_product_id, 'SANTA MARIA', '4, 9', -16.000876, -15.996384, -47.988665, -47.983992),
        ('SM-76', 'Quadrante 76', v_product_id, 'SANTA MARIA', '4, 9', -15.996384, -15.991893, -47.998011, -47.993338),
        ('SM-77', 'Quadrante 77', v_product_id, 'SANTA MARIA', '4, 9', -15.996384, -15.991893, -47.993338, -47.988665),
        ('SM-78', 'Quadrante 78', v_product_id, 'SANTA MARIA', '4, 9', -15.982910, -15.978418, -47.998011, -47.993338),
        ('SM-79', 'Quadrante 79', v_product_id, 'SANTA MARIA', '4, 9', -15.982910, -15.978418, -47.993338, -47.988665),
        ('SM-80', 'Quadrante 80', v_product_id, 'SANTA MARIA', '4, 9', -15.982910, -15.978418, -47.979320, -47.974647),
        ('SM-81', 'Quadrante 81', v_product_id, 'SANTA MARIA', '4, 9', -15.978418, -15.973927, -47.979320, -47.974647);
END $$;

-- ------------------------------------------------------------
-- SÃO SEBASTIÃO (SS) — 62 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SÃO SEBASTIÃO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SÃO SEBASTIÃO', 'SÃO SEBASTIÃO', '18')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SS-01', 'Quadrante 1', v_product_id, 'SÃO SEBASTIÃO', '18', -15.965021, -15.960529, -47.779431, -47.774760),
        ('SS-02', 'Quadrante 2', v_product_id, 'SÃO SEBASTIÃO', '18', -15.947055, -15.942563, -47.784103, -47.779431),
        ('SS-03', 'Quadrante 3', v_product_id, 'SÃO SEBASTIÃO', '18', -15.942563, -15.938072, -47.611250, -47.606579),
        ('SS-04', 'Quadrante 4', v_product_id, 'SÃO SEBASTIÃO', '18', -15.938072, -15.933580, -47.774760, -47.770088),
        ('SS-05', 'Quadrante 5', v_product_id, 'SÃO SEBASTIÃO', '18', -15.938072, -15.933580, -47.765416, -47.760744),
        ('SS-06', 'Quadrante 6', v_product_id, 'SÃO SEBASTIÃO', '18', -15.938072, -15.933580, -47.756073, -47.751401),
        ('SS-07', 'Quadrante 7', v_product_id, 'SÃO SEBASTIÃO', '18', -15.938072, -15.933580, -47.751401, -47.746729),
        ('SS-08', 'Quadrante 8', v_product_id, 'SÃO SEBASTIÃO', '18', -15.933580, -15.929089, -47.774760, -47.770088),
        ('SS-09', 'Quadrante 9', v_product_id, 'SÃO SEBASTIÃO', '18', -15.933580, -15.929089, -47.770088, -47.765416),
        ('SS-10', 'Quadrante 10', v_product_id, 'SÃO SEBASTIÃO', '18', -15.933580, -15.929089, -47.765416, -47.760744),
        ('SS-11', 'Quadrante 11', v_product_id, 'SÃO SEBASTIÃO', '18', -15.933580, -15.929089, -47.760744, -47.756073),
        ('SS-12', 'Quadrante 12', v_product_id, 'SÃO SEBASTIÃO', '18', -15.933580, -15.929089, -47.756073, -47.751401),
        ('SS-13', 'Quadrante 13', v_product_id, 'SÃO SEBASTIÃO', '18', -15.933580, -15.929089, -47.751401, -47.746729),
        ('SS-14', 'Quadrante 14', v_product_id, 'SÃO SEBASTIÃO', '18', -15.929089, -15.924597, -47.774760, -47.770088),
        ('SS-15', 'Quadrante 15', v_product_id, 'SÃO SEBASTIÃO', '18', -15.929089, -15.924597, -47.770088, -47.765416),
        ('SS-16', 'Quadrante 16', v_product_id, 'SÃO SEBASTIÃO', '18', -15.929089, -15.924597, -47.765416, -47.760744),
        ('SS-17', 'Quadrante 17', v_product_id, 'SÃO SEBASTIÃO', '18', -15.929089, -15.924597, -47.760744, -47.756073),
        ('SS-18', 'Quadrante 18', v_product_id, 'SÃO SEBASTIÃO', '18', -15.924597, -15.920105, -47.779431, -47.774760),
        ('SS-19', 'Quadrante 19', v_product_id, 'SÃO SEBASTIÃO', '18', -15.924597, -15.920105, -47.774760, -47.770088),
        ('SS-20', 'Quadrante 20', v_product_id, 'SÃO SEBASTIÃO', '18', -15.924597, -15.920105, -47.770088, -47.765416),
        ('SS-21', 'Quadrante 21', v_product_id, 'SÃO SEBASTIÃO', '18', -15.924597, -15.920105, -47.751401, -47.746729),
        ('SS-22', 'Quadrante 22', v_product_id, 'SÃO SEBASTIÃO', '18', -15.920105, -15.915614, -47.774760, -47.770088),
        ('SS-23', 'Quadrante 23', v_product_id, 'SÃO SEBASTIÃO', '18', -15.920105, -15.915614, -47.770088, -47.765416),
        ('SS-24', 'Quadrante 24', v_product_id, 'SÃO SEBASTIÃO', '18', -15.920105, -15.915614, -47.760744, -47.756073),
        ('SS-25', 'Quadrante 25', v_product_id, 'SÃO SEBASTIÃO', '18', -15.920105, -15.915614, -47.756073, -47.751401),
        ('SS-26', 'Quadrante 26', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.770088, -47.765416),
        ('SS-27', 'Quadrante 27', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.765416, -47.760744),
        ('SS-28', 'Quadrante 28', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.760744, -47.756073),
        ('SS-29', 'Quadrante 29', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.756073, -47.751401),
        ('SS-30', 'Quadrante 30', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.751401, -47.746729),
        ('SS-31', 'Quadrante 31', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.728043, -47.723371),
        ('SS-32', 'Quadrante 32', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.709356, -47.704684),
        ('SS-33', 'Quadrante 33', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.704684, -47.700012),
        ('SS-34', 'Quadrante 34', v_product_id, 'SÃO SEBASTIÃO', '18', -15.915614, -15.911122, -47.700012, -47.695341),
        ('SS-35', 'Quadrante 35', v_product_id, 'SÃO SEBASTIÃO', '18', -15.911122, -15.906631, -47.779431, -47.774760),
        ('SS-36', 'Quadrante 36', v_product_id, 'SÃO SEBASTIÃO', '18', -15.911122, -15.906631, -47.765416, -47.760744),
        ('SS-37', 'Quadrante 37', v_product_id, 'SÃO SEBASTIÃO', '18', -15.911122, -15.906631, -47.760744, -47.756073),
        ('SS-38', 'Quadrante 38', v_product_id, 'SÃO SEBASTIÃO', '18', -15.911122, -15.906631, -47.756073, -47.751401),
        ('SS-39', 'Quadrante 39', v_product_id, 'SÃO SEBASTIÃO', '18', -15.911122, -15.906631, -47.728043, -47.723371),
        ('SS-40', 'Quadrante 40', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.788775, -47.784103),
        ('SS-41', 'Quadrante 41', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.784103, -47.779431),
        ('SS-42', 'Quadrante 42', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.779431, -47.774760),
        ('SS-43', 'Quadrante 43', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.774760, -47.770088),
        ('SS-44', 'Quadrante 44', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.770088, -47.765416),
        ('SS-45', 'Quadrante 45', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.765416, -47.760744),
        ('SS-46', 'Quadrante 46', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.760744, -47.756073),
        ('SS-47', 'Quadrante 47', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.756073, -47.751401),
        ('SS-48', 'Quadrante 48', v_product_id, 'SÃO SEBASTIÃO', '18', -15.906631, -15.902139, -47.742058, -47.737386),
        ('SS-49', 'Quadrante 49', v_product_id, 'SÃO SEBASTIÃO', '18', -15.902139, -15.897648, -47.788775, -47.784103),
        ('SS-50', 'Quadrante 50', v_product_id, 'SÃO SEBASTIÃO', '18', -15.902139, -15.897648, -47.784103, -47.779431),
        ('SS-51', 'Quadrante 51', v_product_id, 'SÃO SEBASTIÃO', '18', -15.902139, -15.897648, -47.779431, -47.774760),
        ('SS-52', 'Quadrante 52', v_product_id, 'SÃO SEBASTIÃO', '18', -15.902139, -15.897648, -47.774760, -47.770088),
        ('SS-53', 'Quadrante 53', v_product_id, 'SÃO SEBASTIÃO', '18', -15.897648, -15.893156, -47.788775, -47.784103),
        ('SS-54', 'Quadrante 54', v_product_id, 'SÃO SEBASTIÃO', '18', -15.897648, -15.893156, -47.784103, -47.779431),
        ('SS-55', 'Quadrante 55', v_product_id, 'SÃO SEBASTIÃO', '18', -15.897648, -15.893156, -47.779431, -47.774760),
        ('SS-56', 'Quadrante 56', v_product_id, 'SÃO SEBASTIÃO', '18', -15.893156, -15.888665, -47.784103, -47.779431),
        ('SS-57', 'Quadrante 57', v_product_id, 'SÃO SEBASTIÃO', '18', -15.893156, -15.888665, -47.779431, -47.774760),
        ('SS-58', 'Quadrante 58', v_product_id, 'SÃO SEBASTIÃO', '18', -15.888665, -15.884173, -47.793446, -47.788775),
        ('SS-59', 'Quadrante 59', v_product_id, 'SÃO SEBASTIÃO', '18', -15.884173, -15.879681, -47.793446, -47.788775),
        ('SS-60', 'Quadrante 60', v_product_id, 'SÃO SEBASTIÃO', '18', -15.879681, -15.875190, -47.798118, -47.793446),
        ('SS-61', 'Quadrante 61', v_product_id, 'SÃO SEBASTIÃO', '18', -15.879681, -15.875190, -47.793446, -47.788775),
        ('SS-62', 'Quadrante 62', v_product_id, 'SÃO SEBASTIÃO', '18', -15.875190, -15.875127, -47.793446, -47.788775);
END $$;

-- ------------------------------------------------------------
-- SOBRADINHO II (SI) — 60 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'SOBRADINHO II' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — SOBRADINHO II', 'SOBRADINHO II', '5')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('SI-01', 'Quadrante 1', v_product_id, 'SOBRADINHO II', '5', -15.688227, -15.683736, -47.857189, -47.852526),
        ('SI-02', 'Quadrante 2', v_product_id, 'SOBRADINHO II', '5', -15.683736, -15.679244, -47.852526, -47.847863),
        ('SI-03', 'Quadrante 3', v_product_id, 'SOBRADINHO II', '5', -15.683736, -15.679244, -47.847863, -47.843199),
        ('SI-04', 'Quadrante 4', v_product_id, 'SOBRADINHO II', '5', -15.683736, -15.679244, -47.843199, -47.838536),
        ('SI-05', 'Quadrante 5', v_product_id, 'SOBRADINHO II', '5', -15.679244, -15.674753, -47.847863, -47.843199),
        ('SI-06', 'Quadrante 6', v_product_id, 'SOBRADINHO II', '5', -15.679244, -15.674753, -47.833873, -47.829210),
        ('SI-07', 'Quadrante 7', v_product_id, 'SOBRADINHO II', '5', -15.679244, -15.674753, -47.829210, -47.824547),
        ('SI-08', 'Quadrante 8', v_product_id, 'SOBRADINHO II', '5', -15.674753, -15.670261, -47.857189, -47.852526),
        ('SI-09', 'Quadrante 9', v_product_id, 'SOBRADINHO II', '5', -15.674753, -15.670261, -47.852526, -47.847863),
        ('SI-10', 'Quadrante 10', v_product_id, 'SOBRADINHO II', '5', -15.674753, -15.670261, -47.847863, -47.843199),
        ('SI-11', 'Quadrante 11', v_product_id, 'SOBRADINHO II', '5', -15.674753, -15.670261, -47.843199, -47.838536),
        ('SI-12', 'Quadrante 12', v_product_id, 'SOBRADINHO II', '5', -15.674753, -15.670261, -47.824547, -47.819883),
        ('SI-13', 'Quadrante 13', v_product_id, 'SOBRADINHO II', '5', -15.670261, -15.665770, -47.857189, -47.852526),
        ('SI-14', 'Quadrante 14', v_product_id, 'SOBRADINHO II', '5', -15.670261, -15.665770, -47.852526, -47.847863),
        ('SI-15', 'Quadrante 15', v_product_id, 'SOBRADINHO II', '5', -15.670261, -15.665770, -47.847863, -47.843199),
        ('SI-16', 'Quadrante 16', v_product_id, 'SOBRADINHO II', '5', -15.670261, -15.665770, -47.843199, -47.838536),
        ('SI-17', 'Quadrante 17', v_product_id, 'SOBRADINHO II', '5', -15.670261, -15.665770, -47.838536, -47.833873),
        ('SI-18', 'Quadrante 18', v_product_id, 'SOBRADINHO II', '5', -15.665770, -15.661278, -47.857189, -47.852526),
        ('SI-19', 'Quadrante 19', v_product_id, 'SOBRADINHO II', '5', -15.665770, -15.661278, -47.852526, -47.847863),
        ('SI-20', 'Quadrante 20', v_product_id, 'SOBRADINHO II', '5', -15.665770, -15.661278, -47.843199, -47.838536),
        ('SI-21', 'Quadrante 21', v_product_id, 'SOBRADINHO II', '5', -15.665770, -15.661278, -47.838536, -47.833873),
        ('SI-22', 'Quadrante 22', v_product_id, 'SOBRADINHO II', '5', -15.665770, -15.661278, -47.833873, -47.829210),
        ('SI-23', 'Quadrante 23', v_product_id, 'SOBRADINHO II', '5', -15.661278, -15.656787, -47.861852, -47.857189),
        ('SI-24', 'Quadrante 24', v_product_id, 'SOBRADINHO II', '5', -15.661278, -15.656787, -47.847863, -47.843199),
        ('SI-25', 'Quadrante 25', v_product_id, 'SOBRADINHO II', '5', -15.661278, -15.656787, -47.843199, -47.838536),
        ('SI-26', 'Quadrante 26', v_product_id, 'SOBRADINHO II', '5', -15.661278, -15.656787, -47.838536, -47.833873),
        ('SI-27', 'Quadrante 27', v_product_id, 'SOBRADINHO II', '5', -15.656787, -15.652295, -47.871179, -47.866516),
        ('SI-28', 'Quadrante 28', v_product_id, 'SOBRADINHO II', '5', -15.656787, -15.652295, -47.866516, -47.861852),
        ('SI-29', 'Quadrante 29', v_product_id, 'SOBRADINHO II', '5', -15.656787, -15.652295, -47.861852, -47.857189),
        ('SI-30', 'Quadrante 30', v_product_id, 'SOBRADINHO II', '5', -15.656787, -15.652295, -47.843199, -47.838536),
        ('SI-31', 'Quadrante 31', v_product_id, 'SOBRADINHO II', '5', -15.652295, -15.647803, -47.843199, -47.838536),
        ('SI-32', 'Quadrante 32', v_product_id, 'SOBRADINHO II', '5', -15.652295, -15.647803, -47.829210, -47.824547),
        ('SI-33', 'Quadrante 33', v_product_id, 'SOBRADINHO II', '5', -15.652295, -15.647803, -47.824547, -47.819883),
        ('SI-34', 'Quadrante 34', v_product_id, 'SOBRADINHO II', '5', -15.652295, -15.647803, -47.819883, -47.815220),
        ('SI-35', 'Quadrante 35', v_product_id, 'SOBRADINHO II', '5', -15.647803, -15.643312, -47.838536, -47.833873),
        ('SI-36', 'Quadrante 36', v_product_id, 'SOBRADINHO II', '5', -15.647803, -15.643312, -47.833873, -47.829210),
        ('SI-37', 'Quadrante 37', v_product_id, 'SOBRADINHO II', '5', -15.647803, -15.643312, -47.829210, -47.824547),
        ('SI-38', 'Quadrante 38', v_product_id, 'SOBRADINHO II', '5', -15.647803, -15.643312, -47.824547, -47.819883),
        ('SI-39', 'Quadrante 39', v_product_id, 'SOBRADINHO II', '5', -15.647803, -15.643312, -47.819883, -47.815220),
        ('SI-40', 'Quadrante 40', v_product_id, 'SOBRADINHO II', '5', -15.643312, -15.638820, -47.885169, -47.880505),
        ('SI-41', 'Quadrante 41', v_product_id, 'SOBRADINHO II', '5', -15.643312, -15.638820, -47.829210, -47.824547),
        ('SI-42', 'Quadrante 42', v_product_id, 'SOBRADINHO II', '5', -15.643312, -15.638820, -47.824547, -47.819883),
        ('SI-43', 'Quadrante 43', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.852526, -47.847863),
        ('SI-44', 'Quadrante 44', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.847863, -47.843199),
        ('SI-45', 'Quadrante 45', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.843199, -47.838536),
        ('SI-46', 'Quadrante 46', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.838536, -47.833873),
        ('SI-47', 'Quadrante 47', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.833873, -47.829210),
        ('SI-48', 'Quadrante 48', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.829210, -47.824547),
        ('SI-49', 'Quadrante 49', v_product_id, 'SOBRADINHO II', '5', -15.638820, -15.634329, -47.824547, -47.819883),
        ('SI-50', 'Quadrante 50', v_product_id, 'SOBRADINHO II', '5', -15.634329, -15.629837, -47.852526, -47.847863),
        ('SI-51', 'Quadrante 51', v_product_id, 'SOBRADINHO II', '5', -15.634329, -15.629837, -47.843199, -47.838536),
        ('SI-52', 'Quadrante 52', v_product_id, 'SOBRADINHO II', '5', -15.634329, -15.629837, -47.838536, -47.833873),
        ('SI-53', 'Quadrante 53', v_product_id, 'SOBRADINHO II', '5', -15.634329, -15.629837, -47.833873, -47.829210),
        ('SI-54', 'Quadrante 54', v_product_id, 'SOBRADINHO II', '5', -15.634329, -15.629837, -47.829210, -47.824547),
        ('SI-55', 'Quadrante 55', v_product_id, 'SOBRADINHO II', '5', -15.629837, -15.625346, -47.838536, -47.833873),
        ('SI-56', 'Quadrante 56', v_product_id, 'SOBRADINHO II', '5', -15.629837, -15.625346, -47.833873, -47.829210),
        ('SI-57', 'Quadrante 57', v_product_id, 'SOBRADINHO II', '5', -15.629837, -15.625346, -47.829210, -47.824547),
        ('SI-58', 'Quadrante 58', v_product_id, 'SOBRADINHO II', '5', -15.625346, -15.620854, -47.847863, -47.843199),
        ('SI-59', 'Quadrante 59', v_product_id, 'SOBRADINHO II', '5', -15.625346, -15.620854, -47.838536, -47.833873),
        ('SI-60', 'Quadrante 60', v_product_id, 'SOBRADINHO II', '5', -15.620854, -15.616363, -47.824547, -47.819883);
END $$;

-- ------------------------------------------------------------
-- AGUA QUENTE (AQ) — 11 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'AGUA QUENTE' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — AGUA QUENTE', 'AGUA QUENTE', '13')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('AQ-01', 'Quadrante 1', v_product_id, 'AGUA QUENTE', '13', -15.949335, -15.944844, -48.234820, -48.230149),
        ('AQ-02', 'Quadrante 2', v_product_id, 'AGUA QUENTE', '13', -15.949335, -15.944844, -48.225477, -48.220806),
        ('AQ-03', 'Quadrante 3', v_product_id, 'AGUA QUENTE', '13', -15.944844, -15.940352, -48.244162, -48.239491),
        ('AQ-04', 'Quadrante 4', v_product_id, 'AGUA QUENTE', '13', -15.944844, -15.940352, -48.239491, -48.234820),
        ('AQ-05', 'Quadrante 5', v_product_id, 'AGUA QUENTE', '13', -15.944844, -15.940352, -48.234820, -48.230149),
        ('AQ-06', 'Quadrante 6', v_product_id, 'AGUA QUENTE', '13', -15.944844, -15.940352, -48.225477, -48.220806),
        ('AQ-07', 'Quadrante 7', v_product_id, 'AGUA QUENTE', '13', -15.940352, -15.935861, -48.253505, -48.248834),
        ('AQ-08', 'Quadrante 8', v_product_id, 'AGUA QUENTE', '13', -15.940352, -15.935861, -48.244162, -48.239491),
        ('AQ-09', 'Quadrante 9', v_product_id, 'AGUA QUENTE', '13', -15.940352, -15.935861, -48.239491, -48.234820),
        ('AQ-10', 'Quadrante 10', v_product_id, 'AGUA QUENTE', '13', -15.940352, -15.935861, -48.230149, -48.225477),
        ('AQ-11', 'Quadrante 11', v_product_id, 'AGUA QUENTE', '13', -15.940352, -15.935861, -48.225477, -48.220806);
END $$;

-- ------------------------------------------------------------
-- BRAZLÂNDIA (BRA) — 35 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'BRAZLÂNDIA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — BRAZLÂNDIA', 'BRAZLÂNDIA', '2, 16')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('BRA-01', 'Quadrante 1', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.766977, -15.762486, -48.134261, -48.129597),
        ('BRA-02', 'Quadrante 2', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.757994, -15.753503, -48.115604, -48.110940),
        ('BRA-03', 'Quadrante 3', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.744520, -15.740028, -48.176239, -48.171574),
        ('BRA-04', 'Quadrante 4', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.744520, -15.740028, -48.171574, -48.166910),
        ('BRA-05', 'Quadrante 5', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.731045, -15.726553, -48.101612, -48.096948),
        ('BRA-06', 'Quadrante 6', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.699604, -15.695112, -48.110940, -48.106276),
        ('BRA-07', 'Quadrante 7', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.699604, -15.695112, -48.092283, -48.087619),
        ('BRA-08', 'Quadrante 8', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.695112, -15.690621, -48.096948, -48.092283),
        ('BRA-09', 'Quadrante 9', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.695112, -15.690621, -48.092283, -48.087619),
        ('BRA-10', 'Quadrante 10', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.690621, -15.686129, -48.204224, -48.199559),
        ('BRA-11', 'Quadrante 11', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.690621, -15.686129, -48.199559, -48.194895),
        ('BRA-12', 'Quadrante 12', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.686129, -15.681638, -48.204224, -48.199559),
        ('BRA-13', 'Quadrante 13', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.686129, -15.681638, -48.199559, -48.194895),
        ('BRA-14', 'Quadrante 14', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.686129, -15.681638, -48.194895, -48.190231),
        ('BRA-15', 'Quadrante 15', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.681638, -15.677146, -48.204224, -48.199559),
        ('BRA-16', 'Quadrante 16', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.681638, -15.677146, -48.199559, -48.194895),
        ('BRA-17', 'Quadrante 17', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.681638, -15.677146, -48.194895, -48.190231),
        ('BRA-18', 'Quadrante 18', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.681638, -15.677146, -48.190231, -48.185567),
        ('BRA-19', 'Quadrante 19', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.677146, -15.672655, -48.204224, -48.199559),
        ('BRA-20', 'Quadrante 20', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.677146, -15.672655, -48.194895, -48.190231),
        ('BRA-21', 'Quadrante 21', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.677146, -15.672655, -48.190231, -48.185567),
        ('BRA-22', 'Quadrante 22', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.677146, -15.672655, -48.185567, -48.180903),
        ('BRA-23', 'Quadrante 23', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.672655, -15.668163, -48.204224, -48.199559),
        ('BRA-24', 'Quadrante 24', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.672655, -15.668163, -48.194895, -48.190231),
        ('BRA-25', 'Quadrante 25', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.668163, -15.663672, -48.204224, -48.199559),
        ('BRA-26', 'Quadrante 26', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.668163, -15.663672, -48.199559, -48.194895),
        ('BRA-27', 'Quadrante 27', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.663672, -15.659180, -48.204224, -48.199559),
        ('BRA-28', 'Quadrante 28', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.663672, -15.659180, -48.199559, -48.194895),
        ('BRA-29', 'Quadrante 29', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.663672, -15.659180, -48.194895, -48.190231),
        ('BRA-30', 'Quadrante 30', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.659180, -15.654688, -48.204224, -48.199559),
        ('BRA-31', 'Quadrante 31', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.659180, -15.654688, -48.199559, -48.194895),
        ('BRA-32', 'Quadrante 32', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.659180, -15.654688, -48.194895, -48.190231),
        ('BRA-33', 'Quadrante 33', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.654688, -15.650197, -48.204224, -48.199559),
        ('BRA-34', 'Quadrante 34', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.641214, -15.636722, -48.208888, -48.204224),
        ('BRA-35', 'Quadrante 35', v_product_id, 'BRAZLÂNDIA', '2, 16', -15.533416, -15.528925, -48.190231, -48.185567);
END $$;

-- ------------------------------------------------------------
-- FERCAL (FER) — 9 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'FERCAL' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — FERCAL', 'FERCAL', '5')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('FER-01', 'Quadrante 1', v_product_id, 'FERCAL', '5', -15.611199, -15.606707, -47.882710, -47.878048),
        ('FER-02', 'Quadrante 2', v_product_id, 'FERCAL', '5', -15.606707, -15.602216, -47.873386, -47.868723),
        ('FER-03', 'Quadrante 3', v_product_id, 'FERCAL', '5', -15.602216, -15.597724, -47.882710, -47.878048),
        ('FER-04', 'Quadrante 4', v_product_id, 'FERCAL', '5', -15.602216, -15.597724, -47.878048, -47.873386),
        ('FER-05', 'Quadrante 5', v_product_id, 'FERCAL', '5', -15.602216, -15.597724, -47.873386, -47.868723),
        ('FER-06', 'Quadrante 6', v_product_id, 'FERCAL', '5', -15.588741, -15.584250, -47.920010, -47.915348),
        ('FER-07', 'Quadrante 7', v_product_id, 'FERCAL', '5', -15.588741, -15.584250, -47.878048, -47.873386),
        ('FER-08', 'Quadrante 8', v_product_id, 'FERCAL', '5', -15.588741, -15.584250, -47.864061, -47.859398),
        ('FER-09', 'Quadrante 9', v_product_id, 'FERCAL', '5', -15.570775, -15.566283, -47.854736, -47.850073);
END $$;

-- ------------------------------------------------------------
-- JARDIM BOTÂNICO (JB) — 127 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'JARDIM BOTÂNICO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — JARDIM BOTÂNICO', 'JARDIM BOTÂNICO', '18')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('JB-01', 'Quadrante 1', v_product_id, 'JARDIM BOTÂNICO', '18', -15.996462, -15.991970, -47.828486, -47.823815),
        ('JB-02', 'Quadrante 2', v_product_id, 'JARDIM BOTÂNICO', '18', -15.996462, -15.991970, -47.823815, -47.819144),
        ('JB-03', 'Quadrante 3', v_product_id, 'JARDIM BOTÂNICO', '18', -15.991970, -15.987479, -47.828486, -47.823815),
        ('JB-04', 'Quadrante 4', v_product_id, 'JARDIM BOTÂNICO', '18', -15.991970, -15.987479, -47.823815, -47.819144),
        ('JB-05', 'Quadrante 5', v_product_id, 'JARDIM BOTÂNICO', '18', -15.987479, -15.982987, -47.833156, -47.828486),
        ('JB-06', 'Quadrante 6', v_product_id, 'JARDIM BOTÂNICO', '18', -15.987479, -15.982987, -47.828486, -47.823815),
        ('JB-07', 'Quadrante 7', v_product_id, 'JARDIM BOTÂNICO', '18', -15.987479, -15.982987, -47.823815, -47.819144),
        ('JB-08', 'Quadrante 8', v_product_id, 'JARDIM BOTÂNICO', '18', -15.978496, -15.974004, -47.819144, -47.814473),
        ('JB-09', 'Quadrante 9', v_product_id, 'JARDIM BOTÂNICO', '18', -15.969513, -15.965021, -47.833156, -47.828486),
        ('JB-10', 'Quadrante 10', v_product_id, 'JARDIM BOTÂNICO', '18', -15.969513, -15.965021, -47.828486, -47.823815),
        ('JB-11', 'Quadrante 11', v_product_id, 'JARDIM BOTÂNICO', '18', -15.969513, -15.965021, -47.823815, -47.819144),
        ('JB-12', 'Quadrante 12', v_product_id, 'JARDIM BOTÂNICO', '18', -15.965021, -15.960529, -47.837827, -47.833156),
        ('JB-13', 'Quadrante 13', v_product_id, 'JARDIM BOTÂNICO', '18', -15.965021, -15.960529, -47.833156, -47.828486),
        ('JB-14', 'Quadrante 14', v_product_id, 'JARDIM BOTÂNICO', '18', -15.965021, -15.960529, -47.828486, -47.823815),
        ('JB-15', 'Quadrante 15', v_product_id, 'JARDIM BOTÂNICO', '18', -15.960529, -15.956038, -47.837827, -47.833156),
        ('JB-16', 'Quadrante 16', v_product_id, 'JARDIM BOTÂNICO', '18', -15.956038, -15.951546, -47.837827, -47.833156),
        ('JB-17', 'Quadrante 17', v_product_id, 'JARDIM BOTÂNICO', '18', -15.947055, -15.942563, -47.828486, -47.823815),
        ('JB-18', 'Quadrante 18', v_product_id, 'JARDIM BOTÂNICO', '18', -15.947055, -15.942563, -47.823815, -47.819144),
        ('JB-19', 'Quadrante 19', v_product_id, 'JARDIM BOTÂNICO', '18', -15.947055, -15.942563, -47.819144, -47.814473),
        ('JB-20', 'Quadrante 20', v_product_id, 'JARDIM BOTÂNICO', '18', -15.906631, -15.902139, -47.819144, -47.814473),
        ('JB-21', 'Quadrante 21', v_product_id, 'JARDIM BOTÂNICO', '18', -15.902139, -15.897648, -47.763095, -47.758424),
        ('JB-22', 'Quadrante 22', v_product_id, 'JARDIM BOTÂNICO', '18', -15.897648, -15.893156, -47.809803, -47.805132),
        ('JB-23', 'Quadrante 23', v_product_id, 'JARDIM BOTÂNICO', '18', -15.897648, -15.893156, -47.805132, -47.800461),
        ('JB-24', 'Quadrante 24', v_product_id, 'JARDIM BOTÂNICO', '18', -15.897648, -15.893156, -47.800461, -47.795790),
        ('JB-25', 'Quadrante 25', v_product_id, 'JARDIM BOTÂNICO', '18', -15.893156, -15.888665, -47.819144, -47.814473),
        ('JB-26', 'Quadrante 26', v_product_id, 'JARDIM BOTÂNICO', '18', -15.893156, -15.888665, -47.814473, -47.809803),
        ('JB-27', 'Quadrante 27', v_product_id, 'JARDIM BOTÂNICO', '18', -15.893156, -15.888665, -47.809803, -47.805132),
        ('JB-28', 'Quadrante 28', v_product_id, 'JARDIM BOTÂNICO', '18', -15.893156, -15.888665, -47.805132, -47.800461),
        ('JB-29', 'Quadrante 29', v_product_id, 'JARDIM BOTÂNICO', '18', -15.893156, -15.888665, -47.800461, -47.795790),
        ('JB-30', 'Quadrante 30', v_product_id, 'JARDIM BOTÂNICO', '18', -15.893156, -15.888665, -47.758424, -47.753753),
        ('JB-31', 'Quadrante 31', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.823815, -47.819144),
        ('JB-32', 'Quadrante 32', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.819144, -47.814473),
        ('JB-33', 'Quadrante 33', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.814473, -47.809803),
        ('JB-34', 'Quadrante 34', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.809803, -47.805132),
        ('JB-35', 'Quadrante 35', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.805132, -47.800461),
        ('JB-36', 'Quadrante 36', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.800461, -47.795790),
        ('JB-37', 'Quadrante 37', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.772436, -47.767766),
        ('JB-38', 'Quadrante 38', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.767766, -47.763095),
        ('JB-39', 'Quadrante 39', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.763095, -47.758424),
        ('JB-40', 'Quadrante 40', v_product_id, 'JARDIM BOTÂNICO', '18', -15.888665, -15.884173, -47.758424, -47.753753),
        ('JB-41', 'Quadrante 41', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.823815, -47.819144),
        ('JB-42', 'Quadrante 42', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.819144, -47.814473),
        ('JB-43', 'Quadrante 43', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.814473, -47.809803),
        ('JB-44', 'Quadrante 44', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.809803, -47.805132),
        ('JB-45', 'Quadrante 45', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.805132, -47.800461),
        ('JB-46', 'Quadrante 46', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.800461, -47.795790),
        ('JB-47', 'Quadrante 47', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.777107, -47.772436),
        ('JB-48', 'Quadrante 48', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.772436, -47.767766),
        ('JB-49', 'Quadrante 49', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.767766, -47.763095),
        ('JB-50', 'Quadrante 50', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.763095, -47.758424),
        ('JB-51', 'Quadrante 51', v_product_id, 'JARDIM BOTÂNICO', '18', -15.884173, -15.879681, -47.758424, -47.753753),
        ('JB-52', 'Quadrante 52', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.823815, -47.819144),
        ('JB-53', 'Quadrante 53', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.819144, -47.814473),
        ('JB-54', 'Quadrante 54', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.814473, -47.809803),
        ('JB-55', 'Quadrante 55', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.786449, -47.781778),
        ('JB-56', 'Quadrante 56', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.781778, -47.777107),
        ('JB-57', 'Quadrante 57', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.777107, -47.772436),
        ('JB-58', 'Quadrante 58', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.772436, -47.767766),
        ('JB-59', 'Quadrante 59', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.767766, -47.763095),
        ('JB-60', 'Quadrante 60', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.763095, -47.758424),
        ('JB-61', 'Quadrante 61', v_product_id, 'JARDIM BOTÂNICO', '18', -15.879681, -15.875190, -47.758424, -47.753753),
        ('JB-62', 'Quadrante 62', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.823815, -47.819144),
        ('JB-63', 'Quadrante 63', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.819144, -47.814473),
        ('JB-64', 'Quadrante 64', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.800461, -47.795790),
        ('JB-65', 'Quadrante 65', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.772436, -47.767766),
        ('JB-66', 'Quadrante 66', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.767766, -47.763095),
        ('JB-67', 'Quadrante 67', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.763095, -47.758424),
        ('JB-68', 'Quadrante 68', v_product_id, 'JARDIM BOTÂNICO', '18', -15.875190, -15.870698, -47.758424, -47.753753),
        ('JB-69', 'Quadrante 69', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.823815, -47.819144),
        ('JB-70', 'Quadrante 70', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.819144, -47.814473),
        ('JB-71', 'Quadrante 71', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.814473, -47.809803),
        ('JB-72', 'Quadrante 72', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.800461, -47.795790),
        ('JB-73', 'Quadrante 73', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.795790, -47.791119),
        ('JB-74', 'Quadrante 74', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.786449, -47.781778),
        ('JB-75', 'Quadrante 75', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.767766, -47.763095),
        ('JB-76', 'Quadrante 76', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.763095, -47.758424),
        ('JB-77', 'Quadrante 77', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.758424, -47.753753),
        ('JB-78', 'Quadrante 78', v_product_id, 'JARDIM BOTÂNICO', '18', -15.870698, -15.866207, -47.753753, -47.749083),
        ('JB-79', 'Quadrante 79', v_product_id, 'JARDIM BOTÂNICO', '18', -15.866207, -15.861715, -47.819144, -47.814473),
        ('JB-80', 'Quadrante 80', v_product_id, 'JARDIM BOTÂNICO', '18', -15.866207, -15.861715, -47.791119, -47.786449),
        ('JB-81', 'Quadrante 81', v_product_id, 'JARDIM BOTÂNICO', '18', -15.866207, -15.861715, -47.763095, -47.758424),
        ('JB-82', 'Quadrante 82', v_product_id, 'JARDIM BOTÂNICO', '18', -15.866207, -15.861715, -47.753753, -47.749083),
        ('JB-83', 'Quadrante 83', v_product_id, 'JARDIM BOTÂNICO', '18', -15.866207, -15.861715, -47.749083, -47.744412),
        ('JB-84', 'Quadrante 84', v_product_id, 'JARDIM BOTÂNICO', '18', -15.861715, -15.857224, -47.819144, -47.814473),
        ('JB-85', 'Quadrante 85', v_product_id, 'JARDIM BOTÂNICO', '18', -15.861715, -15.857224, -47.814473, -47.809803),
        ('JB-86', 'Quadrante 86', v_product_id, 'JARDIM BOTÂNICO', '18', -15.861715, -15.857224, -47.791119, -47.786449),
        ('JB-87', 'Quadrante 87', v_product_id, 'JARDIM BOTÂNICO', '18', -15.861715, -15.857224, -47.763095, -47.758424),
        ('JB-88', 'Quadrante 88', v_product_id, 'JARDIM BOTÂNICO', '18', -15.861715, -15.857224, -47.758424, -47.753753),
        ('JB-89', 'Quadrante 89', v_product_id, 'JARDIM BOTÂNICO', '18', -15.861715, -15.857224, -47.753753, -47.749083),
        ('JB-90', 'Quadrante 90', v_product_id, 'JARDIM BOTÂNICO', '18', -15.857224, -15.852732, -47.819144, -47.814473),
        ('JB-91', 'Quadrante 91', v_product_id, 'JARDIM BOTÂNICO', '18', -15.857224, -15.852732, -47.763095, -47.758424),
        ('JB-92', 'Quadrante 92', v_product_id, 'JARDIM BOTÂNICO', '18', -15.857224, -15.852732, -47.753753, -47.749083),
        ('JB-93', 'Quadrante 93', v_product_id, 'JARDIM BOTÂNICO', '18', -15.857224, -15.852732, -47.749083, -47.744412),
        ('JB-94', 'Quadrante 94', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.814473, -47.809803),
        ('JB-95', 'Quadrante 95', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.795790, -47.791119),
        ('JB-96', 'Quadrante 96', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.791119, -47.786449),
        ('JB-97', 'Quadrante 97', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.786449, -47.781778),
        ('JB-98', 'Quadrante 98', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.763095, -47.758424),
        ('JB-99', 'Quadrante 99', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.758424, -47.753753),
        ('JB-100', 'Quadrante 100', v_product_id, 'JARDIM BOTÂNICO', '18', -15.852732, -15.848241, -47.753753, -47.749083),
        ('JB-101', 'Quadrante 101', v_product_id, 'JARDIM BOTÂNICO', '18', -15.848241, -15.843749, -47.809803, -47.805132),
        ('JB-102', 'Quadrante 102', v_product_id, 'JARDIM BOTÂNICO', '18', -15.848241, -15.843749, -47.805132, -47.800461),
        ('JB-103', 'Quadrante 103', v_product_id, 'JARDIM BOTÂNICO', '18', -15.848241, -15.843749, -47.800461, -47.795790),
        ('JB-104', 'Quadrante 104', v_product_id, 'JARDIM BOTÂNICO', '18', -15.848241, -15.843749, -47.791119, -47.786449),
        ('JB-105', 'Quadrante 105', v_product_id, 'JARDIM BOTÂNICO', '18', -15.848241, -15.843749, -47.786449, -47.781778),
        ('JB-106', 'Quadrante 106', v_product_id, 'JARDIM BOTÂNICO', '18', -15.848241, -15.843749, -47.758424, -47.753753),
        ('JB-107', 'Quadrante 107', v_product_id, 'JARDIM BOTÂNICO', '18', -15.843749, -15.839257, -47.809803, -47.805132),
        ('JB-108', 'Quadrante 108', v_product_id, 'JARDIM BOTÂNICO', '18', -15.843749, -15.839257, -47.805132, -47.800461),
        ('JB-109', 'Quadrante 109', v_product_id, 'JARDIM BOTÂNICO', '18', -15.843749, -15.839257, -47.800461, -47.795790),
        ('JB-110', 'Quadrante 110', v_product_id, 'JARDIM BOTÂNICO', '18', -15.843749, -15.839257, -47.781778, -47.777107),
        ('JB-111', 'Quadrante 111', v_product_id, 'JARDIM BOTÂNICO', '18', -15.839257, -15.834766, -47.805132, -47.800461),
        ('JB-112', 'Quadrante 112', v_product_id, 'JARDIM BOTÂNICO', '18', -15.834766, -15.830274, -47.800461, -47.795790),
        ('JB-113', 'Quadrante 113', v_product_id, 'JARDIM BOTÂNICO', '18', -15.830274, -15.825783, -47.800461, -47.795790),
        ('JB-114', 'Quadrante 114', v_product_id, 'JARDIM BOTÂNICO', '18', -15.830274, -15.825783, -47.795790, -47.791119),
        ('JB-115', 'Quadrante 115', v_product_id, 'JARDIM BOTÂNICO', '18', -15.830274, -15.825783, -47.791119, -47.786449),
        ('JB-116', 'Quadrante 116', v_product_id, 'JARDIM BOTÂNICO', '18', -15.825783, -15.821291, -47.795790, -47.791119),
        ('JB-117', 'Quadrante 117', v_product_id, 'JARDIM BOTÂNICO', '18', -15.825783, -15.821291, -47.791119, -47.786449),
        ('JB-118', 'Quadrante 118', v_product_id, 'JARDIM BOTÂNICO', '18', -15.821291, -15.816800, -47.791119, -47.786449),
        ('JB-119', 'Quadrante 119', v_product_id, 'JARDIM BOTÂNICO', '18', -15.821291, -15.816800, -47.786449, -47.781778),
        ('JB-120', 'Quadrante 120', v_product_id, 'JARDIM BOTÂNICO', '18', -15.821291, -15.816800, -47.781778, -47.777107),
        ('JB-121', 'Quadrante 121', v_product_id, 'JARDIM BOTÂNICO', '18', -15.821291, -15.816800, -47.777107, -47.772436),
        ('JB-122', 'Quadrante 122', v_product_id, 'JARDIM BOTÂNICO', '18', -15.816800, -15.812308, -47.791119, -47.786449),
        ('JB-123', 'Quadrante 123', v_product_id, 'JARDIM BOTÂNICO', '18', -15.816800, -15.812308, -47.786449, -47.781778),
        ('JB-124', 'Quadrante 124', v_product_id, 'JARDIM BOTÂNICO', '18', -15.812308, -15.807817, -47.786449, -47.781778),
        ('JB-125', 'Quadrante 125', v_product_id, 'JARDIM BOTÂNICO', '18', -15.812308, -15.807817, -47.781778, -47.777107),
        ('JB-126', 'Quadrante 126', v_product_id, 'JARDIM BOTÂNICO', '18', -15.812308, -15.807817, -47.777107, -47.772436),
        ('JB-127', 'Quadrante 127', v_product_id, 'JARDIM BOTÂNICO', '18', -15.807817, -15.803325, -47.777107, -47.772436);
END $$;

-- ------------------------------------------------------------
-- PARANOÁ (PAR) — 88 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'PARANOÁ' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — PARANOÁ', 'PARANOÁ', '2, 18')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('PAR-01', 'Quadrante 1', v_product_id, 'PARANOÁ', '2, 18', -16.018902, -16.014410, -47.383519, -47.378849),
        ('PAR-02', 'Quadrante 2', v_product_id, 'PARANOÁ', '2, 18', -16.009919, -16.005427, -47.560978, -47.556308),
        ('PAR-03', 'Quadrante 3', v_product_id, 'PARANOÁ', '2, 18', -16.005427, -16.000936, -47.565648, -47.560978),
        ('PAR-04', 'Quadrante 4', v_product_id, 'PARANOÁ', '2, 18', -16.005427, -16.000936, -47.560978, -47.556308),
        ('PAR-05', 'Quadrante 5', v_product_id, 'PARANOÁ', '2, 18', -15.965003, -15.960512, -47.663717, -47.659047),
        ('PAR-06', 'Quadrante 6', v_product_id, 'PARANOÁ', '2, 18', -15.965003, -15.960512, -47.560978, -47.556308),
        ('PAR-07', 'Quadrante 7', v_product_id, 'PARANOÁ', '2, 18', -15.947037, -15.942545, -47.584328, -47.579658),
        ('PAR-08', 'Quadrante 8', v_product_id, 'PARANOÁ', '2, 18', -15.942545, -15.938054, -47.593668, -47.588998),
        ('PAR-09', 'Quadrante 9', v_product_id, 'PARANOÁ', '2, 18', -15.942545, -15.938054, -47.584328, -47.579658),
        ('PAR-10', 'Quadrante 10', v_product_id, 'PARANOÁ', '2, 18', -15.942545, -15.938054, -47.579658, -47.574988),
        ('PAR-11', 'Quadrante 11', v_product_id, 'PARANOÁ', '2, 18', -15.942545, -15.938054, -47.574988, -47.570318),
        ('PAR-12', 'Quadrante 12', v_product_id, 'PARANOÁ', '2, 18', -15.942545, -15.938054, -47.570318, -47.565648),
        ('PAR-13', 'Quadrante 13', v_product_id, 'PARANOÁ', '2, 18', -15.942545, -15.938054, -47.565648, -47.560978),
        ('PAR-14', 'Quadrante 14', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.603008, -47.598338),
        ('PAR-15', 'Quadrante 15', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.598338, -47.593668),
        ('PAR-16', 'Quadrante 16', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.593668, -47.588998),
        ('PAR-17', 'Quadrante 17', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.588998, -47.584328),
        ('PAR-18', 'Quadrante 18', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.584328, -47.579658),
        ('PAR-19', 'Quadrante 19', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.579658, -47.574988),
        ('PAR-20', 'Quadrante 20', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.574988, -47.570318),
        ('PAR-21', 'Quadrante 21', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.570318, -47.565648),
        ('PAR-22', 'Quadrante 22', v_product_id, 'PARANOÁ', '2, 18', -15.938054, -15.933562, -47.565648, -47.560978),
        ('PAR-23', 'Quadrante 23', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.607678, -47.603008),
        ('PAR-24', 'Quadrante 24', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.603008, -47.598338),
        ('PAR-25', 'Quadrante 25', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.598338, -47.593668),
        ('PAR-26', 'Quadrante 26', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.593668, -47.588998),
        ('PAR-27', 'Quadrante 27', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.588998, -47.584328),
        ('PAR-28', 'Quadrante 28', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.584328, -47.579658),
        ('PAR-29', 'Quadrante 29', v_product_id, 'PARANOÁ', '2, 18', -15.933562, -15.929071, -47.579658, -47.574988),
        ('PAR-30', 'Quadrante 30', v_product_id, 'PARANOÁ', '2, 18', -15.929071, -15.924579, -47.607678, -47.603008),
        ('PAR-31', 'Quadrante 31', v_product_id, 'PARANOÁ', '2, 18', -15.929071, -15.924579, -47.603008, -47.598338),
        ('PAR-32', 'Quadrante 32', v_product_id, 'PARANOÁ', '2, 18', -15.929071, -15.924579, -47.598338, -47.593668),
        ('PAR-33', 'Quadrante 33', v_product_id, 'PARANOÁ', '2, 18', -15.929071, -15.924579, -47.593668, -47.588998),
        ('PAR-34', 'Quadrante 34', v_product_id, 'PARANOÁ', '2, 18', -15.929071, -15.924579, -47.588998, -47.584328),
        ('PAR-35', 'Quadrante 35', v_product_id, 'PARANOÁ', '2, 18', -15.924579, -15.920088, -47.607678, -47.603008),
        ('PAR-36', 'Quadrante 36', v_product_id, 'PARANOÁ', '2, 18', -15.924579, -15.920088, -47.603008, -47.598338),
        ('PAR-37', 'Quadrante 37', v_product_id, 'PARANOÁ', '2, 18', -15.924579, -15.920088, -47.598338, -47.593668),
        ('PAR-38', 'Quadrante 38', v_product_id, 'PARANOÁ', '2, 18', -15.924579, -15.920088, -47.593668, -47.588998),
        ('PAR-39', 'Quadrante 39', v_product_id, 'PARANOÁ', '2, 18', -15.920088, -15.915596, -47.607678, -47.603008),
        ('PAR-40', 'Quadrante 40', v_product_id, 'PARANOÁ', '2, 18', -15.920088, -15.915596, -47.598338, -47.593668),
        ('PAR-41', 'Quadrante 41', v_product_id, 'PARANOÁ', '2, 18', -15.920088, -15.915596, -47.593668, -47.588998),
        ('PAR-42', 'Quadrante 42', v_product_id, 'PARANOÁ', '2, 18', -15.906613, -15.902121, -47.518948, -47.514278),
        ('PAR-43', 'Quadrante 43', v_product_id, 'PARANOÁ', '2, 18', -15.843731, -15.839240, -47.747777, -47.743107),
        ('PAR-44', 'Quadrante 44', v_product_id, 'PARANOÁ', '2, 18', -15.843731, -15.839240, -47.743107, -47.738437),
        ('PAR-45', 'Quadrante 45', v_product_id, 'PARANOÁ', '2, 18', -15.839240, -15.834748, -47.747777, -47.743107),
        ('PAR-46', 'Quadrante 46', v_product_id, 'PARANOÁ', '2, 18', -15.839240, -15.834748, -47.743107, -47.738437),
        ('PAR-47', 'Quadrante 47', v_product_id, 'PARANOÁ', '2, 18', -15.834748, -15.830256, -47.752447, -47.747777),
        ('PAR-48', 'Quadrante 48', v_product_id, 'PARANOÁ', '2, 18', -15.834748, -15.830256, -47.747777, -47.743107),
        ('PAR-49', 'Quadrante 49', v_product_id, 'PARANOÁ', '2, 18', -15.834748, -15.830256, -47.743107, -47.738437),
        ('PAR-50', 'Quadrante 50', v_product_id, 'PARANOÁ', '2, 18', -15.830256, -15.825765, -47.752447, -47.747777),
        ('PAR-51', 'Quadrante 51', v_product_id, 'PARANOÁ', '2, 18', -15.830256, -15.825765, -47.747777, -47.743107),
        ('PAR-52', 'Quadrante 52', v_product_id, 'PARANOÁ', '2, 18', -15.830256, -15.825765, -47.743107, -47.738437),
        ('PAR-53', 'Quadrante 53', v_product_id, 'PARANOÁ', '2, 18', -15.830256, -15.825765, -47.738437, -47.733767),
        ('PAR-54', 'Quadrante 54', v_product_id, 'PARANOÁ', '2, 18', -15.825765, -15.821273, -47.752447, -47.747777),
        ('PAR-55', 'Quadrante 55', v_product_id, 'PARANOÁ', '2, 18', -15.825765, -15.821273, -47.747777, -47.743107),
        ('PAR-56', 'Quadrante 56', v_product_id, 'PARANOÁ', '2, 18', -15.825765, -15.821273, -47.743107, -47.738437),
        ('PAR-57', 'Quadrante 57', v_product_id, 'PARANOÁ', '2, 18', -15.825765, -15.821273, -47.738437, -47.733767),
        ('PAR-58', 'Quadrante 58', v_product_id, 'PARANOÁ', '2, 18', -15.821273, -15.816782, -47.747777, -47.743107),
        ('PAR-59', 'Quadrante 59', v_product_id, 'PARANOÁ', '2, 18', -15.821273, -15.816782, -47.743107, -47.738437),
        ('PAR-60', 'Quadrante 60', v_product_id, 'PARANOÁ', '2, 18', -15.798816, -15.794324, -47.696407, -47.691737),
        ('PAR-61', 'Quadrante 61', v_product_id, 'PARANOÁ', '2, 18', -15.794324, -15.789832, -47.785137, -47.780467),
        ('PAR-62', 'Quadrante 62', v_product_id, 'PARANOÁ', '2, 18', -15.794324, -15.789832, -47.701077, -47.696407),
        ('PAR-63', 'Quadrante 63', v_product_id, 'PARANOÁ', '2, 18', -15.789832, -15.785341, -47.785137, -47.780467),
        ('PAR-64', 'Quadrante 64', v_product_id, 'PARANOÁ', '2, 18', -15.789832, -15.785341, -47.780467, -47.775797),
        ('PAR-65', 'Quadrante 65', v_product_id, 'PARANOÁ', '2, 18', -15.785341, -15.780849, -47.808486, -47.803816),
        ('PAR-66', 'Quadrante 66', v_product_id, 'PARANOÁ', '2, 18', -15.785341, -15.780849, -47.785137, -47.780467),
        ('PAR-67', 'Quadrante 67', v_product_id, 'PARANOÁ', '2, 18', -15.785341, -15.780849, -47.780467, -47.775797),
        ('PAR-68', 'Quadrante 68', v_product_id, 'PARANOÁ', '2, 18', -15.785341, -15.780849, -47.775797, -47.771127),
        ('PAR-69', 'Quadrante 69', v_product_id, 'PARANOÁ', '2, 18', -15.780849, -15.776358, -47.789807, -47.785137),
        ('PAR-70', 'Quadrante 70', v_product_id, 'PARANOÁ', '2, 18', -15.780849, -15.776358, -47.785137, -47.780467),
        ('PAR-71', 'Quadrante 71', v_product_id, 'PARANOÁ', '2, 18', -15.780849, -15.776358, -47.780467, -47.775797),
        ('PAR-72', 'Quadrante 72', v_product_id, 'PARANOÁ', '2, 18', -15.776358, -15.771866, -47.813156, -47.808486),
        ('PAR-73', 'Quadrante 73', v_product_id, 'PARANOÁ', '2, 18', -15.776358, -15.771866, -47.808486, -47.803816),
        ('PAR-74', 'Quadrante 74', v_product_id, 'PARANOÁ', '2, 18', -15.776358, -15.771866, -47.785137, -47.780467),
        ('PAR-75', 'Quadrante 75', v_product_id, 'PARANOÁ', '2, 18', -15.776358, -15.771866, -47.780467, -47.775797),
        ('PAR-76', 'Quadrante 76', v_product_id, 'PARANOÁ', '2, 18', -15.776358, -15.771866, -47.766457, -47.761787),
        ('PAR-77', 'Quadrante 77', v_product_id, 'PARANOÁ', '2, 18', -15.771866, -15.767375, -47.789807, -47.785137),
        ('PAR-78', 'Quadrante 78', v_product_id, 'PARANOÁ', '2, 18', -15.771866, -15.767375, -47.785137, -47.780467),
        ('PAR-79', 'Quadrante 79', v_product_id, 'PARANOÁ', '2, 18', -15.771866, -15.767375, -47.780467, -47.775797),
        ('PAR-80', 'Quadrante 80', v_product_id, 'PARANOÁ', '2, 18', -15.767375, -15.762883, -47.794476, -47.789807),
        ('PAR-81', 'Quadrante 81', v_product_id, 'PARANOÁ', '2, 18', -15.767375, -15.762883, -47.789807, -47.785137),
        ('PAR-82', 'Quadrante 82', v_product_id, 'PARANOÁ', '2, 18', -15.767375, -15.762883, -47.785137, -47.780467),
        ('PAR-83', 'Quadrante 83', v_product_id, 'PARANOÁ', '2, 18', -15.767375, -15.762883, -47.780467, -47.775797),
        ('PAR-84', 'Quadrante 84', v_product_id, 'PARANOÁ', '2, 18', -15.767375, -15.762883, -47.747777, -47.743107),
        ('PAR-85', 'Quadrante 85', v_product_id, 'PARANOÁ', '2, 18', -15.762883, -15.758392, -47.785137, -47.780467),
        ('PAR-86', 'Quadrante 86', v_product_id, 'PARANOÁ', '2, 18', -15.762883, -15.758392, -47.780467, -47.775797),
        ('PAR-87', 'Quadrante 87', v_product_id, 'PARANOÁ', '2, 18', -15.762883, -15.758392, -47.747777, -47.743107),
        ('PAR-88', 'Quadrante 88', v_product_id, 'PARANOÁ', '2, 18', -15.740425, -15.735934, -47.682397, -47.677727);
END $$;

-- ------------------------------------------------------------
-- VICENTE PIRES (VP) — 88 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'VICENTE PIRES' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — VICENTE PIRES', 'VICENTE PIRES', '19')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('VP-01', 'Quadrante 1', v_product_id, 'VICENTE PIRES', '19', -15.831857, -15.827365, -48.051717, -48.047050),
        ('VP-02', 'Quadrante 2', v_product_id, 'VICENTE PIRES', '19', -15.831857, -15.827365, -48.047050, -48.042382),
        ('VP-03', 'Quadrante 3', v_product_id, 'VICENTE PIRES', '19', -15.831857, -15.827365, -48.042382, -48.037714),
        ('VP-04', 'Quadrante 4', v_product_id, 'VICENTE PIRES', '19', -15.831857, -15.827365, -48.037714, -48.033046),
        ('VP-05', 'Quadrante 5', v_product_id, 'VICENTE PIRES', '19', -15.827365, -15.822874, -48.051717, -48.047050),
        ('VP-06', 'Quadrante 6', v_product_id, 'VICENTE PIRES', '19', -15.827365, -15.822874, -48.047050, -48.042382),
        ('VP-07', 'Quadrante 7', v_product_id, 'VICENTE PIRES', '19', -15.827365, -15.822874, -48.042382, -48.037714),
        ('VP-08', 'Quadrante 8', v_product_id, 'VICENTE PIRES', '19', -15.827365, -15.822874, -48.037714, -48.033046),
        ('VP-09', 'Quadrante 9', v_product_id, 'VICENTE PIRES', '19', -15.827365, -15.822874, -48.033046, -48.028378),
        ('VP-10', 'Quadrante 10', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.051717, -48.047050),
        ('VP-11', 'Quadrante 11', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.047050, -48.042382),
        ('VP-12', 'Quadrante 12', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.042382, -48.037714),
        ('VP-13', 'Quadrante 13', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.037714, -48.033046),
        ('VP-14', 'Quadrante 14', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.033046, -48.028378),
        ('VP-15', 'Quadrante 15', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.028378, -48.023710),
        ('VP-16', 'Quadrante 16', v_product_id, 'VICENTE PIRES', '19', -15.822874, -15.818382, -48.023710, -48.019042),
        ('VP-17', 'Quadrante 17', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.056385, -48.051717),
        ('VP-18', 'Quadrante 18', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.051717, -48.047050),
        ('VP-19', 'Quadrante 19', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.047050, -48.042382),
        ('VP-20', 'Quadrante 20', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.042382, -48.037714),
        ('VP-21', 'Quadrante 21', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.037714, -48.033046),
        ('VP-22', 'Quadrante 22', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.033046, -48.028378),
        ('VP-23', 'Quadrante 23', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.028378, -48.023710),
        ('VP-24', 'Quadrante 24', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.023710, -48.019042),
        ('VP-25', 'Quadrante 25', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.019042, -48.014374),
        ('VP-26', 'Quadrante 26', v_product_id, 'VICENTE PIRES', '19', -15.818382, -15.813890, -48.014374, -48.009706),
        ('VP-27', 'Quadrante 27', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.056385, -48.051717),
        ('VP-28', 'Quadrante 28', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.051717, -48.047050),
        ('VP-29', 'Quadrante 29', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.047050, -48.042382),
        ('VP-30', 'Quadrante 30', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.042382, -48.037714),
        ('VP-31', 'Quadrante 31', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.037714, -48.033046),
        ('VP-32', 'Quadrante 32', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.033046, -48.028378),
        ('VP-33', 'Quadrante 33', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.028378, -48.023710),
        ('VP-34', 'Quadrante 34', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.023710, -48.019042),
        ('VP-35', 'Quadrante 35', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.019042, -48.014374),
        ('VP-36', 'Quadrante 36', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.014374, -48.009706),
        ('VP-37', 'Quadrante 37', v_product_id, 'VICENTE PIRES', '19', -15.813890, -15.809399, -48.005038, -48.000370),
        ('VP-38', 'Quadrante 38', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.056385, -48.051717),
        ('VP-39', 'Quadrante 39', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.051717, -48.047050),
        ('VP-40', 'Quadrante 40', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.047050, -48.042382),
        ('VP-41', 'Quadrante 41', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.042382, -48.037714),
        ('VP-42', 'Quadrante 42', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.037714, -48.033046),
        ('VP-43', 'Quadrante 43', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.033046, -48.028378),
        ('VP-44', 'Quadrante 44', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.028378, -48.023710),
        ('VP-45', 'Quadrante 45', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.023710, -48.019042),
        ('VP-46', 'Quadrante 46', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.019042, -48.014374),
        ('VP-47', 'Quadrante 47', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.014374, -48.009706),
        ('VP-48', 'Quadrante 48', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.005038, -48.000370),
        ('VP-49', 'Quadrante 49', v_product_id, 'VICENTE PIRES', '19', -15.809399, -15.804907, -48.000370, -47.995702),
        ('VP-50', 'Quadrante 50', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.056385, -48.051717),
        ('VP-51', 'Quadrante 51', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.051717, -48.047050),
        ('VP-52', 'Quadrante 52', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.047050, -48.042382),
        ('VP-53', 'Quadrante 53', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.042382, -48.037714),
        ('VP-54', 'Quadrante 54', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.037714, -48.033046),
        ('VP-55', 'Quadrante 55', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.033046, -48.028378),
        ('VP-56', 'Quadrante 56', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.028378, -48.023710),
        ('VP-57', 'Quadrante 57', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.023710, -48.019042),
        ('VP-58', 'Quadrante 58', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.019042, -48.014374),
        ('VP-59', 'Quadrante 59', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.014374, -48.009706),
        ('VP-60', 'Quadrante 60', v_product_id, 'VICENTE PIRES', '19', -15.804907, -15.800416, -48.005038, -48.000370),
        ('VP-61', 'Quadrante 61', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.051717, -48.047050),
        ('VP-62', 'Quadrante 62', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.047050, -48.042382),
        ('VP-63', 'Quadrante 63', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.042382, -48.037714),
        ('VP-64', 'Quadrante 64', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.037714, -48.033046),
        ('VP-65', 'Quadrante 65', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.033046, -48.028378),
        ('VP-66', 'Quadrante 66', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.028378, -48.023710),
        ('VP-67', 'Quadrante 67', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.023710, -48.019042),
        ('VP-68', 'Quadrante 68', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.019042, -48.014374),
        ('VP-69', 'Quadrante 69', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.014374, -48.009706),
        ('VP-70', 'Quadrante 70', v_product_id, 'VICENTE PIRES', '19', -15.800416, -15.795924, -48.005038, -48.000370),
        ('VP-71', 'Quadrante 71', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.051717, -48.047050),
        ('VP-72', 'Quadrante 72', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.047050, -48.042382),
        ('VP-73', 'Quadrante 73', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.042382, -48.037714),
        ('VP-74', 'Quadrante 74', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.037714, -48.033046),
        ('VP-75', 'Quadrante 75', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.033046, -48.028378),
        ('VP-76', 'Quadrante 76', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.028378, -48.023710),
        ('VP-77', 'Quadrante 77', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.023710, -48.019042),
        ('VP-78', 'Quadrante 78', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.019042, -48.014374),
        ('VP-79', 'Quadrante 79', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.014374, -48.009706),
        ('VP-80', 'Quadrante 80', v_product_id, 'VICENTE PIRES', '19', -15.795924, -15.791433, -48.005038, -48.000370),
        ('VP-81', 'Quadrante 81', v_product_id, 'VICENTE PIRES', '19', -15.791433, -15.786941, -48.019042, -48.014374),
        ('VP-82', 'Quadrante 82', v_product_id, 'VICENTE PIRES', '19', -15.791433, -15.786941, -48.014374, -48.009706),
        ('VP-83', 'Quadrante 83', v_product_id, 'VICENTE PIRES', '19', -15.791433, -15.786941, -48.009706, -48.005038),
        ('VP-84', 'Quadrante 84', v_product_id, 'VICENTE PIRES', '19', -15.791433, -15.786941, -48.005038, -48.000370),
        ('VP-85', 'Quadrante 85', v_product_id, 'VICENTE PIRES', '19', -15.791433, -15.786941, -48.000370, -47.995702),
        ('VP-86', 'Quadrante 86', v_product_id, 'VICENTE PIRES', '19', -15.786941, -15.782450, -48.023710, -48.019042),
        ('VP-87', 'Quadrante 87', v_product_id, 'VICENTE PIRES', '19', -15.786941, -15.782450, -48.019042, -48.014374),
        ('VP-88', 'Quadrante 88', v_product_id, 'VICENTE PIRES', '19', -15.782450, -15.777958, -48.047050, -48.042382);
END $$;

-- ------------------------------------------------------------
-- GAMA (GAM) — 74 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'GAMA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — GAMA', 'GAMA', '9, 17')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('GAM-01', 'Quadrante 1', v_product_id, 'GAMA', '9, 17', -16.045595, -16.041103, -48.260004, -48.255332),
        ('GAM-02', 'Quadrante 2', v_product_id, 'GAMA', '9, 17', -16.045595, -16.041103, -48.255332, -48.250660),
        ('GAM-03', 'Quadrante 3', v_product_id, 'GAMA', '9, 17', -16.041103, -16.036612, -48.260004, -48.255332),
        ('GAM-04', 'Quadrante 4', v_product_id, 'GAMA', '9, 17', -16.041103, -16.036612, -48.063765, -48.059092),
        ('GAM-05', 'Quadrante 5', v_product_id, 'GAMA', '9, 17', -16.041103, -16.036612, -48.059092, -48.054420),
        ('GAM-06', 'Quadrante 6', v_product_id, 'GAMA', '9, 17', -16.036612, -16.032120, -48.105816, -48.101144),
        ('GAM-07', 'Quadrante 7', v_product_id, 'GAMA', '9, 17', -16.036612, -16.032120, -48.082454, -48.077782),
        ('GAM-08', 'Quadrante 8', v_product_id, 'GAMA', '9, 17', -16.036612, -16.032120, -48.073109, -48.068437),
        ('GAM-09', 'Quadrante 9', v_product_id, 'GAMA', '9, 17', -16.036612, -16.032120, -48.068437, -48.063765),
        ('GAM-10', 'Quadrante 10', v_product_id, 'GAMA', '9, 17', -16.036612, -16.032120, -48.063765, -48.059092),
        ('GAM-11', 'Quadrante 11', v_product_id, 'GAMA', '9, 17', -16.036612, -16.032120, -48.059092, -48.054420),
        ('GAM-12', 'Quadrante 12', v_product_id, 'GAMA', '9, 17', -16.032120, -16.027629, -48.077782, -48.073109),
        ('GAM-13', 'Quadrante 13', v_product_id, 'GAMA', '9, 17', -16.032120, -16.027629, -48.073109, -48.068437),
        ('GAM-14', 'Quadrante 14', v_product_id, 'GAMA', '9, 17', -16.032120, -16.027629, -48.068437, -48.063765),
        ('GAM-15', 'Quadrante 15', v_product_id, 'GAMA', '9, 17', -16.032120, -16.027629, -48.063765, -48.059092),
        ('GAM-16', 'Quadrante 16', v_product_id, 'GAMA', '9, 17', -16.032120, -16.027629, -48.059092, -48.054420),
        ('GAM-17', 'Quadrante 17', v_product_id, 'GAMA', '9, 17', -16.032120, -16.027629, -48.054420, -48.049747),
        ('GAM-18', 'Quadrante 18', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.087126, -48.082454),
        ('GAM-19', 'Quadrante 19', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.082454, -48.077782),
        ('GAM-20', 'Quadrante 20', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.077782, -48.073109),
        ('GAM-21', 'Quadrante 21', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.073109, -48.068437),
        ('GAM-22', 'Quadrante 22', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.068437, -48.063765),
        ('GAM-23', 'Quadrante 23', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.063765, -48.059092),
        ('GAM-24', 'Quadrante 24', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.059092, -48.054420),
        ('GAM-25', 'Quadrante 25', v_product_id, 'GAMA', '9, 17', -16.027629, -16.023137, -48.054420, -48.049747),
        ('GAM-26', 'Quadrante 26', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.082454, -48.077782),
        ('GAM-27', 'Quadrante 27', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.077782, -48.073109),
        ('GAM-28', 'Quadrante 28', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.073109, -48.068437),
        ('GAM-29', 'Quadrante 29', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.068437, -48.063765),
        ('GAM-30', 'Quadrante 30', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.063765, -48.059092),
        ('GAM-31', 'Quadrante 31', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.059092, -48.054420),
        ('GAM-32', 'Quadrante 32', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.054420, -48.049747),
        ('GAM-33', 'Quadrante 33', v_product_id, 'GAMA', '9, 17', -16.023137, -16.018646, -48.049747, -48.045075),
        ('GAM-34', 'Quadrante 34', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.082454, -48.077782),
        ('GAM-35', 'Quadrante 35', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.077782, -48.073109),
        ('GAM-36', 'Quadrante 36', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.073109, -48.068437),
        ('GAM-37', 'Quadrante 37', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.068437, -48.063765),
        ('GAM-38', 'Quadrante 38', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.063765, -48.059092),
        ('GAM-39', 'Quadrante 39', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.059092, -48.054420),
        ('GAM-40', 'Quadrante 40', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.054420, -48.049747),
        ('GAM-41', 'Quadrante 41', v_product_id, 'GAMA', '9, 17', -16.018646, -16.014154, -48.049747, -48.045075),
        ('GAM-42', 'Quadrante 42', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.082454, -48.077782),
        ('GAM-43', 'Quadrante 43', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.077782, -48.073109),
        ('GAM-44', 'Quadrante 44', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.073109, -48.068437),
        ('GAM-45', 'Quadrante 45', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.068437, -48.063765),
        ('GAM-46', 'Quadrante 46', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.063765, -48.059092),
        ('GAM-47', 'Quadrante 47', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.059092, -48.054420),
        ('GAM-48', 'Quadrante 48', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.054420, -48.049747),
        ('GAM-49', 'Quadrante 49', v_product_id, 'GAMA', '9, 17', -16.014154, -16.009662, -48.049747, -48.045075),
        ('GAM-50', 'Quadrante 50', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.087126, -48.082454),
        ('GAM-51', 'Quadrante 51', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.082454, -48.077782),
        ('GAM-52', 'Quadrante 52', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.077782, -48.073109),
        ('GAM-53', 'Quadrante 53', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.073109, -48.068437),
        ('GAM-54', 'Quadrante 54', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.068437, -48.063765),
        ('GAM-55', 'Quadrante 55', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.063765, -48.059092),
        ('GAM-56', 'Quadrante 56', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.059092, -48.054420),
        ('GAM-57', 'Quadrante 57', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.054420, -48.049747),
        ('GAM-58', 'Quadrante 58', v_product_id, 'GAMA', '9, 17', -16.009662, -16.005171, -48.049747, -48.045075),
        ('GAM-59', 'Quadrante 59', v_product_id, 'GAMA', '9, 17', -16.005171, -16.000679, -48.077782, -48.073109),
        ('GAM-60', 'Quadrante 60', v_product_id, 'GAMA', '9, 17', -16.005171, -16.000679, -48.073109, -48.068437),
        ('GAM-61', 'Quadrante 61', v_product_id, 'GAMA', '9, 17', -16.005171, -16.000679, -48.068437, -48.063765),
        ('GAM-62', 'Quadrante 62', v_product_id, 'GAMA', '9, 17', -16.005171, -16.000679, -48.063765, -48.059092),
        ('GAM-63', 'Quadrante 63', v_product_id, 'GAMA', '9, 17', -16.005171, -16.000679, -48.059092, -48.054420),
        ('GAM-64', 'Quadrante 64', v_product_id, 'GAMA', '9, 17', -16.005171, -16.000679, -48.054420, -48.049747),
        ('GAM-65', 'Quadrante 65', v_product_id, 'GAMA', '9, 17', -16.000679, -15.996188, -48.068437, -48.063765),
        ('GAM-66', 'Quadrante 66', v_product_id, 'GAMA', '9, 17', -16.000679, -15.996188, -48.063765, -48.059092),
        ('GAM-67', 'Quadrante 67', v_product_id, 'GAMA', '9, 17', -16.000679, -15.996188, -48.059092, -48.054420),
        ('GAM-68', 'Quadrante 68', v_product_id, 'GAMA', '9, 17', -16.000679, -15.996188, -48.054420, -48.049747),
        ('GAM-69', 'Quadrante 69', v_product_id, 'GAMA', '9, 17', -15.996188, -15.991696, -48.059092, -48.054420),
        ('GAM-70', 'Quadrante 70', v_product_id, 'GAMA', '9, 17', -15.996188, -15.991696, -48.054420, -48.049747),
        ('GAM-71', 'Quadrante 71', v_product_id, 'GAMA', '9, 17', -15.978222, -15.973730, -48.236642, -48.231970),
        ('GAM-72', 'Quadrante 72', v_product_id, 'GAMA', '9, 17', -15.964747, -15.960255, -48.129178, -48.124505),
        ('GAM-73', 'Quadrante 73', v_product_id, 'GAMA', '9, 17', -15.955764, -15.951272, -48.171229, -48.166557),
        ('GAM-74', 'Quadrante 74', v_product_id, 'GAMA', '9, 17', -15.951272, -15.946781, -48.171229, -48.166557);
END $$;

-- ------------------------------------------------------------
-- PONTE ALTA (PA) — 132 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = 'PONTE ALTA' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — PONTE ALTA', 'PONTE ALTA', '17')
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('PA-01', 'Quadrante 1', v_product_id, 'PONTE ALTA', '17', -15.991809, -15.987318, -48.091366, -48.086694),
        ('PA-02', 'Quadrante 2', v_product_id, 'PONTE ALTA', '17', -15.991809, -15.987318, -48.086694, -48.082022),
        ('PA-03', 'Quadrante 3', v_product_id, 'PONTE ALTA', '17', -15.991809, -15.987318, -48.082022, -48.077350),
        ('PA-04', 'Quadrante 4', v_product_id, 'PONTE ALTA', '17', -15.991809, -15.987318, -48.077350, -48.072679),
        ('PA-05', 'Quadrante 5', v_product_id, 'PONTE ALTA', '17', -15.991809, -15.987318, -48.063335, -48.058663),
        ('PA-06', 'Quadrante 6', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.096038, -48.091366),
        ('PA-07', 'Quadrante 7', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.091366, -48.086694),
        ('PA-08', 'Quadrante 8', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.086694, -48.082022),
        ('PA-09', 'Quadrante 9', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.082022, -48.077350),
        ('PA-10', 'Quadrante 10', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.077350, -48.072679),
        ('PA-11', 'Quadrante 11', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.072679, -48.068007),
        ('PA-12', 'Quadrante 12', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.068007, -48.063335),
        ('PA-13', 'Quadrante 13', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.063335, -48.058663),
        ('PA-14', 'Quadrante 14', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.058663, -48.053991),
        ('PA-15', 'Quadrante 15', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.053991, -48.049319),
        ('PA-16', 'Quadrante 16', v_product_id, 'PONTE ALTA', '17', -15.987318, -15.982826, -48.049319, -48.044647),
        ('PA-17', 'Quadrante 17', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.096038, -48.091366),
        ('PA-18', 'Quadrante 18', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.091366, -48.086694),
        ('PA-19', 'Quadrante 19', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.086694, -48.082022),
        ('PA-20', 'Quadrante 20', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.082022, -48.077350),
        ('PA-21', 'Quadrante 21', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.077350, -48.072679),
        ('PA-22', 'Quadrante 22', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.058663, -48.053991),
        ('PA-23', 'Quadrante 23', v_product_id, 'PONTE ALTA', '17', -15.982826, -15.978334, -48.053991, -48.049319),
        ('PA-24', 'Quadrante 24', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.096038, -48.091366),
        ('PA-25', 'Quadrante 25', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.091366, -48.086694),
        ('PA-26', 'Quadrante 26', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.086694, -48.082022),
        ('PA-27', 'Quadrante 27', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.082022, -48.077350),
        ('PA-28', 'Quadrante 28', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.077350, -48.072679),
        ('PA-29', 'Quadrante 29', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.058663, -48.053991),
        ('PA-30', 'Quadrante 30', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.053991, -48.049319),
        ('PA-31', 'Quadrante 31', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.049319, -48.044647),
        ('PA-32', 'Quadrante 32', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.044647, -48.039975),
        ('PA-33', 'Quadrante 33', v_product_id, 'PONTE ALTA', '17', -15.978334, -15.973843, -48.039975, -48.035303),
        ('PA-34', 'Quadrante 34', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.096038, -48.091366),
        ('PA-35', 'Quadrante 35', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.091366, -48.086694),
        ('PA-36', 'Quadrante 36', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.086694, -48.082022),
        ('PA-37', 'Quadrante 37', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.082022, -48.077350),
        ('PA-38', 'Quadrante 38', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.077350, -48.072679),
        ('PA-39', 'Quadrante 39', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.072679, -48.068007),
        ('PA-40', 'Quadrante 40', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.068007, -48.063335),
        ('PA-41', 'Quadrante 41', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.063335, -48.058663),
        ('PA-42', 'Quadrante 42', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.058663, -48.053991),
        ('PA-43', 'Quadrante 43', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.053991, -48.049319),
        ('PA-44', 'Quadrante 44', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.049319, -48.044647),
        ('PA-45', 'Quadrante 45', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.044647, -48.039975),
        ('PA-46', 'Quadrante 46', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.039975, -48.035303),
        ('PA-47', 'Quadrante 47', v_product_id, 'PONTE ALTA', '17', -15.973843, -15.969351, -48.035303, -48.030632),
        ('PA-48', 'Quadrante 48', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.096038, -48.091366),
        ('PA-49', 'Quadrante 49', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.091366, -48.086694),
        ('PA-50', 'Quadrante 50', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.086694, -48.082022),
        ('PA-51', 'Quadrante 51', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.082022, -48.077350),
        ('PA-52', 'Quadrante 52', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.077350, -48.072679),
        ('PA-53', 'Quadrante 53', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.072679, -48.068007),
        ('PA-54', 'Quadrante 54', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.068007, -48.063335),
        ('PA-55', 'Quadrante 55', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.063335, -48.058663),
        ('PA-56', 'Quadrante 56', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.058663, -48.053991),
        ('PA-57', 'Quadrante 57', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.053991, -48.049319),
        ('PA-58', 'Quadrante 58', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.049319, -48.044647),
        ('PA-59', 'Quadrante 59', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.044647, -48.039975),
        ('PA-60', 'Quadrante 60', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.039975, -48.035303),
        ('PA-61', 'Quadrante 61', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.035303, -48.030632),
        ('PA-62', 'Quadrante 62', v_product_id, 'PONTE ALTA', '17', -15.969351, -15.964860, -48.030632, -48.025960),
        ('PA-63', 'Quadrante 63', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.124069, -48.119397),
        ('PA-64', 'Quadrante 64', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.119397, -48.114725),
        ('PA-65', 'Quadrante 65', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.105382, -48.100710),
        ('PA-66', 'Quadrante 66', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.100710, -48.096038),
        ('PA-67', 'Quadrante 67', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.096038, -48.091366),
        ('PA-68', 'Quadrante 68', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.091366, -48.086694),
        ('PA-69', 'Quadrante 69', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.086694, -48.082022),
        ('PA-70', 'Quadrante 70', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.082022, -48.077350),
        ('PA-71', 'Quadrante 71', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.077350, -48.072679),
        ('PA-72', 'Quadrante 72', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.072679, -48.068007),
        ('PA-73', 'Quadrante 73', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.068007, -48.063335),
        ('PA-74', 'Quadrante 74', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.063335, -48.058663),
        ('PA-75', 'Quadrante 75', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.058663, -48.053991),
        ('PA-76', 'Quadrante 76', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.053991, -48.049319),
        ('PA-77', 'Quadrante 77', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.049319, -48.044647),
        ('PA-78', 'Quadrante 78', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.044647, -48.039975),
        ('PA-79', 'Quadrante 79', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.039975, -48.035303),
        ('PA-80', 'Quadrante 80', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.035303, -48.030632),
        ('PA-81', 'Quadrante 81', v_product_id, 'PONTE ALTA', '17', -15.964860, -15.960368, -48.030632, -48.025960),
        ('PA-82', 'Quadrante 82', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.124069, -48.119397),
        ('PA-83', 'Quadrante 83', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.119397, -48.114725),
        ('PA-84', 'Quadrante 84', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.105382, -48.100710),
        ('PA-85', 'Quadrante 85', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.100710, -48.096038),
        ('PA-86', 'Quadrante 86', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.096038, -48.091366),
        ('PA-87', 'Quadrante 87', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.091366, -48.086694),
        ('PA-88', 'Quadrante 88', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.086694, -48.082022),
        ('PA-89', 'Quadrante 89', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.082022, -48.077350),
        ('PA-90', 'Quadrante 90', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.077350, -48.072679),
        ('PA-91', 'Quadrante 91', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.072679, -48.068007),
        ('PA-92', 'Quadrante 92', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.068007, -48.063335),
        ('PA-93', 'Quadrante 93', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.063335, -48.058663),
        ('PA-94', 'Quadrante 94', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.058663, -48.053991),
        ('PA-95', 'Quadrante 95', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.053991, -48.049319),
        ('PA-96', 'Quadrante 96', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.049319, -48.044647),
        ('PA-97', 'Quadrante 97', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.044647, -48.039975),
        ('PA-98', 'Quadrante 98', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.039975, -48.035303),
        ('PA-99', 'Quadrante 99', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.035303, -48.030632),
        ('PA-100', 'Quadrante 100', v_product_id, 'PONTE ALTA', '17', -15.960368, -15.955877, -48.030632, -48.025960),
        ('PA-101', 'Quadrante 101', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.119397, -48.114725),
        ('PA-102', 'Quadrante 102', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.105382, -48.100710),
        ('PA-103', 'Quadrante 103', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.100710, -48.096038),
        ('PA-104', 'Quadrante 104', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.096038, -48.091366),
        ('PA-105', 'Quadrante 105', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.091366, -48.086694),
        ('PA-106', 'Quadrante 106', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.086694, -48.082022),
        ('PA-107', 'Quadrante 107', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.082022, -48.077350),
        ('PA-108', 'Quadrante 108', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.077350, -48.072679),
        ('PA-109', 'Quadrante 109', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.072679, -48.068007),
        ('PA-110', 'Quadrante 110', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.068007, -48.063335),
        ('PA-111', 'Quadrante 111', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.063335, -48.058663),
        ('PA-112', 'Quadrante 112', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.053991, -48.049319),
        ('PA-113', 'Quadrante 113', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.049319, -48.044647),
        ('PA-114', 'Quadrante 114', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.044647, -48.039975),
        ('PA-115', 'Quadrante 115', v_product_id, 'PONTE ALTA', '17', -15.955877, -15.951385, -48.039975, -48.035303),
        ('PA-116', 'Quadrante 116', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.100710, -48.096038),
        ('PA-117', 'Quadrante 117', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.096038, -48.091366),
        ('PA-118', 'Quadrante 118', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.091366, -48.086694),
        ('PA-119', 'Quadrante 119', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.086694, -48.082022),
        ('PA-120', 'Quadrante 120', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.082022, -48.077350),
        ('PA-121', 'Quadrante 121', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.077350, -48.072679),
        ('PA-122', 'Quadrante 122', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.072679, -48.068007),
        ('PA-123', 'Quadrante 123', v_product_id, 'PONTE ALTA', '17', -15.951385, -15.946893, -48.039975, -48.035303),
        ('PA-124', 'Quadrante 124', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.100710, -48.096038),
        ('PA-125', 'Quadrante 125', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.096038, -48.091366),
        ('PA-126', 'Quadrante 126', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.091366, -48.086694),
        ('PA-127', 'Quadrante 127', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.086694, -48.082022),
        ('PA-128', 'Quadrante 128', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.082022, -48.077350),
        ('PA-129', 'Quadrante 129', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.077350, -48.072679),
        ('PA-130', 'Quadrante 130', v_product_id, 'PONTE ALTA', '17', -15.946893, -15.942402, -48.072679, -48.068007),
        ('PA-131', 'Quadrante 131', v_product_id, 'PONTE ALTA', '17', -15.942402, -15.937910, -48.091366, -48.086694),
        ('PA-132', 'Quadrante 132', v_product_id, 'PONTE ALTA', '17', -15.942402, -15.937910, -48.082022, -48.077350);
END $$;

-- ------------------------------------------------------------
-- 26 DE SETEMBRO (DS) — 29 quadrante(s)
-- ------------------------------------------------------------
DO $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT id INTO v_product_id FROM public.products WHERE ra_nome = '26 DE SETEMBRO' LIMIT 1;
    IF v_product_id IS NULL THEN
        INSERT INTO public.products (nome, ra_nome, zona_eleitoral)
            VALUES ('Coordenação Regional — 26 DE SETEMBRO', '26 DE SETEMBRO', NULL)
            RETURNING id INTO v_product_id;
    END IF;

    DELETE FROM public.checkins WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.area_volunteers WHERE area_id IN (SELECT id FROM public.areas WHERE product_id = v_product_id);
    DELETE FROM public.areas WHERE product_id = v_product_id;

    INSERT INTO public.areas (codigo, nome, product_id, ra_nome, zona_eleitoral, lat_min, lat_max, lng_min, lng_max) VALUES
        ('DS-01', 'Quadrante 1', v_product_id, '26 DE SETEMBRO', NULL, -15.787412, -15.782921, -48.010282, -48.005615),
        ('DS-02', 'Quadrante 2', v_product_id, '26 DE SETEMBRO', NULL, -15.787412, -15.782921, -48.005615, -48.003019),
        ('DS-03', 'Quadrante 3', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.042952, -48.038285),
        ('DS-04', 'Quadrante 4', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.038285, -48.033618),
        ('DS-05', 'Quadrante 5', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.033618, -48.028951),
        ('DS-06', 'Quadrante 6', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.028951, -48.024284),
        ('DS-07', 'Quadrante 7', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.024284, -48.019616),
        ('DS-08', 'Quadrante 8', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.019616, -48.014949),
        ('DS-09', 'Quadrante 9', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.014949, -48.010282),
        ('DS-10', 'Quadrante 10', v_product_id, '26 DE SETEMBRO', NULL, -15.782921, -15.778429, -48.010282, -48.005615),
        ('DS-11', 'Quadrante 11', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.038285, -48.033618),
        ('DS-12', 'Quadrante 12', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.033618, -48.028951),
        ('DS-13', 'Quadrante 13', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.028951, -48.024284),
        ('DS-14', 'Quadrante 14', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.024284, -48.019616),
        ('DS-15', 'Quadrante 15', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.019616, -48.014949),
        ('DS-16', 'Quadrante 16', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.014949, -48.010282),
        ('DS-17', 'Quadrante 17', v_product_id, '26 DE SETEMBRO', NULL, -15.778429, -15.773938, -48.010282, -48.005615),
        ('DS-18', 'Quadrante 18', v_product_id, '26 DE SETEMBRO', NULL, -15.773938, -15.769446, -48.042952, -48.038285),
        ('DS-19', 'Quadrante 19', v_product_id, '26 DE SETEMBRO', NULL, -15.773938, -15.769446, -48.028951, -48.024284),
        ('DS-20', 'Quadrante 20', v_product_id, '26 DE SETEMBRO', NULL, -15.773938, -15.769446, -48.019616, -48.014949),
        ('DS-21', 'Quadrante 21', v_product_id, '26 DE SETEMBRO', NULL, -15.769446, -15.764955, -48.042952, -48.038285),
        ('DS-22', 'Quadrante 22', v_product_id, '26 DE SETEMBRO', NULL, -15.769446, -15.764955, -48.038285, -48.033618),
        ('DS-23', 'Quadrante 23', v_product_id, '26 DE SETEMBRO', NULL, -15.769446, -15.764955, -48.033618, -48.028951),
        ('DS-24', 'Quadrante 24', v_product_id, '26 DE SETEMBRO', NULL, -15.764955, -15.760463, -48.042952, -48.038285),
        ('DS-25', 'Quadrante 25', v_product_id, '26 DE SETEMBRO', NULL, -15.764955, -15.760463, -48.038285, -48.033618),
        ('DS-26', 'Quadrante 26', v_product_id, '26 DE SETEMBRO', NULL, -15.764955, -15.760463, -48.033618, -48.028951),
        ('DS-27', 'Quadrante 27', v_product_id, '26 DE SETEMBRO', NULL, -15.764955, -15.760463, -48.028951, -48.024284),
        ('DS-28', 'Quadrante 28', v_product_id, '26 DE SETEMBRO', NULL, -15.760463, -15.755972, -48.042952, -48.038285),
        ('DS-29', 'Quadrante 29', v_product_id, '26 DE SETEMBRO', NULL, -15.760463, -15.755972, -48.014949, -48.010282);
END $$;


-- ============================================================
-- PARTE 8 — Grade Operacional do Painel do Coordenador: status por
-- perímetro (areas.grupo_nome), histórico auditável de mudanças, e
-- link de compartilhamento somente-leitura sem login.
--
-- Reaproveita grupo_nome (já existente, rótulo livre atribuído pelo
-- coordenador via "🏷️ Nomear perímetro") como a unidade "Quadrante"
-- da grade impressa original (ex: "AR 01"), chaveando o status por
-- (product_id, grupo_nome) em vez de criar uma tabela de perímetro
-- com FK própria em areas — evita migrar o dado de grupo_nome já em
-- produção e não toca nos pontos de leitura existentes (filtro de
-- perímetro, tooltip do mapa, painel de atribuição). Trade-off aceito:
-- por não ter FK, renomear um perímetro no mapa não migra automaticamente
-- o status/histórico associado ao nome antigo (a UI avisa disso).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.perimetro_status (
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    grupo_nome TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'nao_iniciado' CHECK (status IN ('nao_iniciado', 'em_andamento', 'concluido')),
    updated_by UUID REFERENCES public.profiles(id),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (product_id, grupo_nome)
);

-- Histórico append-only — base para os relatórios futuros de
-- desempenho por integrante e planejado x executado (cruzar depois com
-- checkins via areas.grupo_nome, sem duplicar dado de check-in aqui).
-- Client nunca escreve aqui diretamente: só o trigger abaixo grava.
CREATE TABLE IF NOT EXISTS public.perimetro_status_historico (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    grupo_nome TEXT NOT NULL,
    status_anterior TEXT CHECK (status_anterior IN ('nao_iniciado', 'em_andamento', 'concluido')),
    status_novo TEXT NOT NULL CHECK (status_novo IN ('nao_iniciado', 'em_andamento', 'concluido')),
    alterado_por UUID REFERENCES public.profiles(id),
    alterado_em TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_perimetro_status_historico_lookup
    ON public.perimetro_status_historico (product_id, grupo_nome, alterado_em DESC);

CREATE OR REPLACE FUNCTION public.log_perimetro_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
        INSERT INTO public.perimetro_status_historico (product_id, grupo_nome, status_anterior, status_novo, alterado_por)
        VALUES (NEW.product_id, NEW.grupo_nome, CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE OLD.status END, NEW.status, NEW.updated_by);
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_perimetro_status_change ON public.perimetro_status;
CREATE TRIGGER on_perimetro_status_change
    AFTER INSERT OR UPDATE ON public.perimetro_status
    FOR EACH ROW EXECUTE FUNCTION public.log_perimetro_status_change();

-- Link somente-leitura, sem login, do resumo público da grade
-- operacional de uma Coordenação. Token opaco: a tabela não tem
-- nenhuma policy de leitura para anon, só a RPC get_grade_publica
-- (abaixo) resolve o token, então ele nunca é listável via query normal.
CREATE TABLE IF NOT EXISTS public.grade_share_links (
    token UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    criado_por UUID REFERENCES public.profiles(id),
    criado_em TIMESTAMPTZ DEFAULT NOW(),
    revogado BOOLEAN NOT NULL DEFAULT FALSE
);

-- Retorna o resumo público (sem login) da grade operacional via token
-- opaco — nunca lat/lng, voluntário ou check-in. Deriva a lista de
-- perímetros de areas.grupo_nome (não só de perimetro_status) pra
-- incluir também os que ainda não tiveram status alterado (default
-- "não iniciado", sem linha física ainda). RAISE EXCEPTION em token
-- inválido/revogado, pro client distinguir "link ruim" de "região sem
-- perímetros ainda" (retorno vazio).
CREATE OR REPLACE FUNCTION public.get_grade_publica(p_token UUID)
RETURNS TABLE (product_nome TEXT, ra_nome TEXT, grupo_nome TEXT, status TEXT, updated_at TIMESTAMPTZ)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_product_id UUID;
BEGIN
    SELECT gsl.product_id INTO v_product_id
    FROM public.grade_share_links gsl
    WHERE gsl.token = p_token AND gsl.revogado = FALSE;

    IF v_product_id IS NULL THEN
        RAISE EXCEPTION 'Link inválido ou revogado';
    END IF;

    RETURN QUERY
    SELECT p.nome, p.ra_nome, g.grupo_nome, COALESCE(ps.status, 'nao_iniciado'), ps.updated_at
    FROM public.products p
    CROSS JOIN LATERAL (
        SELECT DISTINCT a.grupo_nome FROM public.areas a
        WHERE a.product_id = p.id AND a.grupo_nome IS NOT NULL
    ) g
    LEFT JOIN public.perimetro_status ps ON ps.product_id = p.id AND ps.grupo_nome = g.grupo_nome
    WHERE p.id = v_product_id
    ORDER BY g.grupo_nome;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_grade_publica(UUID) TO anon, authenticated;

ALTER TABLE public.perimetro_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perimetro_status_historico ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.grade_share_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "perimetro_status_select_auth" ON public.perimetro_status;
CREATE POLICY "perimetro_status_select_auth" ON public.perimetro_status FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "perimetro_status_write_admin_or_coordenador" ON public.perimetro_status;
CREATE POLICY "perimetro_status_write_admin_or_coordenador" ON public.perimetro_status FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_coordenador_of_product(product_id))
    WITH CHECK (public.is_super_admin() OR public.is_coordenador_of_product(product_id));

-- Histórico é só-leitura pro client — a única via de escrita é o
-- trigger acima (SECURITY DEFINER), então de propósito não existe
-- policy de INSERT/UPDATE/DELETE aqui.
DROP POLICY IF EXISTS "perimetro_status_historico_select_auth" ON public.perimetro_status_historico;
CREATE POLICY "perimetro_status_historico_select_auth" ON public.perimetro_status_historico FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "grade_share_links_select_admin_or_coordenador" ON public.grade_share_links;
CREATE POLICY "grade_share_links_select_admin_or_coordenador" ON public.grade_share_links FOR SELECT TO authenticated
    USING (public.is_super_admin() OR public.is_coordenador_of_product(product_id));
DROP POLICY IF EXISTS "grade_share_links_write_admin_or_coordenador" ON public.grade_share_links;
CREATE POLICY "grade_share_links_write_admin_or_coordenador" ON public.grade_share_links FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_coordenador_of_product(product_id))
    WITH CHECK (public.is_super_admin() OR public.is_coordenador_of_product(product_id));


-- ============================================================
-- PARTE 9 — Fundação de autenticação por papel (Fase 1 da
-- reestruturação por papel). login.html passa a resolver o destino do
-- redirect pós-login por um papel — is_candidata é o único papel que
-- ainda não tinha uma coluna própria (coordenador/operacional já vêm
-- de product_team.papel; voluntário já vem de ter linha em
-- area_volunteers; is_super_admin já existe em profiles).
-- ============================================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_candidata BOOLEAN NOT NULL DEFAULT FALSE;


-- ============================================================
-- PARTE 10 — Candidata como perfil principal: is_candidata() passa a
-- valer nas mesmas políticas de escrita que hoje só reconhecem
-- is_super_admin() (ou is_coordenador_of_product()/is_member_of_product()),
-- nos pontos combinados com o usuário: estratégia de OKR
-- (products/periods/objectives/key_results), registro de coordenadores
-- (product_team), aprovação de agenda (agenda_eventos), mapa de
-- quadrantes/Grade Operacional/link de compartilhamento (areas/
-- area_volunteers/perimetro_status/grade_share_links) e leitura
-- campanha-inteira de check-ins e fotos de campo (checkins/
-- okr_artefatos — só leitura: aprovar/rejeitar check-in continua
-- exclusivo do coordenador via checkins_update_coordenador, inalterada,
-- decisão de produto confirmada).
-- ============================================================

CREATE OR REPLACE FUNCTION public.is_candidata()
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT COALESCE((SELECT is_candidata FROM public.profiles WHERE id = auth.uid()), FALSE);
$$;

-- products (criar/editar Coordenação Regional)
DROP POLICY IF EXISTS "products_write_admin" ON public.products;
CREATE POLICY "products_write_admin" ON public.products FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_candidata())
    WITH CHECK (public.is_super_admin() OR public.is_candidata());

-- periods (criar Ciclo)
DROP POLICY IF EXISTS "periods_write_admin" ON public.periods;
CREATE POLICY "periods_write_admin" ON public.periods FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_candidata())
    WITH CHECK (public.is_super_admin() OR public.is_candidata());

-- objectives (nivel='estrategico' sempre tem product_id NULL por CHECK
-- constraint — só o ramo is_super_admin()/is_candidata() é alcançável)
DROP POLICY IF EXISTS "objectives_write_admin_or_product_member" ON public.objectives;
CREATE POLICY "objectives_write_admin_or_product_member" ON public.objectives FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_candidata() OR (product_id IS NOT NULL AND public.is_member_of_product(product_id)))
    WITH CHECK (public.is_super_admin() OR public.is_candidata() OR (product_id IS NOT NULL AND public.is_member_of_product(product_id)));

-- key_results (segue o objective pai)
DROP POLICY IF EXISTS "key_results_write_admin_or_product_member" ON public.key_results;
CREATE POLICY "key_results_write_admin_or_product_member" ON public.key_results FOR ALL TO authenticated
    USING (
        public.is_super_admin() OR public.is_candidata() OR EXISTS (
            SELECT 1 FROM public.objectives o
            WHERE o.id = key_results.objective_id
              AND o.product_id IS NOT NULL
              AND public.is_member_of_product(o.product_id)
        )
    )
    WITH CHECK (
        public.is_super_admin() OR public.is_candidata() OR EXISTS (
            SELECT 1 FROM public.objectives o
            WHERE o.id = key_results.objective_id
              AND o.product_id IS NOT NULL
              AND public.is_member_of_product(o.product_id)
        )
    );

-- product_team (registrar/atribuir coordenador)
DROP POLICY IF EXISTS "product_team_write_admin_or_coordenador" ON public.product_team;
CREATE POLICY "product_team_write_admin_or_coordenador" ON public.product_team FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_candidata() OR public.is_member_of_product(product_id))
    WITH CHECK (public.is_super_admin() OR public.is_candidata() OR public.is_member_of_product(product_id));

-- agenda_eventos (publicar compromisso oficial / aprovar / recusar / excluir)
DROP POLICY IF EXISTS "agenda_insert_admin" ON public.agenda_eventos;
CREATE POLICY "agenda_insert_admin" ON public.agenda_eventos FOR INSERT TO authenticated
    WITH CHECK (public.is_super_admin() OR public.is_candidata());

DROP POLICY IF EXISTS "agenda_update_admin" ON public.agenda_eventos;
CREATE POLICY "agenda_update_admin" ON public.agenda_eventos FOR UPDATE TO authenticated
    USING (public.is_super_admin() OR public.is_candidata())
    WITH CHECK (public.is_super_admin() OR public.is_candidata());

DROP POLICY IF EXISTS "agenda_delete_admin" ON public.agenda_eventos;
CREATE POLICY "agenda_delete_admin" ON public.agenda_eventos FOR DELETE TO authenticated
    USING (public.is_super_admin() OR public.is_candidata());

-- checkins (leitura campanha-inteira, só SELECT — checkins_write_admin e
-- checkins_update_coordenador ficam intocadas, aprovação continua do coordenador)
DROP POLICY IF EXISTS "checkins_select_own_or_product_member" ON public.checkins;
CREATE POLICY "checkins_select_own_or_product_member" ON public.checkins FOR SELECT TO authenticated
    USING (
        public.is_super_admin()
        OR public.is_candidata()
        OR user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.areas a WHERE a.id = checkins.area_id AND public.is_member_of_product(a.product_id))
    );

-- okr_artefatos (leitura das fotos/comprovantes de campo vinculadas a check-in)
DROP POLICY IF EXISTS "artefatos_select_auth" ON public.okr_artefatos;
CREATE POLICY "artefatos_select_auth" ON public.okr_artefatos FOR SELECT TO authenticated
    USING (
        key_result_id IS NOT NULL
        OR public.is_super_admin()
        OR public.is_candidata()
        OR enviado_por = auth.uid()
        OR EXISTS (
            SELECT 1 FROM public.checkins c
            WHERE c.id = okr_artefatos.checkin_id
              AND EXISTS (SELECT 1 FROM public.areas a WHERE a.id = c.area_id AND public.is_member_of_product(a.product_id))
        )
    );

-- areas (nomear perímetro de quadrantes — só UPDATE; geração da grade
-- continua exclusiva do super_admin via areas_write_admin, inalterada)
DROP POLICY IF EXISTS "areas_update_coordenador" ON public.areas;
CREATE POLICY "areas_update_coordenador" ON public.areas FOR UPDATE TO authenticated
    USING (public.is_coordenador_of_product(product_id) OR public.is_super_admin() OR public.is_candidata())
    WITH CHECK (public.is_coordenador_of_product(product_id) OR public.is_super_admin() OR public.is_candidata());

-- area_volunteers (atribuir/remover voluntário de quadrante)
DROP POLICY IF EXISTS "area_volunteers_write_admin_or_product_member" ON public.area_volunteers;
CREATE POLICY "area_volunteers_write_admin_or_product_member" ON public.area_volunteers FOR ALL TO authenticated
    USING (
        public.is_super_admin() OR public.is_candidata() OR EXISTS (
            SELECT 1 FROM public.areas a WHERE a.id = area_volunteers.area_id AND public.is_member_of_product(a.product_id)
        )
    )
    WITH CHECK (
        public.is_super_admin() OR public.is_candidata() OR EXISTS (
            SELECT 1 FROM public.areas a WHERE a.id = area_volunteers.area_id AND public.is_member_of_product(a.product_id)
        )
    );

-- perimetro_status (ciclar status "não iniciado/em andamento/concluído" da Grade Operacional)
DROP POLICY IF EXISTS "perimetro_status_write_admin_or_coordenador" ON public.perimetro_status;
CREATE POLICY "perimetro_status_write_admin_or_coordenador" ON public.perimetro_status FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_candidata() OR public.is_coordenador_of_product(product_id))
    WITH CHECK (public.is_super_admin() OR public.is_candidata() OR public.is_coordenador_of_product(product_id));

-- grade_share_links (gerar/revogar link de compartilhamento somente-leitura da Grade)
DROP POLICY IF EXISTS "grade_share_links_select_admin_or_coordenador" ON public.grade_share_links;
CREATE POLICY "grade_share_links_select_admin_or_coordenador" ON public.grade_share_links FOR SELECT TO authenticated
    USING (public.is_super_admin() OR public.is_candidata() OR public.is_coordenador_of_product(product_id));

DROP POLICY IF EXISTS "grade_share_links_write_admin_or_coordenador" ON public.grade_share_links;
CREATE POLICY "grade_share_links_write_admin_or_coordenador" ON public.grade_share_links FOR ALL TO authenticated
    USING (public.is_super_admin() OR public.is_candidata() OR public.is_coordenador_of_product(product_id))
    WITH CHECK (public.is_super_admin() OR public.is_candidata() OR public.is_coordenador_of_product(product_id));


-- ============================================================
-- PARTE 11 — Autocadastro de equipe com aprovação (convite.html):
-- "Adicionar à Equipe" hoje exige que a pessoa já tenha conta criada
-- antes (não existe mais nenhum fluxo de cadastro desde que a aba OKR
-- saiu de index.html na Fase 2) — sem isso, candidata/admin não
-- conseguem de fato "cadastrar coordenador" nenhum. convite.html é uma
-- página pública (link fixo, dá pra mandar pelo WhatsApp): a pessoa cria
-- a própria conta (nome/e-mail/senha) e pede pra entrar numa Coordenação
-- Regional com um papel — fica pendente até candidata ou admin aprovar
-- (aprovar insere de fato em product_team, reaproveitando a policy já
-- ampliada na Parte 10; recusar só marca o pedido como recusado).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.team_join_requests (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    papel TEXT NOT NULL CHECK (papel IN ('coordenador', 'operacional')),
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'aprovado', 'recusado')),
    resposta TEXT,
    respondido_por UUID REFERENCES public.profiles(id),
    respondido_em TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.team_join_requests ENABLE ROW LEVEL SECURITY;

-- Leitura: quem pediu vê o próprio pedido; candidata/admin veem todos
-- (é quem aprova). Nenhum coordenador de produto vê pedido de outros —
-- aprovação é sempre nível estratégico, não da própria Coordenação.
DROP POLICY IF EXISTS "team_join_requests_select" ON public.team_join_requests;
CREATE POLICY "team_join_requests_select" ON public.team_join_requests FOR SELECT TO authenticated
    USING (public.is_super_admin() OR public.is_candidata() OR user_id = auth.uid());

-- Inserção: só o próprio usuário recém-cadastrado, e só como pendente —
-- convite.html chama isto logo depois do signUp(), já autenticado como
-- a pessoa que está pedindo.
DROP POLICY IF EXISTS "team_join_requests_insert_own" ON public.team_join_requests;
CREATE POLICY "team_join_requests_insert_own" ON public.team_join_requests FOR INSERT TO authenticated
    WITH CHECK (user_id = auth.uid() AND status = 'pendente');

-- Aprovar/recusar: só candidata/admin — a aprovação em si (inserir a
-- linha real em product_team) é uma segunda escrita separada, feita
-- pelo client de quem aprova, e já coberta por
-- product_team_write_admin_or_coordenador (Parte 10).
DROP POLICY IF EXISTS "team_join_requests_update_admin" ON public.team_join_requests;
CREATE POLICY "team_join_requests_update_admin" ON public.team_join_requests FOR UPDATE TO authenticated
    USING (public.is_super_admin() OR public.is_candidata())
    WITH CHECK (public.is_super_admin() OR public.is_candidata());


-- ============================================================
-- PARTE 12 — Formulário de Ação de Campo (check-in do voluntário):
-- checkins ganha os campos do "Formulário de Ação de Campo / Visita do
-- Voluntário" pedido pelo usuário — tipo de ação, métricas de volume,
-- captação de contato/liderança pro CRM, percepção da rua (pautas +
-- receptividade) e depoimento livre. Nenhuma policy nova precisa mudar:
-- checkins_insert_own_area (INSERT) e checkins_select_own_or_product_member
-- (SELECT) não checam colunas específicas, só que a linha é do próprio
-- voluntário/quadrante — colunas novas passam por elas automaticamente.
-- ============================================================

ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS tipo_acao TEXT
    CHECK (tipo_acao IN ('visita_domiciliar', 'panfletagem', 'bandeiraco', 'reuniao_quadra', 'abordagem_pesquisa'));
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS local_exato TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS pessoas_impactadas INTEGER;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS panfletos_distribuidos INTEGER;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS apoiadores_cadastrados INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS contato_nome TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS contato_whatsapp TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS contato_nivel_interesse TEXT
    CHECK (contato_nivel_interesse IN ('simpatizante', 'indeciso', 'resistente', 'lideranca'));
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS pautas_locais TEXT[];
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS pauta_outro TEXT;
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS receptividade SMALLINT CHECK (receptividade BETWEEN 1 AND 5);
ALTER TABLE public.checkins ADD COLUMN IF NOT EXISTS depoimento TEXT;
