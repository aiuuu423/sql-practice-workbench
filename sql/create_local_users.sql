-- Template. Replace the named placeholders from environment variables at setup time.
CREATE USER IF NOT EXISTS 'sql_practice_runner'@'localhost'
  IDENTIFIED BY ':runner_password';
ALTER USER 'sql_practice_runner'@'localhost'
  IDENTIFIED BY ':runner_password';
GRANT SELECT ON sql_practice.* TO 'sql_practice_runner'@'localhost';

CREATE USER IF NOT EXISTS 'sql_practice_reset'@'localhost'
  IDENTIFIED BY ':reset_password';
ALTER USER 'sql_practice_reset'@'localhost'
  IDENTIFIED BY ':reset_password';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, DROP, ALTER, INDEX, REFERENCES
  ON sql_practice.* TO 'sql_practice_reset'@'localhost';

FLUSH PRIVILEGES;
