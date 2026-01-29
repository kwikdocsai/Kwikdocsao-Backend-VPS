export class N8nService {
    async provisionWorkflow(clientName, config) {
        const { n8n_base_url, n8n_api_key, n8n_template_id, plan_name } = config;
        // Ensure URL does not have trailing slash
        const baseUrl = n8n_base_url.endsWith('/') ? n8n_base_url.slice(0, -1) : n8n_base_url;
        console.log(`[N8N] Provisioning flow for ${clientName} on ${plan_name} (${baseUrl})...`);
        try {
            // 1. Fetch Template Workflow
            const templateRes = await fetch(`${baseUrl}/api/v1/workflows/${n8n_template_id}`, {
                headers: { 'X-N8N-API-KEY': n8n_api_key }
            });
            console.log(`[N8N] GET Template Status: ${templateRes.status}`);
            if (!templateRes.ok) {
                const err = await templateRes.text();
                console.error(`[N8N] Error Fetching Template:`, err);
                throw new Error(`Failed to fetch template workflow: ${err}`);
            }
            const templateData = await templateRes.json();
            const workflowNodes = templateData.nodes;
            const workflowConnections = templateData.connections;
            // 2. Prepare New Workflow Data - New Naming Pattern: ANALISE - {Empresa} - {Plano}
            const newWorkflowName = `ANALISE - ${clientName} - ${plan_name}`;
            const newWorkflowData = {
                name: newWorkflowName,
                nodes: workflowNodes,
                connections: workflowConnections,
                settings: { ...templateData.settings, saveExecutionProgress: true }
            };
            // 3. Create New Workflow
            const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
                method: 'POST',
                headers: {
                    'X-N8N-API-KEY': n8n_api_key,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(newWorkflowData)
            });
            console.log(`[N8N] POST Create Workflow Status: ${createRes.status}`);
            if (!createRes.ok) {
                const err = await createRes.text();
                console.error(`[N8N] Error Creating Workflow:`, err);
                throw new Error(`Failed to create client workflow: ${err}`);
            }
            const newWorkflow = await createRes.json();
            const newWorkflowId = newWorkflow.id;
            console.log(`[N8N] Created workflow ${newWorkflowId} assigned to ${clientName}`);
            // 4. Force Activation
            const activateRes = await fetch(`${baseUrl}/api/v1/workflows/${newWorkflowId}/activate`, {
                method: 'POST',
                headers: { 'X-N8N-API-KEY': n8n_api_key }
            });
            console.log(`[N8N] Activation Status: ${activateRes.status}`);
            // 5. Extract Webhook URL
            const webhookNode = newWorkflow.nodes.find((n) => n.type === 'n8n-nodes-base.webhook');
            if (!webhookNode) {
                throw new Error('Template workflow does not contain a Webhook node.');
            }
            const path = webhookNode.parameters?.path;
            if (!path)
                throw new Error('Webhook node has no path defined.');
            const webhookUrl = `${baseUrl}/webhook/${path}`;
            return {
                workflowId: newWorkflowId,
                webhookUrl: webhookUrl,
                n8nUrl: baseUrl
            };
        }
        catch (error) {
            console.error('[N8N Provisioning Error]', error);
            throw new Error(`N8N Provisioning Failed: ${error.message}`);
        }
    }
    async deleteWorkflow(workflowId, baseUrl, apiKey) {
        console.log(`[N8N] Deleting workflow ${workflowId} on ${baseUrl}...`);
        try {
            const url = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
            const res = await fetch(`${url}/api/v1/workflows/${workflowId}`, {
                method: 'DELETE',
                headers: { 'X-N8N-API-KEY': apiKey }
            });
            if (!res.ok) {
                const err = await res.text();
                console.warn(`[N8N] Delete failed for workflow ${workflowId}:`, err);
            }
            else {
                console.log(`[N8N] Deleted workflow ${workflowId} successfully.`);
            }
        }
        catch (error) {
            console.warn(`[N8N] Error deleting workflow ${workflowId}:`, error.message);
        }
    }
}
export const n8nService = new N8nService();
