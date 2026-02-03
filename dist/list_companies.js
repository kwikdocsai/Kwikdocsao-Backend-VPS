import { executeQuery } from './database/postgres.client.js';
async function listCompanies() {
    try {
        const res = await executeQuery('SELECT id, name, nif FROM companies');
        console.log(JSON.stringify(res.rows, null, 2));
    }
    catch (err) {
        console.error(err);
    }
}
listCompanies();
