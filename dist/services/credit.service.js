import { executeQuery } from '../database/postgres.client.js';
/**
 * Busca todos os pacotes de créditos ativos da base de dados
 * Ordenados por preço (ascendente)
 */
export async function getActiveCreditPackages() {
    const query = `
        SELECT 
            id,
            name,
            credits,
            price,
            bonus_credits,
            is_active,
            color,
            description
        FROM credit_packages
        WHERE is_active = true
        ORDER BY price ASC
    `;
    const result = await executeQuery(query);
    return result.rows;
}
/**
 * Busca um pacote de créditos específico por ID
 */
export async function getCreditPackageById(packageId) {
    const query = `
        SELECT 
            id,
            name,
            credits,
            price,
            bonus_credits,
            is_active,
            color,
            description
        FROM credit_packages
        WHERE id = $1 AND is_active = true
    `;
    const result = await executeQuery(query, [packageId]);
    return result.rows[0] || null;
}
