FROM postgis/postgis:17-3.5

# Install osm2pgsql for importing OSM data (import_data.sh)
RUN apt-get update && \
    apt-get install -y osm2pgsql osmium-tool dos2unix nano curl && \
    rm -rf /var/lib/apt/lists/*

# Copy the scripts into the container
COPY ./scripts /scripts

# Make the import_data.sh script executable
RUN dos2unix /scripts/import_data.sh && \
    chmod +x /scripts/import_data.sh && \
    dos2unix /scripts/download_data.sh && \
    chmod +x /scripts/download_data.sh
