CREATE DATABASE apptiming
  WITH OWNER = postgres
       ENCODING = 'UTF8'
       TABLESPACE = pg_default
       LC_COLLATE = 'Greek_Greece.1253'
       LC_CTYPE = 'Greek_Greece.1253'
       CONNECTION LIMIT = -1;

CREATE TABLE users
(
  user_id serial NOT NULL,
  username text,
  password text,
  api_key text,
  default_app_id integer,
  CONSTRAINT users_pkey PRIMARY KEY (user_id)
)
WITH (OIDS=FALSE);
ALTER TABLE users OWNER TO postgres;

CREATE TABLE apps
(
  app_id serial NOT NULL,
  name text,
  api_key text,
  CONSTRAINT apps_pkey PRIMARY KEY (app_id)
)
WITH (OIDS=FALSE);
ALTER TABLE apps OWNER TO postgres;

CREATE TABLE timings
(
  app_id integer NOT NULL,
  unit_name text NOT NULL,
  key text NOT NULL,
  start_time timestamp without time zone NOT NULL,
  end_time timestamp without time zone,
  CONSTRAINT items_pkey PRIMARY KEY (app_id, unit_name, key)
)
WITH (OIDS=FALSE);
ALTER TABLE timings OWNER TO postgres;


INSERT INTO apps(name, api_key) VALUES
('shipping','80085'),
('testsspi','31305');