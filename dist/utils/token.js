import jwt from 'jsonwebtoken';
import * as dotenv from 'dotenv';
dotenv.config();
const IS_PROD = process.env.NODE_ENV === 'production';
if (!process.env.JWT_SECRET) {
    if (IS_PROD) {
        console.error('❌ FATAL SECURITY ERROR: JWT_SECRET environment variable is missing in PRODUCTION!');
        process.exit(1);
    }
    else {
        console.warn('⚠️ WARNING: JWT_SECRET is missing. App will fail to sign tokens.');
    }
}
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET)
    throw new Error('JWT_SECRET must be defined');
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';
export function generateToken(payload) {
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
}
export function verifyToken(token) {
    try {
        return jwt.verify(token, JWT_SECRET);
    }
    catch (err) {
        return null;
    }
}
