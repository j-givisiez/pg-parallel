-- =================================================================
--  Setup Script for pg-parallel Examples
-- =================================================================
--  This script creates the necessary tables and seeds them with
--  sample data for the examples.
--
--  To run this script:
--  psql -U your_username -d your_database -f setup.sql
-- =================================================================

-- To make the script re-runnable, we drop existing objects
DROP TABLE IF EXISTS processed_reports;
DROP TABLE IF EXISTS raw_events;
DROP TABLE IF EXISTS users;

-- =================================================================
--  Table for Example 1: Basic Query
-- =================================================================
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) UNIQUE NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO users (name, email) VALUES
('Alice', 'alice@example.com'),
('Bob', 'bob@example.com'),
('Charlie', 'charlie@example.com'),
('Diana', 'diana@example.com'),
('Eve', 'eve@example.com');

-- =================================================================
--  Tables for Example 3: Mixed Workload (ETL)
-- =================================================================
CREATE TABLE raw_events (
  id SERIAL PRIMARY KEY,
  payload JSONB NOT NULL,
  processed BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

INSERT INTO raw_events (payload) VALUES
('{"type": "click", "user_id": 1, "target": "#button1"}'),
('{"type": "purchase", "user_id": 2, "product_id": 123, "amount": 99.99}'),
('{"type": "login", "user_id": 1}'),
('{"type": "comment", "user_id": 3, "text": "This is a great library!"}');

CREATE TABLE processed_reports (
  id SERIAL PRIMARY KEY,
  report_data JSONB NOT NULL,
  source_event_id INTEGER REFERENCES raw_events(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

\echo 'Database setup complete'
\echo 'Created tables: users, raw_events, processed_reports'
\echo 'Seeded tables with sample data' 