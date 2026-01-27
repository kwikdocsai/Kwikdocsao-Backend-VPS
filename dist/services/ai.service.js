import OpenAI from 'openai';
export class AiService {
    openai = null;
    getClient() {
        if (this.openai)
            return this.openai;
        const apiKey = process.env.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API Key não configurada no servidor.');
        }
        this.openai = new OpenAI({
            apiKey: apiKey,
        });
        return this.openai;
    }
    async chat(messages, model = 'gpt-4o-mini') {
        const client = this.getClient();
        try {
            const completion = await client.chat.completions.create({
                model: model,
                messages: messages,
                temperature: 0.7,
            });
            return completion.choices[0].message;
        }
        catch (error) {
            console.error('[AiService] Chat Error:', error);
            throw new Error('Falha na comunicação com a IA.');
        }
    }
    async auditDocument(docData, prompt) {
        const client = this.getClient();
        const systemPrompt = prompt || `Você é um Auditor Fiscal Angolano Sênior (AGT). 
        Analise o JSON do documento fiscal fornecido.
        Identifique erros de conformidade com a lei angolana (CIVA, RJF).
        Retorne um JSON puro com: { "status": "APROVADO" | "REJEITADO", "issues": string[], "justification": string, "confidence": number }.`;
        try {
            const completion = await client.chat.completions.create({
                model: 'gpt-4o',
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: JSON.stringify(docData) }
                ],
                response_format: { type: 'json_object' }
            });
            const content = completion.choices[0].message.content;
            return JSON.parse(content || '{}');
        }
        catch (error) {
            console.error('[AiService] Audit Error:', error);
            throw new Error('Falha na auditoria inteligente.');
        }
    }
}
export const aiService = new AiService();
