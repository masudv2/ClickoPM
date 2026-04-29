-- Remove team identifier prefix from cycle names
UPDATE cycle
SET name = regexp_replace(name, '^[A-Z]+ - ', '')
WHERE name ~ '^[A-Z]+ - ';
