
import { executeQuery } from './database/postgres.client.js';

async function checkUsers() {
    try {
        console.log('Checking users...');
        const res = await executeQuery("SELECT id, name, email FROM users LIMIT 5");
        console.log('Users:');
        res.rows.forEach(r => console.log(`- [${r.id}] ${r.name} (${r.email})`));

        process.exit(0);
    } catch (err) {
        console.error('Error checking users:', err);
        process.exit(1);
    }
}

checkUsers();
