
import { authService } from './auth/auth.service.js';

async function testLogin() {
    try {
        console.log('Testing login for admin@kwikdocs.ao...');
        const result = await authService.login('admin@kwikdocs.ao', 'Admin123@2025'); // Assuming default creds or I will ask user
        console.log('Login successful:', result.user.email);
    } catch (err: any) {
        console.error('Login failed:', err.message);
    }
}

testLogin();
