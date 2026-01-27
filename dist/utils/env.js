import * as dotenv from 'dotenv';
dotenv.config();
export const isProduction = process.env.NODE_ENV === 'production';
export const config = {
    PORT: parseInt(process.env.AUTH_API_PORT || '3001'),
    DATABASE_URL: process.env.DATABASE_URL,
    JWT_SECRET: process.env.JWT_SECRET,
    NODE_ENV: process.env.NODE_ENV || 'development',
};
export function validateEnv() {
    console.log('\n--- ENVIRONMENT DIAGNOSIS ---');
    console.log(`NODE_ENV: ${config.NODE_ENV}`);
    console.log(`IS_PRODUCTION: ${isProduction}`);
    console.log(`PORT: ${config.PORT}`);
    console.log(`DATABASE_URL: ${config.DATABASE_URL ? 'PRESENT (HIDDEN)' : 'MISSING'}`);
    console.log(`JWT_SECRET: ${config.JWT_SECRET ? 'PRESENT (HIDDEN)' : 'MISSING'}`);
    const missing = [];
    if (!config.DATABASE_URL)
        missing.push('DATABASE_URL');
    if (!config.JWT_SECRET)
        missing.push('JWT_SECRET');
    if (missing.length > 0) {
        console.error(`❌ CRITICAL: Missing environment variables: ${missing.join(', ')}`);
        if (isProduction) {
            console.error('❌ SHUTTING DOWN: Required variables missing in production mode.');
            // We'll let the caller decide if it wants to exit
        }
    }
    else {
        console.log('✅ All critical environment variables are present.');
    }
    console.log('-----------------------------\n');
    return missing.length === 0;
}
