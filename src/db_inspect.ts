
import { executeQuery } from './database/postgres.client.js';

async function diagnose() {
    try {
        console.log("--- DIAGNOSING USERS ---");
        const users = await executeQuery('SELECT id, name, email, company_id, owner_id, role, is_active FROM users');
        console.log(`Total users found: ${users.rowCount}`);
        users.rows.forEach(u => {
            console.log(`- ${u.name} (${u.email}) | ID: ${u.id} | CID: ${u.company_id} | OID: ${u.owner_id} | Role: ${u.role}`);
        });

        console.log("\n--- DIAGNOSING COMPANIES ---");
        const companies = await executeQuery('SELECT id, name, owner_id FROM companies');
        console.log(`Total companies found: ${companies.rowCount}`);
        companies.rows.forEach(c => {
            console.log(`- ${c.name} | ID: ${c.id} | OID: ${c.owner_id}`);
        });

    } catch (err) {
        console.error("Diagnosis failed:", err);
    }
}

diagnose();
