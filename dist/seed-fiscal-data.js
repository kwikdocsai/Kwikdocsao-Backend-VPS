import { executeQuery } from './database/postgres.client.js';
import dotenv from 'dotenv';
dotenv.config();
async function seed() {
    console.log('🌱 Iniciando seeding de dados fiscais...');
    try {
        // 1. Pegar uma empresa e um usuário para associar os dados
        const companyRes = await executeQuery('SELECT id, nif FROM companies LIMIT 1');
        const userRes = await executeQuery('SELECT id FROM users LIMIT 1');
        if (companyRes.rowCount === 0 || userRes.rowCount === 0) {
            console.error('❌ Nenhuma empresa ou usuário encontrado para associar os dados.');
            return;
        }
        const companyId = companyRes.rows[0].id;
        const companyNif = companyRes.rows[0].nif || '5001234567';
        const userId = userRes.rows[0].id;
        console.log(`🏢 Empresa alvo: ${companyId} (NIF: ${companyNif})`);
        // 2. Limpar dados antigos (opcional, para teste limpo)
        // await executeQuery('DELETE FROM documents WHERE company_id = $1', [companyId]);
        // 3. Inserir Documentos de ENTRADA (Vendas para a empresa, ou seja, emitidos pela empresa?)
        // De acordo com a lógica: Entrada = nif_emitente == companyNIF
        const sales = [
            { name: 'Fatura FR2026/001', val: 1500000, iva: 210000, type: 'ENTRADA' },
            { name: 'Fatura FR2026/002', val: 2800000, iva: 392000, type: 'ENTRADA' },
            { name: 'Fatura FR2026/003', val: 750000, iva: 105000, type: 'ENTRADA' }
        ];
        for (const s of sales) {
            await executeQuery(`
                INSERT INTO documents (
                    company_id, uploaded_by, file_name, status, type, 
                    valor_documento, valor_iva, tipo_movimento, nif_emitente, 
                    status_fiscal, created_at
                ) VALUES ($1, $2, $3, 'COMPLETED', 'FATURA', $4, $5, $6, $7, 'CONFORME', NOW() - interval '2 days')
            `, [companyId, userId, s.name, s.val, s.iva, s.type, companyNif]);
        }
        // 4. Inserir Documentos de SAÍDA (Despesas)
        const expenses = [
            { name: 'Fatura Compra ABC', val: 450000, iva: 63000, type: 'SAIDA', nif: '5401122334' },
            { name: 'Recibo Aluguer', val: 1200000, iva: 0, type: 'SAIDA', nif: '5009988776' },
            { name: 'Fatura Internet UNITEL', val: 85000, iva: 11900, type: 'SAIDA', nif: '5001111111' }
        ];
        for (const e of expenses) {
            await executeQuery(`
                INSERT INTO documents (
                    company_id, uploaded_by, file_name, status, type, 
                    valor_documento, valor_iva, tipo_movimento, nif_emitente, 
                    status_fiscal, created_at
                ) VALUES ($1, $2, $3, 'COMPLETED', 'FATURA', $4, $5, $6, $7, 'CONFORME', NOW() - interval '5 days')
            `, [companyId, userId, e.name, e.val, e.iva, e.type, e.nif]);
        }
        // 5. Inserir alguns Alertas para testar o contador
        await executeQuery(`
            INSERT INTO documents (
                company_id, uploaded_by, file_name, status, type, 
                valor_documento, valor_iva, tipo_movimento, nif_emitente, 
                status_fiscal, created_at
            ) VALUES ($1, $2, $3, 'REJEITADO', 'FATURA', $4, $5, $6, $7, 'ALERTA', NOW())
        `, [companyId, userId, 'Fatura Suspeita #666', 100000, 14000, 'SAIDA', '9999999999']);
        console.log('✅ Dados fiscais populados com sucesso!');
        process.exit(0);
    }
    catch (err) {
        console.error('❌ Erro durante o seeding:', err);
        process.exit(1);
    }
}
seed();
