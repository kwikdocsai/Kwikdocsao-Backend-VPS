import { authService } from './auth/auth.service.js';
async function testMemberCreation() {
    const adminId = '3b2a3a2e-4457-4bbb-8840-8337ab9b48ed';
    const targetCompanyId = '1b5906af-6455-4137-86c5-b1844cb8dff8';
    console.log('🧪 Starting Simulation: Create Team Member');
    console.log(`Admin ID: ${adminId}`);
    console.log(`Company ID: ${targetCompanyId}`);
    try {
        console.log('Attempting to register keni@k.com...');
        // Match the signature: name, email, password, role, companyId, ownerId, mustChangePassword
        const member = await authService.register('vnvvn', 'keni@k.com', '12345', 'COLLABORATOR', targetCompanyId, adminId, true);
        console.log('✅ Success! Member created:', member);
    }
    catch (err) {
        console.error('❌ Failed:', err.message);
        if (err.stack)
            console.error(err.stack);
    }
    process.exit(0);
}
testMemberCreation();
