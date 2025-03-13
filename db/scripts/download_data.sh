#!/bin/bash

# Define the query - changed output format to standard OSM XML
QUERY='[out:xml][timeout:25];
area["name"="Szeged"]["admin_level"="8"]->.searchArea;
(
  node["shop"="stationery"](area.searchArea);
  way["shop"="stationery"](area.searchArea);
  relation["shop"="stationery"](area.searchArea);
  
  node["shop"="books"](area.searchArea);
  way["shop"="books"](area.searchArea);
  relation["shop"="books"](area.searchArea);
  
  node["shop"="department_store"](area.searchArea);
  way["shop"="department_store"](area.searchArea);
  relation["shop"="department_store"](area.searchArea);
  
  node["shop"="supermarket"](area.searchArea);
  way["shop"="supermarket"](area.searchArea);
  relation["shop"="supermarket"](area.searchArea);

  node["amenity"="school"](area.searchArea);
  way["amenity"="school"](area.searchArea);
  relation["amenity"="school"](area.searchArea);

  node["amenity"="college"](area.searchArea);
  way["amenity"="college"](area.searchArea);
  relation["amenity"="college"](area.searchArea);

  node["amenity"="university"](area.searchArea);
  way["amenity"="university"](area.searchArea);
  relation["amenity"="university"](area.searchArea);
  
  way["highway"~"primary|secondary|tertiary"](area.searchArea);

  node["highway"="bus_stop"](area.searchArea);
  node["public_transport"="platform"](area.searchArea);
  node["railway"="tram_stop"](area.searchArea);
);
// Get complete ways with their nodes
(._;>;);
// Standard output format
out;'

# Send the request using curl
curl -k -X POST \
  -H "Accept: */*" \
  -H "Content-Type: application/x-www-form-urlencoded; charset=UTF-8" \
  -H "Origin: https://overpass-turbo.eu" \
  -H "Referer: https://overpass-turbo.eu/" \
  -H "User-Agent: Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36" \
  --data-urlencode "data=$QUERY" \
  -o ../data/data.osm \
  "https://overpass-api.de/api/interpreter"