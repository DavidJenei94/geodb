#!/bin/bash
PBF_FILE="/data/data.osm"
DB_NAME="gis"
DB_USER="osm"
DB_PASSWORD="osm"
DB_HOST="postgis"

# Function to log messages with date and time
log() {
  echo "$(date '+%Y-%m-%d %H:%M:%S') $1"
}

# Wait for PostGIS to be ready
until pg_isready -h $DB_HOST -U $DB_USER; do
  log "Waiting for database..."
  sleep 2
done

# Optimize PostgreSQL settings for import
# https://osm2pgsql.org/doc/manual.html
log "Optimizing PostgreSQL settings..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET shared_buffers = '1GB';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET work_mem = '50MB';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET maintenance_work_mem = '10GB';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET autovacuum_work_mem = '2GB';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET wal_level = 'minimal';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET checkpoint_timeout = '60min';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET max_wal_size = '10GB';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET checkpoint_completion_target = '0.9';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET max_wal_senders = '0';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET random_page_cost = '1.0';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET synchronous_commit = 'off';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET full_page_writes = 'off';"
log "Reloading PostgreSQL configuration..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT pg_reload_conf();"

# Enable necessary extensions
log "Enabling extensions..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS hstore;"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "CREATE EXTENSION IF NOT EXISTS postgis;"


# Creating database
# --cahce minimum of pbf size or 75% of RAM. (only in slim mode)
# --number-processes 4 (https://osm2pgsql.org/doc/manual.html#parallel-processing - Past 8 threads, the speed gain is minimal)
log "Importing OSM data..."
PGPASSWORD=$DB_PASSWORD osm2pgsql --create --slim --drop --cache 4000 --number-processes 4 \
  -d $DB_NAME -U $DB_USER -H $DB_HOST --hstore $PBF_FILE

# Restore safety settings after import
log "Restoring PostgreSQL safety settings..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET synchronous_commit = 'on';"
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "ALTER SYSTEM SET full_page_writes = 'on';"
log "Reloading PostgreSQL configuration..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "SELECT pg_reload_conf();"

log "OSM Import and Indexing Completed!"
