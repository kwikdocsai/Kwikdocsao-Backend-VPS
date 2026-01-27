import { executeQuery } from '../database/postgres.client.js';

export class InvoicesService {
    async create(userId: string, customerName: string, customerNif?: string, currency = 'AOA') {
        const result = await executeQuery(
            `INSERT INTO invoices (user_id, customer_name, customer_nif, currency, status)
             VALUES ($1, $2, $3, $4, 'draft')
             RETURNING *`,
            [userId, customerName, customerNif, currency]
        );
        return result.rows[0];
    }

    async findByUser(userId: string) {
        const result = await executeQuery(
            `SELECT * FROM invoices WHERE user_id = $1 ORDER BY created_at DESC`,
            [userId]
        );
        return result.rows;
    }

    async findById(id: string) {
        const invoice = await executeQuery(`SELECT * FROM invoices WHERE id = $1`, [id]);
        const items = await executeQuery(`SELECT * FROM invoice_items WHERE invoice_id = $1`, [id]);
        return { ...invoice.rows[0], items: items.rows };
    }

    async addItem(invoiceId: string, description: string, quantity: number, unitPrice: number, taxRate = 0) {
        const total = quantity * unitPrice * (1 + taxRate / 100);
        const result = await executeQuery(
            `INSERT INTO invoice_items (invoice_id, description, quantity, unit_price, tax_rate, total)
             VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
            [invoiceId, description, quantity, unitPrice, taxRate, total]
        );
        await this.recalculateTotals(invoiceId);
        return result.rows[0];
    }

    async removeItem(itemId: string) {
        const item = await executeQuery(`SELECT invoice_id FROM invoice_items WHERE id = $1`, [itemId]);
        await executeQuery(`DELETE FROM invoice_items WHERE id = $1`, [itemId]);
        if (item.rows[0]) {
            await this.recalculateTotals(item.rows[0].invoice_id);
        }
        return { removed: true };
    }

    async recalculateTotals(invoiceId: string) {
        await executeQuery(`
            UPDATE invoices SET
                subtotal = COALESCE((SELECT SUM(quantity * unit_price) FROM invoice_items WHERE invoice_id = $1), 0),
                tax_total = COALESCE((SELECT SUM(quantity * unit_price * tax_rate / 100) FROM invoice_items WHERE invoice_id = $1), 0),
                total = COALESCE((SELECT SUM(total) FROM invoice_items WHERE invoice_id = $1), 0)
            WHERE id = $1
        `, [invoiceId]);
    }

    async issue(id: string) {
        const count = await executeQuery(`SELECT COUNT(*) FROM invoices WHERE user_id = (SELECT user_id FROM invoices WHERE id = $1)`, [id]);
        const invoiceNumber = `FT-${new Date().getFullYear()}-${String(parseInt(count.rows[0].count) + 1).padStart(6, '0')}`;

        const result = await executeQuery(
            `UPDATE invoices SET status = 'issued', invoice_number = $1, issued_at = CURRENT_TIMESTAMP
             WHERE id = $2 RETURNING *`,
            [invoiceNumber, id]
        );
        return result.rows[0];
    }

    async delete(id: string) {
        await executeQuery(`DELETE FROM invoices WHERE id = $1`, [id]);
        return { deleted: true };
    }
}

export const invoicesService = new InvoicesService();
