#!/bin/bash
PBF_FILE="/data/data.osm.pbf"
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

log "Deleting unnecessary data..."
# Delete the planet_osm_roads table
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DROP TABLE IF EXISTS planet_osm_roads;"
# Delete the planet_osm_line table
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DROP TABLE IF EXISTS planet_osm_line;"
# Delete the planet_osm_polygon table
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "DROP TABLE IF EXISTS planet_osm_polygon;"
# Delete unrelated data from the planet_osm_point table
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "
DELETE FROM planet_osm_point
WHERE NOT (
  shop IN ('stationery', 'supermarket', 'department_store')
  OR amenity IN ('school', 'college')
);
"

# Run VACUUM to reclaim space
log "Running VACUUM to reclaim space..."
PGPASSWORD=$DB_PASSWORD psql -h $DB_HOST -U $DB_USER -d $DB_NAME -c "VACUUM FULL;"

log "Cleanup completed!"
