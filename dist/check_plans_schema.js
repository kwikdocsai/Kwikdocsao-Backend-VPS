import { executeQuery } from './database/postgres.client.js';
async function checkPlansSchemas() {
    try {
        console.log('Checking server_performance_plans table columns...');
        const resServer = await executeQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'server_performance_plans'");
        console.log('Columns in server_performance_plans:');
        resServer.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));
        console.log('\nChecking plans table columns...');
        const resPlans = await executeQuery("SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'plans'");
        console.log('Columns in plans:');
        resPlans.rows.forEach(r => console.log(`- ${r.column_name}: ${r.data_type}`));
        process.exit(0);
    }
    catch (err) {
        console.error('Error checking schemas:', err);
        process.exit(1);
    }
}
checkPlansSchemas();
