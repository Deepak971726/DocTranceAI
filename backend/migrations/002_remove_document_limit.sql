UPDATE subscriptions
SET usage_limits = usage_limits - 'documents'
WHERE usage_limits ? 'documents';
