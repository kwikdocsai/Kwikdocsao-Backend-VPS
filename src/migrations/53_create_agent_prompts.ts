import { executeQuery } from '../database/postgres.client.js';

export const runAgentPromptsMigration = async () => {
    try {
        console.log('🔄 Executing migration: CREATE agent_prompts table and default prompts...');

        // 1. Create Table
        await executeQuery(`
            CREATE TABLE IF NOT EXISTS agent_prompts (
                id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                agent_id VARCHAR(50) UNIQUE NOT NULL, -- e.g., 'sentinel', 'fiscal_expert'
                name VARCHAR(100) NOT NULL,
                system_prompt TEXT NOT NULL,
                user_prompt_template TEXT,
                model VARCHAR(50) DEFAULT 'gpt-4-turbo-preview',
                temperature FLOAT DEFAULT 0.0,
                is_active BOOLEAN DEFAULT TRUE,
                updated_at TIMESTAMP DEFAULT NOW(),
                updated_by UUID
            );
        `);

        // 2. Default Prompts
        const prompts = [
            {
                agent_id: 'sentinel',
                name: 'KwikDocs Sentinel (Ocr & Validation)',
                model: 'gpt-4o',
                temperature: 0.0,
                system_prompt: `Você é o SENTINEL, o especialista em extração e validação de dados da KwikDocs.
Sua missão é extrair dados de documentos fiscais angolanos (Faturas, Recibos, Notas de Débito/Crédito) com precisão absoluta.
Você deve retornar APENAS o JSON estruturado, sem explicações.`
            },
            {
                agent_id: 'fiscal_expert',
                name: 'Consultor Fiscal KwikDocs',
                model: 'gpt-4o',
                temperature: 0.3,
                system_prompt: `Você é o FISCAL EXPERT da KwikDocs.
Especialista em legislação fiscal de Angola (IVA, IRT, Imposto de Selo).
Sua missão é analisar o PDF e os dados extraídos, identificando erros de cálculo, falta de requisitos legais (NIF, morada, menções obrigatórias) e sugerir correções.`
            },
            {
                agent_id: 'compliance_officer',
                name: 'Compliance Officer',
                model: 'o1-mini',
                temperature: 0.1,
                system_prompt: `Você é o Compliance Officer da KwikDocs.
Foco em auditoria e prevenção de fraudes. Verifique se o documento parece legítimo e se cumpre as normas de retenção na fonte.`
            }
        ];

        for (const p of prompts) {
            await executeQuery(`
                INSERT INTO agent_prompts (agent_id, name, system_prompt, model, temperature)
                VALUES ($1, $2, $3, $4, $5)
                ON CONFLICT (agent_id) DO UPDATE SET
                    name = EXCLUDED.name,
                    system_prompt = EXCLUDED.system_prompt,
                    model = EXCLUDED.model,
                    temperature = EXCLUDED.temperature,
                    updated_at = NOW();
            `, [p.agent_id, p.name, p.system_prompt, p.model, p.temperature]);
        }

        console.log('✅ Migration agent_prompts completed.');
    } catch (err) {
        console.error('❌ Migration agent_prompts failed:', err);
    }
};
