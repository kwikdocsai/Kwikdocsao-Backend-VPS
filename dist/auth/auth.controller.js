import { authService } from './auth.service.js';
import { authenticate, authorize } from './auth.middleware.js';
export class AuthController {
    async handleRegister(args) {
        const { name, email, password, role } = args;
        return await authService.register(name, email, password, role);
    }
    async handleLogin(args) {
        const { email, password } = args;
        return await authService.login(email, password);
    }
    async handleListUsers(args, token) {
        const user = authenticate(token);
        authorize(user, ['admin']);
        return await authService.listUsers();
    }
    async handleDeactivateUser(args, token) {
        const user = authenticate(token);
        authorize(user, ['admin']);
        return await authService.deactivateUser(args.id);
    }
}
export const authController = new AuthController();
