import bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';
dotenv.config();
const SALT_ROUNDS = parseInt(process.env.PASSWORD_SALT_ROUNDS || '12');
export async function hashPassword(password) {
    return await bcrypt.hash(password, SALT_ROUNDS);
}
export async function comparePassword(password, hash) {
    try {
        if (!hash || !hash.startsWith('$2'))
            return false;
        return await bcrypt.compare(password, hash);
    }
    catch (err) {
        console.error('Bcrypt comparison error:', err);
        return false;
    }
}
