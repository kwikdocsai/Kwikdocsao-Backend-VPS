import { authController } from './auth/auth.controller.js';
import { pool } from './database/postgres.client.js';
async function testAuthSystem() {
    console.log('🚀 Iniciando testes do Sistema de Autenticação...\n');
    try {
        // 1. Registrar um usuário Admin
        console.log('📝 Teste 1: Registrando usuário admin...');
        const newUser = await authController.handleRegister({
            name: 'Administrador',
            email: 'admin@kaizen.com',
            password: 'SenhaSegura123!',
            role: 'ADMIN'
        });
        console.log('✅ Usuário registrado:', newUser);
        // 2. Fazer Login
        console.log('\n🔐 Teste 2: Fazendo login...');
        const loginResult = await authController.handleLogin({
            email: 'admin@kaizen.com',
            password: 'SenhaSegura123!'
        });
        console.log('✅ Login bem-sucedido!');
        console.log('   Usuário:', loginResult.user);
        console.log('   Token JWT:', loginResult.token);
        // 3. Listar usuários (usando o token gerado)
        console.log('\n📋 Teste 3: Listando usuários (requer admin)...');
        const users = await authController.handleListUsers({}, loginResult.token);
        console.log('✅ Usuários encontrados:', users);
        console.log('\n🎉 Todos os testes passaram com sucesso!');
    }
    catch (err) {
        if (err.message === 'Email already registered') {
            console.log('ℹ️  Usuário já existe, tentando login...\n');
            // Tentar login com usuário existente
            const loginResult = await authController.handleLogin({
                email: 'admin@kaizen.com',
                password: 'SenhaSegura123!'
            });
            console.log('✅ Login bem-sucedido!');
            console.log('   Usuário:', loginResult.user);
            console.log('   Token JWT:', loginResult.token);
            // Listar usuários
            console.log('\n📋 Listando usuários...');
            const users = await authController.handleListUsers({}, loginResult.token);
            console.log('✅ Usuários encontrados:', users);
            console.log('\n🎉 Testes completados!');
        }
        else {
            console.error('❌ Erro:', err.message);
        }
    }
    finally {
        await pool.end();
        process.exit(0);
    }
}
testAuthSystem();
