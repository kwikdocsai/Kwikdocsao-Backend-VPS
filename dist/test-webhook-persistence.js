import { documentsService } from './services/documents.service.js';
import { executeQuery } from './database/postgres.client.js';
async function testPersistence() {
    console.log('🚀 Starting Persistence Test...');
    // 1. Find a document in PROCESSING state or create one
    let doc = (await executeQuery('SELECT * FROM documents WHERE status = \'PROCESSING\' LIMIT 1')).rows[0];
    if (!doc) {
        console.log('📝 No PROCESSING doc found. Creating dummy...');
        const res = await executeQuery(`INSERT INTO documents (id, company_id, uploaded_by, file_name, status, type) 
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`, ['test-doc-' + Date.now(), '67cd1301-9878-43f1-b3f4-123456789012', '76927a44-2f22-4913-9829-123456789012', 'test.png', 'PROCESSING', 'FACTURE']);
        doc = res.rows[0];
    }
    console.log(`🔍 Testing with Doc ID: ${doc.id} (Status: ${doc.status})`);
    const mockN8nData = {
        docId: doc.id,
        json: {
            decisao_final: {
                status: 'APROVADO',
                nivel_risco: 'BAIXO',
                status_fiscal: 'VALIDA'
            },
            totais: {
                total_geral: 1500,
                total_iva: 210
            },
            classificacao_fiscal: {
                tipo_operacao: 'VENDA'
            }
        }
    };
    try {
        console.log('⏳ Calling completeAnalysis...');
        const updated = await documentsService.completeAnalysis(doc.id, mockN8nData);
        console.log('✅ Update finished!');
        // Final verify
        const finalDoc = (await executeQuery('SELECT * FROM documents WHERE id = $1', [doc.id])).rows[0];
        console.log('📊 Final Status:', finalDoc.status);
        console.log('📊 Data assigned:', !!finalDoc.data);
        if (finalDoc.status === 'APROVADO') {
            console.log('🎉 SUCCESS: Database updated correctly!');
        }
        else {
            console.error('❌ FAILURE: Status is still', finalDoc.status);
        }
    }
    catch (e) {
        console.error('💥 ERROR during simulation:', e.message);
    }
}
testPersistence();
