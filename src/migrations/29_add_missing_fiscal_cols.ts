import { executeQuery } from '../database/postgres.client.js';

export async function runAddMissingFiscalColsMigration() {
    console.log('🔧 Executando migração: Adicionando colunas fiscais em falta e company_id às auditorias...');

    try {
        // 1. Adicionar company_id à tabela faturix_audits
        await executeQuery(`
            ALTER TABLE public.faturix_audits 
            ADD COLUMN IF NOT EXISTS company_id UUID;
        `);

        // Tentar linkar company_id se a tabela companies existir
        try {
            await executeQuery('ALTER TABLE faturix_audits ADD CONSTRAINT fk_faturix_audits_company FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE;');
        } catch (e) {
            console.log('ℹ️ Constraint de companhia para faturix_audits já existe ou tabela companies ausente.');
        }

        // 2. Adicionar colunas fiscais em falta à tabela documents
        // Unificando com os nomes esperados no auth.service.ts
        await executeQuery(`
            ALTER TABLE public.documents 
            ADD COLUMN IF NOT EXISTS nif_emitente TEXT,
            ADD COLUMN IF NOT EXISTS valor_documento NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS valor_iva NUMERIC DEFAULT 0,
            ADD COLUMN IF NOT EXISTS status_fiscal TEXT,
            ADD COLUMN IF NOT EXISTS compliance_level TEXT,
            ADD COLUMN IF NOT EXISTS tipo_movimento TEXT;
        `);

        // Garantir que não haja nulos em colunas numéricas críticas
        await executeQuery(`
            UPDATE public.documents SET 
                valor_documento = COALESCE(valor_documento, 0),
                valor_iva = COALESCE(valor_iva, 0)
            WHERE valor_documento IS NULL OR valor_iva IS NULL;
        `);

        // 3. (Opcional) Migrar dados existentes de fiscal_status para status_fiscal e movement_type para tipo_movimento se houver
        // VERIFICAÇÃO DE SEGURANÇA: Só tenta ler fiscal_status se ela realmente existir
        const checkCols = await executeQuery(`
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'documents' 
            AND column_name IN ('fiscal_status', 'movement_type');
        `);

        const existingCols = checkCols.rows.map((r: any) => r.column_name);
        const hasFiscal = existingCols.includes('fiscal_status');
        const hasMovement = existingCols.includes('movement_type');

        if (hasFiscal || hasMovement) {
            let updateSet = [];
            if (hasFiscal) updateSet.push("status_fiscal = COALESCE(status_fiscal, fiscal_status)");
            if (hasMovement) updateSet.push("tipo_movimento = COALESCE(tipo_movimento, movement_type)");

            if (updateSet.length > 0) {
                await executeQuery(`
                    UPDATE public.documents 
                    SET ${updateSet.join(', ')}
                    WHERE status_fiscal IS NULL OR tipo_movimento IS NULL;
                `);
                console.log('   🔄 Dados migrados de colunas antigas (fiscal_status/movement_type).');
            }
        } else {
            console.log('   ℹ️ Colunas antigas (fiscal_status/movement_type) não detectadas. Pulando migração de dados legado.');
        }

        console.log('✅ Colunas fiscais e company_id adicionadas com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração add_missing_fiscal_cols:', err);
        throw err;
    }
}
