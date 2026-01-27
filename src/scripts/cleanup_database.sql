-- Database Cleanup Script
-- This will delete ALL data but keep table structures

-- Disable triggers temporarily for speed
SET session_replication_role = 'replica';

-- Delete in order respecting foreign key constraints
TRUNCATE TABLE faturix_audits CASCADE;
TRUNCATE TABLE audit_logs CASCADE;
TRUNCATE TABLE system_logs CASCADE;
TRUNCATE TABLE fiscal_entities CASCADE;
TRUNCATE TABLE documents CASCADE;
TRUNCATE TABLE credit_transactions CASCADE;
TRUNCATE TABLE companies CASCADE;
TRUNCATE TABLE users CASCADE;

-- Re-enable triggers
SET session_replication_role = 'origin';

-- Optional: Also clean ai_alerts if exists
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ai_alerts') THEN
        TRUNCATE TABLE ai_alerts CASCADE;
    END IF;
END $$;

SELECT 'Database cleaned successfully!' as status;
