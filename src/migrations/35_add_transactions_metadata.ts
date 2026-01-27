
import { executeQuery } from '../database/postgres.client.js';

export async function runAddTransactionsMetadataMigration() {
    console.log('🔧 Executando migração: Adição da coluna metadata à tabela transactions...');

    try {
        // Garantir que a tabela existe (deveria existir pela migração 09)
        await executeQuery(`
            ALTER TABLE public.transactions 
            ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT '{}';
        `);

        console.log('✅ Coluna metadata adicionada com sucesso à tabela transactions!');
    } catch (err: any) {
        console.error('❌ Erro na migração de metadados de transações:', err.message);
        // Não lançamos erro aqui para não travar o boot se for algo menor, 
        // mas como esta coluna é necessária para o fluxo de membros, talvez devêssemos.
        throw err;
    }
}
