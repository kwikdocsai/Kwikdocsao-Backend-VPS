import { authService } from './auth.service.js';
import { authenticate, authorize } from './auth.middleware.js';

export class AuthController {
    async handleRegister(args: any) {
        const { name, email, password, role } = args;
        return await authService.register(name, email, password, role);
    }

    async handleLogin(args: any) {
        const { email, password } = args;
        return await authService.login(email, password);
    }

    async handleListUsers(args: any, token?: string) {
        const user = authenticate(token);
        authorize(user, ['admin']);
        return await authService.listUsers();
    }

    async handleDeactivateUser(args: any, token?: string) {
        const user = authenticate(token);
        authorize(user, ['admin']);
        return await authService.deactivateUser(args.id);
    }
}

export const authController = new AuthController();
