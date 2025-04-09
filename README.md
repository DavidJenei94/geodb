# geodb
Project for geoinfo database course

## Setup:
- simply: `docker exec postgis bash -c "mkdir -p /data && /scripts/download_data.sh && osmium cat -o /data/data.osm.pbf /data/data.osm --overwrite && /scripts/import_data.sh"`
or:
- download data from overpassturbo with download_data.sh
- convert data to correct pbf format with osmium: `osmium cat -o data.osm.pbf data.osm` 
- import data to postgis db with import_data.sh
- (check data in terminal: `psql -h postgis -U osm -d gis -c "SELECT * FROM planet_osm_point"` - pwd: osm, exit with q)

## Isochrone setup
- `docker exec -it geodb-backend bash -c "python getSchoolRange.py"`

## Rebuild docker containers:
- `docker build -t davidjenei94/geodb-backend -f backend/Dockerfile ./backend`
- `docker push davidjenei94/geodb-backend`
- `docker build -t davidjenei94/geodb-postgis -f db/Dockerfile ./db`
- `docker push davidjenei94/geodb-postgis`
- rebuild on server: `docker compose pull geodb-backend geodb-postgis` AND `docker compose up --build -d`

# Copy docker-compose.yml file to remote server
`scp path_to_file\docker-compose.prod.yml user@server_ip:absolute_path/docker-compose.yml`

# Copy frontend folder contents to remote server dist directory
`scp -r path_to_file\frontend\* user@server_ip:absolute_path/`
