import { settingsService } from '../admin/settings.service.js';

export class WorkflowService {

    async triggerAnalysis(files: Express.Multer.File[], metadata: any, user: any) {
        const config = await settingsService.getAllForAdmin(); // Or specific get
        // Retrieve public config URL or internal env URL
        // In this case, we prefer ENV for security, but settings allows dynamic updates.
        // Fallback to Env if Settings missing.
        const webhookUrl = process.env.N8N_WEBHOOK_URL || 'https://n8n.conversio.ao/webhook-test/document-analysis';

        console.log(`[WorkflowService] Triggering analysis via ${webhookUrl} for ${files.length} files.`);

        const formData = new FormData();

        // 1. Append Files
        files.forEach((file) => {
            const blob = new Blob([new Uint8Array(file.buffer)], { type: file.mimetype });
            formData.append('files', blob, file.originalname);
        });

        // 2. Append Metadata
        formData.append('companyId', user.companyId);
        formData.append('userId', user.id);

        if (metadata) {
            formData.append('metadata', typeof metadata === 'string' ? metadata : JSON.stringify(metadata));
        }

        try {
            const response = await fetch(webhookUrl, {
                method: 'POST',
                body: formData,
                // Do NOT set Content-Type header manually with FormData, fetch sets it with boundary
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`N8N Error (${response.status}): ${errText}`);
            }

            const data = await response.json();
            return data;

        } catch (error: any) {
            console.error('[WorkflowService] Trigger Error:', error);
            throw new Error(`Falha ao conectar com o motor de análise: ${error.message}`);
        }
    }
}

export const workflowService = new WorkflowService();
