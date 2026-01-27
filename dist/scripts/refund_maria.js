import { executeQuery } from '../database/postgres.client.js';
async function refund() {
    try {
        console.log("Refunding Maria...");
        // Using the executeQuery from the client which should handle pool connection
        const res = await executeQuery("SELECT id, name, email FROM users WHERE name ILIKE '%Maria%' LIMIT 1", []);
        if (res.rowCount === 0) {
            console.log("User Maria not found.");
            process.exit(0);
        }
        const user = res.rows[0];
        console.log(`Refund target: ${user.name} (${user.email})`);
        await executeQuery("UPDATE users SET credits = credits + 40 WHERE id = $1", [user.id]);
        console.log("Refunded 40 credits to " + user.name);
        process.exit(0);
    }
    catch (e) {
        console.error(e);
        process.exit(1);
    }
}
refund();
