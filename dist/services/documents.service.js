import { executeQuery, executeTransaction } from '../database/postgres.client.js';
import { ServerSubscriptionService } from './serverSubscription.service.js';
import { storageService } from './storage.service.js';
const subscriptionService = new ServerSubscriptionService();
export class DocumentsService {
    async create(userId, fileName, companyId, type) {
        const result = await executeQuery(`INSERT INTO documents (uploaded_by, company_id, file_name, type, status)
             VALUES ($1, $2, $3, $4, 'PENDING')
             RETURNING *`, [userId, companyId, fileName, type || 'UNKNOWN']);
        return result.rows[0];
    }
    async findByUser(userId, limit = 50, offset = 0) {
        const result = await executeQuery(`SELECT * FROM documents WHERE uploaded_by = $1
             ORDER BY created_at DESC LIMIT $2 OFFSET $3`, [userId, limit, offset]);
        return result.rows;
    }
    async findById(id) {
        const result = await executeQuery(`SELECT * FROM documents WHERE id = $1`, [id]);
        return result.rows[0];
    }
    async update(id, data, client) {
        const fields = [];
        const values = [];
        let idx = 1;
        if (data.status) {
            fields.push(`status = $${idx++}`);
            values.push(data.status);
        }
        if (data.type) {
            fields.push(`type = $${idx++}`);
            values.push(data.type);
        }
        if (data.analysisResult) {
            fields.push(`data = $${idx++}`);
            values.push(JSON.stringify(data.analysisResult));
            fields.push(`full_analysis = $${idx++}`);
            values.push(JSON.stringify(data.analysisResult));
        }
        if (data.rawResponse) {
            fields.push(`raw_n8n_response = $${idx++}`);
            values.push(JSON.stringify(data.rawResponse));
        }
        if (data.rawText) {
            fields.push(`raw_text = $${idx++}`);
            values.push(data.rawText);
        }
        if (data.fileUrl) {
            fields.push(`file_url = $${idx++}`);
            values.push(data.fileUrl);
        }
        if (data.storagePath) {
            fields.push(`storage_path = $${idx++}`);
            values.push(data.storagePath);
        }
        if (data.bucketName) {
            fields.push(`bucket_name = $${idx++}`);
            values.push(data.bucketName);
        }
        if (data.fiscalFields) {
            const f = data.fiscalFields;
            if (f.tipo_movimento) {
                fields.push(`tipo_movimento = $${idx++}`);
                values.push(f.tipo_movimento);
            }
            if (f.valor_iva !== undefined) {
                fields.push(`valor_iva = $${idx++}`);
                values.push(f.valor_iva);
            }
            if (f.valor_documento !== undefined) {
                fields.push(`valor_documento = $${idx++}`);
                values.push(f.valor_documento);
            }
            if (f.status_fiscal) {
                fields.push(`status_fiscal = $${idx++}`);
                values.push(f.status_fiscal);
            }
            if (f.compliance_level) {
                fields.push(`compliance_level = $${idx++}`);
                values.push(f.compliance_level);
            }
            if (f.valor_retencao !== undefined) {
                fields.push(`valor_retencao = $${idx++}`);
                values.push(f.valor_retencao);
            }
            if (f.nif_emitente) {
                fields.push(`nif_emitente = $${idx++}`);
                values.push(f.nif_emitente);
            }
            if (f.valor_base !== undefined) {
                fields.push(`valor_base = $${idx++}`);
                values.push(f.valor_base);
            }
        }
        if (fields.length === 0)
            return null;
        values.push(id);
        const query = client ? (text, params) => client.query(text, params) : executeQuery;
        const result = await query(`UPDATE documents SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`, values);
        return result.rows[0];
    }
    async delete(id) {
        await executeQuery(`DELETE FROM documents WHERE id = $1`, [id]);
        return { deleted: true };
    }
    async analyze(userId, data) {
        // Fetch companyId and company name
        const userRes = await executeQuery('SELECT company_id FROM users WHERE id = $1', [userId]);
        const companyId = userRes.rows[0]?.company_id;
        if (!companyId)
            throw new Error('Company not found for user');
        // Fetch company name
        const companyRes = await executeQuery('SELECT name FROM companies WHERE id = $1', [companyId]);
        const companyName = companyRes.rows[0]?.name || 'Unknown';
        // 1. Upload to S3 BEFORE DB Save
        const cleanBase64 = data.base64.split(',')[1] || data.base64;
        const buffer = Buffer.from(cleanBase64, 'base64');
        const category = storageService.getCategoryByType(data.type);
        const uploadResult = await storageService.uploadFile(buffer, data.fileName, data.mimeType, companyId, companyName, category);
        // 2. Save document with URL (Synchronous Initial Save - NO BASE64 IN DB)
        const insertResult = await executeQuery(`INSERT INTO documents (uploaded_by, company_id, file_name, type, status, file_url, storage_path, bucket_name)
             VALUES ($1, $2, $3, $4, 'PROCESSING', $5, $6, $7)
             RETURNING *`, [userId, companyId, data.fileName, data.type, uploadResult.url, uploadResult.path, uploadResult.bucket]);
        const docId = insertResult.rows[0].id;
        // 3. Background Process (Fire and Forget)
        (async () => {
            try {
                const webhookUrl = await subscriptionService.getCompanyWebhook(companyId);
                console.log(`[Analyze] Routing to: ${webhookUrl}`);
                const formData = new FormData();
                // Send standard binary to n8n as fallback/existing flow
                const blob = new Blob([buffer], { type: data.mimeType });
                formData.append('data', blob, data.fileName);
                formData.append('mimeType', data.mimeType);
                formData.append('fileName', data.fileName);
                formData.append('type', data.type);
                formData.append('docId', docId);
                formData.append('userId', userId);
                formData.append('companyId', companyId);
                formData.append('fileUrl', uploadResult.url); // Send new URL to n8n
                console.log(`[Analyze] Sending to n8n (Background): ${webhookUrl}`);
                const response = await fetch(webhookUrl, {
                    method: "POST",
                    body: formData
                });
                // 4. Fire-and-Forget: Do NOT await n8n response body
                // The webhook will call us back at /api/webhooks/n8n/completed
                console.log(`[Analyze] Dispatch successful. Waiting for Async Webhook Callback...`);
            }
            catch (error) {
                console.error(`[Analyze] Background Dispatch Error for doc ${docId}:`, error);
                await this.update(docId, { status: 'ERROR' });
            }
        })();
        // Return immediately with 'PROCESSING' status
        return insertResult.rows[0];
    }
    async completeAnalysis(docId, n8nData, userId) {
        // Safe Parser Helper
        // Safe Parser Helper (Robust Version)
        const parseNum = (val) => {
            if (!val)
                return 0;
            if (typeof val === 'number')
                return val;
            try {
                // 1. Convert to string and clean currency/text (keep digits, commas, dots, minus)
                let str = String(val).replace(/[^\d.,-]/g, '').trim();
                // 2. Handle "32 900,00" -> The regex removed space, so we have "32900,00"
                // 3. Detect format logic
                if (str.includes(',') && !str.includes('.')) {
                    // "1000,00" -> "1000.00"
                    str = str.replace(',', '.');
                }
                else if (str.includes('.') && str.includes(',')) {
                    // Mixed: "1.200,00" (EU) or "1,200.00" (US)
                    if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                        // EU: "1.200,00" -> Remove dots, repl comma with dot
                        str = str.replace(/\./g, '').replace(',', '.');
                    }
                    else {
                        // US: "1,200.00" -> Remove commas
                        str = str.replace(/,/g, '');
                    }
                }
                const n = parseFloat(str);
                return isNaN(n) ? 0 : n;
            }
            catch (e) {
                return 0;
            }
        };
        // Resolve userId and companyId if not provided
        let resolvedUserId = userId;
        let companyId = null;
        const docRes = await executeQuery('SELECT uploaded_by, company_id FROM documents WHERE id = $1', [docId]);
        if (docRes.rowCount && docRes.rowCount > 0) {
            resolvedUserId = resolvedUserId || docRes.rows[0].uploaded_by;
            companyId = docRes.rows[0].company_id;
        }
        else {
            console.error(`[Analyze CRITICAL] Document ${docId} NOT FOUND in DB. Webhook might be using a stale or external ID.`);
            throw new Error(`Document ${docId} not found`);
        }
        // Use Transaction for Atomicity
        return await executeTransaction(async (client) => {
            // Resilient N8N Data Extraction (Recursively look for data)
            const n8nItem = Array.isArray(n8nData) && n8nData.length > 0 ? n8nData[0] : n8nData;
            let d = n8nItem.output || n8nItem.json || n8nItem || {};
            // UNPACK: If data is wrapped in 'resultado_analise', use the inner object
            // AGGRESSIVE UNPACKING STRATEGY
            if (d.resultado_analise) {
                let unpacked = d.resultado_analise;
                // Case 1: Pure String (potentially stringified JSON)
                if (typeof unpacked === 'string') {
                    try {
                        console.log(`[Analyze Debud] Attempting parse on 'resultado_analise' string (Len: ${unpacked.length})`);
                        // Clean potential "json" wrapper text or whitespace
                        unpacked = unpacked.trim();
                        if ((unpacked.startsWith('{') || unpacked.startsWith('['))) {
                            const parsed = JSON.parse(unpacked);
                            // If parsed is STILL a string (double encoded), parse again
                            if (typeof parsed === 'string') {
                                console.log('[Analyze Debug] Double-encoded JSON detected. Parsing again...');
                                d = { ...d, ...JSON.parse(parsed) };
                            }
                            else {
                                d = { ...d, ...parsed };
                            }
                        }
                        else {
                            console.warn('[Analyze Warn] resultado_analise is string but not JSON-like. Ignoring.');
                        }
                    }
                    catch (e) {
                        console.error('[Analyze Error] Failed to parse resultado_analise string:', e);
                    }
                }
                // Case 2: Already an Object
                else if (typeof unpacked === 'object') {
                    console.log(`[Analyze Debug] Unpacking 'resultado_analise' object. Keys: ${Object.keys(unpacked).join(', ')}`);
                    d = { ...d, ...unpacked };
                }
            }
            console.log(`[Analyze Debug] Mapped data for ${docId}. Source keys: ${Object.keys(d).join(', ')}`);
            const math = d.analise_matematica || d.math_analysis || {};
            const decisao = d.decisao_final || d.fiscal_decision || d.decision || {};
            const totais = d.totais || d.root?.totais || d.totals || {};
            const emitente = d.emitente || d.issuer_data || {};
            // STRICT STATUS MAPPING
            // STRICT STATUS MAPPING (Only APROVADO or REJEITADO)
            let finalDocStatus = 'REJEITADO'; // Default safe fallback
            const n8nStatus = (decisao.status || d.status || decisao.decision || '').toUpperCase();
            if (n8nStatus.includes('APROVAD') || n8nStatus.includes('CONFORME') || n8nStatus.includes('SUCCESS') || n8nStatus.includes('VALID')) {
                finalDocStatus = 'APROVADO';
            }
            else {
                // Treats everything else (REJEITADO, ERROR, FAILED, WARNING) as REJEITADO for strict binary outcome
                finalDocStatus = 'REJEITADO';
            }
            // Override: If n8n explicitly says ERROR or FALHA, maybe we keeps it as REJEITADO, but user said "only 2 statuses"
            // So we stick to 2.
            console.log(`[Analyze Debug] Mapped Status: ${n8nStatus} -> ${finalDocStatus}`);
            const result = { ...d, extracted_at: new Date().toISOString() };
            const fiscalFields = {
                tipo_movimento: d.classificacao_fiscal?.tipo_operacao || d.tipo_movimento || d.movement_type || 'INDETERMINADO',
                valor_iva: parseNum(totais.total_iva || totais.iva || math.total_iva || math.iva || 0),
                valor_documento: parseNum(totais.total_geral || totais.amount || math.total_recalculado || d.totalAmount || 0),
                status_fiscal: decisao.status_fiscal || decisao.status || d.status || 'VALIDADA',
                compliance_level: decisao.nivel_risco || decisao.risk_level || d.risk_level || 'BAIXO',
                valor_retencao: parseNum(totais.retencoes || totais.total_retencao || math.valor_retencao || 0),
                nif_emitente: emitente.nif || d.nif_emitente || 'N/A',
                valor_base: parseNum(totais.subtotal || totais.base_calculo || totais.base || 0)
            };
            console.log(`[Analyze Debug] Final Status for ${docId}: ${finalDocStatus}. Value: ${fiscalFields.valor_documento} NIF: ${fiscalFields.nif_emitente}`);
            // Update Document
            const updatedDoc = await this.update(docId, {
                status: finalDocStatus,
                analysisResult: result,
                rawResponse: n8nData,
                fiscalFields
            }, client);
            if (!updatedDoc) {
                console.error(`[Analyze] UPDATE failed for doc ${docId}. Check column names and constraints.`);
                throw new Error('Database UPDATE failed');
            }
            // Unified Dynamic Credit Deduction
            if (companyId && resolvedUserId) {
                try {
                    await subscriptionService.consumeAnalysisCredits(companyId, resolvedUserId, docId, client);
                }
                catch (creditError) {
                    console.error(`[Analyze Credit] Deduction failed for ${docId}: ${creditError.message}`);
                    await client.query('UPDATE documents SET status = \'ERROR\', raw_text = $1 WHERE id = $2', [`Erro de Crédito: ${creditError.message}`, docId]);
                    return { id: docId, status: 'ERROR', error: creditError.message };
                }
            }
            console.log(`[Analyze Success] Document ${docId} persistence completed.`);
            return updatedDoc;
        });
    }
}
// ROBUST NUMBER PARSER (Handles '32 900,00 Kz', '1.200,50', etc)
function parseNum(val) {
    if (!val)
        return 0;
    if (typeof val === 'number')
        return val;
    try {
        // 1. Convert to string and clean currency/text
        let str = String(val).replace(/[^\d.,-]/g, '').trim();
        // 2. Handle "32 900,00" -> Remove spaces (already done by regex above w/o \s), handle comma
        // The regex [^\d.,-] removes spaces. So "32 900,00" becomes "32900,00".
        // 3. Detect format: 
        // If comma is last separator, it's decimal. Replace dots with nothing, comma with dot.
        if (str.includes(',') && !str.includes('.')) {
            str = str.replace(',', '.');
        }
        else if (str.includes('.') && str.includes(',')) {
            // Mixed: "1.200,00" or "1,200.00"
            // If comma index > dot index -> "1.200,00" (EU)
            if (str.lastIndexOf(',') > str.lastIndexOf('.')) {
                str = str.replace(/\./g, '').replace(',', '.');
            }
            else {
                // "1,200.00" (US) -> Remove comma
                str = str.replace(/,/g, '');
            }
        }
        const parsed = parseFloat(str);
        return isNaN(parsed) ? 0 : parsed;
    }
    catch (e) {
        return 0;
    }
}
export const documentsService = new DocumentsService();
