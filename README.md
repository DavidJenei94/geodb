# geodb
Project for geoinfo database course

## Setup:
- download data from overpassturbo with download_data.sh
- convert data to correct pbf format with osmium: `osmium cat -o data.osm.pbf data.osm` 
- import data to postgis db with import_data.sh
- (check data in terminal: `psql -h postgis -U osm -d gis -c "SELECT * FROM planet_osm_point"` - pwd: osm, exit with q)
