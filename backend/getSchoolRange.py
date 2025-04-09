import os
import requests
import psycopg2
import psycopg2.extras
import json
import time

# Database configuration
DB_HOST = os.getenv("POSTGRES_HOST", "postgis")
DB_NAME = os.getenv("POSTGRES_DB", "gis")
DB_USER = os.getenv("POSTGRES_USER", "osm")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "osm")

# ORS API configuration
ORS_API_KEY = os.getenv("ORS_API_KEY")
ORS_ISOCHRONES_URL = "https://api.openrouteservice.org/v2/isochrones/foot-walking"
ORS_MAX_LOCATIONS_PER_REQUEST = 2  # ORS has a limit on locations per request

# Establish database connection
def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    conn.autocommit = True
    return conn

# Create isochrones table if it doesn't exist
def create_isochrones_table(conn):
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS school_isochrones (
                id SERIAL PRIMARY KEY,
                school_id BIGINT,
                school_name TEXT,
                range_seconds INT,
                way GEOMETRY(POLYGON, 4326),
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                UNIQUE(school_id, range_seconds)
            );
            
            -- Add index on school_id for faster lookups
            CREATE INDEX IF NOT EXISTS idx_school_isochrones_school_id 
            ON school_isochrones(school_id);
            
            -- Add spatial index
            CREATE INDEX IF NOT EXISTS idx_school_isochrones_way 
            ON school_isochrones USING GIST(way);
        """)
        conn.commit()

# Get school locations from the database
def get_school_locations(conn):
    with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
        cur.execute("""
            -- Get point schools
            SELECT 
                osm_id, 
                name,
                ST_X(ST_Transform(way, 4326)) as lon,
                ST_Y(ST_Transform(way, 4326)) as lat
            FROM planet_osm_point
            WHERE amenity IN ('school', 'college', 'university')
            
            UNION ALL
            
            -- Get polygon schools (using centroids)
            SELECT 
                osm_id, 
                name,
                ST_X(ST_Transform(ST_Centroid(way), 4326)) as lon,
                ST_Y(ST_Transform(ST_Centroid(way), 4326)) as lat
            FROM planet_osm_polygon
            WHERE amenity IN ('school', 'college', 'university')
        """)
        return cur.fetchall()

# Call ORS API to get isochrones for walking
def get_isochrones(locations, range_seconds=300):
    headers = {
        'Accept': 'application/json, application/geo+json, application/gpx+xml, img/png; charset=utf-8',
        'Authorization': ORS_API_KEY,
        'Content-Type': 'application/json; charset=utf-8'
    }
    
    # Format locations for ORS API - they expect [lon, lat] order
    location_pairs = [[loc['lon'], loc['lat']] for loc in locations]
    
    body = {
        "locations": location_pairs,
        "range": [range_seconds]
    }
    
    try:
        response = requests.post(ORS_ISOCHRONES_URL, json=body, headers=headers)
        
        if response.status_code == 429:  # Too Many Requests
            print("Rate limit exceeded. Waiting before retrying...")
            time.sleep(60)  # Wait a minute before retrying
            return get_isochrones(locations, range_seconds)
        
        if response.status_code != 200:
            print(f"API call failed: {response.status_code}, {response.reason}")
            print(response.text)
            return None
        
        return response.json()
    except Exception as e:
        print(f"Request error: {str(e)}")
        return None

# Insert isochrone data into the database
def insert_isochrones(conn, school_data, isochrone_data, range_seconds):
    if not isochrone_data or 'features' not in isochrone_data:
        return 0
    
    count = 0
    with conn.cursor() as cur:
        for i, feature in enumerate(isochrone_data['features']):
            if i >= len(school_data):
                break
                
            school = school_data[i]
            geometry = json.dumps(feature['geometry'])
            
            try:
                cur.execute("""
                    INSERT INTO school_isochrones (school_id, school_name, range_seconds, way)
                    VALUES (%s, %s, %s, ST_GeomFromGeoJSON(%s))
                    ON CONFLICT (school_id, range_seconds) DO UPDATE 
                    SET way = ST_GeomFromGeoJSON(%s), 
                        created_at = CURRENT_TIMESTAMP
                """, (
                    school['osm_id'],
                    school['name'],
                    range_seconds,
                    geometry,
                    geometry
                ))
                count += 1
            except Exception as e:
                print(f"Error inserting isochrone for school {school['osm_id']}: {str(e)}")
        
        conn.commit()
    return count

# Main function
def main():
    conn = get_db_connection()
    range_seconds = 300  # 5-minute walking distance
    
    try:
        # Create table if not exists
        create_isochrones_table(conn)
        
        # Get all school locations
        schools = get_school_locations(conn)
        print(f"Found {len(schools)} schools")
        
        if not schools:
            print("No schools found. Exiting.")
            return
        
        # Process in batches to respect API limits
        batch_size = ORS_MAX_LOCATIONS_PER_REQUEST
        total_processed = 0
        
        for i in range(0, len(schools), batch_size):
            batch = schools[i:i+batch_size]
            print(f"Processing batch {i//batch_size + 1}/{(len(schools) + batch_size - 1)//batch_size}")
            
            # Call ORS API
            isochrone_data = get_isochrones(batch, range_seconds)
            if isochrone_data:
                # Insert results into database
                inserted = insert_isochrones(conn, batch, isochrone_data, range_seconds)
                total_processed += inserted
                print(f"Inserted {inserted} isochrones in this batch")
            
            # Be nice to the API with some rate limiting
            if i + batch_size < len(schools):
                print("Waiting before next batch...")
                time.sleep(2)
        
        print(f"All done! Processed {total_processed} schools.")
        
    except Exception as e:
        print(f"Error: {str(e)}")
    finally:
        conn.close()

if __name__ == "__main__":
    main()