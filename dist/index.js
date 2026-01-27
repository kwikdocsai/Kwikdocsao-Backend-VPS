import { runMigrations } from './migrations/01_create_users_table.js';
async function bootstrap() {
    console.log('Starting Authentication System...');
    try {
        await runMigrations();
        console.log('Authentication System is ready.');
        // Example Usage (can be called via MCP or Chat)
        // const newUser = await authController.handleRegister({ name: 'Admin', email: 'admin@kaizen.com', password: 'password123', role: 'admin' });
        // console.log('Admin registered:', newUser.email);
    }
    catch (err) {
        console.error('Failed to start Authentication System:', err);
        process.exit(1);
    }
}
bootstrap();
