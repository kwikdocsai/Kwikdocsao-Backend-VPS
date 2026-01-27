
import { executeQuery } from './database/postgres.client.js';

async function checkSchema() {
    try {
        console.log('Checking transactions table columns...');
        const res = await executeQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'transactions'");
        console.log('Columns in transactions:', res.rows.map(r => r.column_name));

        console.log('\nChecking plans table columns...');
        const resPlans = await executeQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'plans'");
        console.log('Columns in plans:', resPlans.rows.map(r => r.column_name));

        console.log('\nChecking users table columns...');
        const usersCols = await executeQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'users'");
        console.log('Columns in users:', usersCols.rows.map((r: any) => r.column_name));

        console.log('\nChecking user_sessions table exists...');
        const sessionsTable = await executeQuery("SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_name = 'user_sessions')");
        console.log('user_sessions table exists:', sessionsTable.rows[0].exists);

        if (sessionsTable.rows[0].exists) {
            const sessionsCols = await executeQuery("SELECT column_name FROM information_schema.columns WHERE table_name = 'user_sessions'");
            console.log('Columns in user_sessions:', sessionsCols.rows.map((r: any) => r.column_name));
        }

        process.exit(0);
    } catch (err) {
        console.error('Error checking schema:', err);
        process.exit(1);
    }
}

checkSchema();
