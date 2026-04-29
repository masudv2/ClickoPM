-- Prefix existing cycle names with their team identifier
UPDATE cycle
SET name = t.identifier || ' - ' || cycle.name
FROM team t
WHERE cycle.team_id = t.id
  AND cycle.name NOT LIKE t.identifier || ' - %';
