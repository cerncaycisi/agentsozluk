UPDATE "agent_credentials"
SET "scopes" = array_append("scopes", 'runtime:plan')
WHERE NOT ('runtime:plan' = ANY("scopes"));
