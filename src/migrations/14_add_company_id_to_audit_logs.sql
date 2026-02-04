
-- Migração: Enriquecimento de Logs para Auditoria Fiscal
-- Adiciona company_id à tabela audit_logs para permitir filtragem por empresa

ALTER TABLE audit_logs ADD COLUMN IF NOT EXISTS company_id UUID;

-- Adicionar índice para performance de feed de relatórios
CREATE INDEX IF NOT EXISTS idx_audit_logs_company_action ON audit_logs(company_id, action, created_at DESC);

COMMENT ON COLUMN audit_logs.company_id IS 'ID da empresa associada ao evento (opcional para logs globais)';
