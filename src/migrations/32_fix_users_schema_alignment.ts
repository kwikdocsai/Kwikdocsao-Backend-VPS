
import { executeQuery } from '../database/postgres.client.js';

export async function runFixUsersSchemaAlignmentMigration() {
    console.log('🔧 Executando migração: Alinhamento do esquema da tabela users (Fase 32)...');

    try {
        // 1. Renomear password_hash para password se necessário
        try {
            // Verificar se password_hash existe e password não existe
            const colsRes = await executeQuery(`
                SELECT column_name 
                FROM information_schema.columns 
                WHERE table_name = 'users' AND column_name IN ('password_hash', 'password')
            `);
            const cols = colsRes.rows.map((r: any) => r.column_name);

            if (cols.includes('password_hash') && !cols.includes('password')) {
                await executeQuery('ALTER TABLE public.users RENAME COLUMN password_hash TO password;');
                console.log('✅ Coluna password_hash renomeada para password.');
            }
        } catch (e: any) {
            console.warn('⚠️ Aviso ao verificar/renomear password_hash:', e.message);
        }

        // 2. Adicionar colunas em falta
        await executeQuery(`
            ALTER TABLE public.users 
            ADD COLUMN IF NOT EXISTS company_id UUID,
            ADD COLUMN IF NOT EXISTS force_password_change BOOLEAN DEFAULT false,
            ADD COLUMN IF NOT EXISTS last_login TIMESTAMP,
            ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'ACTIVE';
        `);

        // 3. Adicionar constraint se não existir
        try {
            // Primeiro verificar se a tabela companies existe
            const tableCheck = await executeQuery(`
                SELECT EXISTS (
                    SELECT FROM information_schema.tables 
                    WHERE table_schema = 'public' 
                    AND table_name = 'companies'
                );
            `);

            if (tableCheck.rows[0].exists) {
                await executeQuery(`
                    ALTER TABLE public.users 
                    ADD CONSTRAINT fk_users_company 
                    FOREIGN KEY (company_id) 
                    REFERENCES companies(id) ON DELETE SET NULL;
                `);
                console.log('✅ Constraint de companhia adicionada à tabela users.');
            }
        } catch (e: any) {
            // Ignorar erro se a constraint já existir
            if (!e.message.includes('already exists')) {
                console.warn('⚠️ Aviso ao adicionar constraint fk_users_company:', e.message);
            }
        }

        console.log('✅ Esquema da tabela users alinhado com sucesso!');
    } catch (err) {
        console.error('❌ Erro na migração de alinhamento users:', err);
        throw err;
    }
}
