-- One Postgres server, one database per service (a service never reads another service's tables).
-- Tables are created by each service itself on start-up (idempotent migrations).
CREATE DATABASE auth_db;
CREATE DATABASE stats_db;
