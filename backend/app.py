from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
import geojson
import os

# Configuration
DB_HOST = os.getenv("POSTGRES_HOST", "postgis")
DB_NAME = os.getenv("POSTGRES_NAME", "gis")
DB_USER = os.getenv("POSTGRES_USER", "osm")
DB_PASSWORD = os.getenv("POSTGRES_PASSWORD", "osm")
PORT = os.getenv("SERVER_PORT", 8011)

app = FastAPI(title="GeoData API")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

# Database connection helper
def get_db_connection():
    conn = psycopg2.connect(
        host=DB_HOST,
        database=DB_NAME,
        user=DB_USER,
        password=DB_PASSWORD
    )
    conn.autocommit = True
    return conn

@app.get("/geodb/data")
async def get_points():
    """
    Get points of interest and roads as GeoJSON.
    """
    
    # Build query for points, polygons, and roads
    query = """
        -- Get points
        SELECT 
            osm_id, 
            name,
            ST_AsGeoJSON(ST_Transform(way, 4326)) as geom,
            amenity, 
            shop,
            highway,
            public_transport,
            railway,
            'node' as osm_type
        FROM planet_osm_point
        WHERE 
            shop IN ('stationery', 'supermarket')
            OR amenity IN ('school', 'college', 'university')
            OR highway = 'bus_stop'
            OR public_transport = 'platform'
            OR railway = 'tram_stop'
            
        UNION ALL
        
        -- Get polygons (convert to centroid points)
        SELECT 
            osm_id, 
            name,
            ST_AsGeoJSON(ST_Transform(ST_Centroid(way), 4326)) as geom,
            amenity,
            shop,
            highway,
            public_transport,
            railway,
            'way' as osm_type
        FROM planet_osm_polygon
        WHERE 
            shop IN ('stationery', 'supermarket')
            OR amenity IN ('school', 'college', 'university')
            OR highway = 'bus_stop'
            OR public_transport = 'platform'
            OR railway = 'tram_stop'
            
        UNION ALL
        
        -- Get roads (with their full geometry)
        SELECT 
            osm_id,
            name,
            ST_AsGeoJSON(ST_Transform(way, 4326)) as geom,
            NULL as amenity,
            NULL as shop,
            highway,
            NULL as public_transport,
            NULL as railway,
            'way' as osm_type
        FROM planet_osm_line
        WHERE 
            highway IN ('primary', 'secondary', 'tertiary')
    """
    
    # Limit results for performance
    query += " LIMIT 10000"
    
    # Connect to the database and execute the query
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
            
            # Format as GeoJSON
            features = []
            for row in rows:
                geom = row['geom']
                properties = {
                    'id': row['osm_id'],
                    'name': row['name'],
                    'amenity': row['amenity'],
                    'shop': row['shop'],
                    'highway': row['highway'],
                    'public_transport': row.get('public_transport'),
                    'railway': row.get('railway'), 
                }
                
                # Remove None values
                properties = {k: v for k, v in properties.items() if v is not None}
                
                # Parse the geometry JSON string
                geometry = geojson.loads(geom)
                
                features.append(geojson.Feature(geometry=geometry, properties=properties))
            
            feature_collection = geojson.FeatureCollection(features)
            return feature_collection
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/geodb/area")
async def get_area(area: str = Query(...)):
    """
    Get potential locations for new stationery shops based on:
    - Proximity to schools/colleges (5min walk)
    - Proximity to roads and stops (within 200m)
    - No existing stationery shops nearby (250m buffer)
    - Weighted by overlapping school service areas
    """
    
    query = """
        WITH 
        -- Use precomputed isochrones for schools instead of simple buffers
        school_buffers AS (
            SELECT 
                school_id as osm_id,
                way AS geom
            FROM school_isochrones
            WHERE range_seconds = 300
        ),
        
        -- Create road buffers (200m)
        road_buffers AS (
            SELECT 
                ST_Buffer(ST_Transform(way, 4326)::geography, 200)::geometry AS geom
            FROM planet_osm_line
            WHERE highway IN ('primary', 'secondary', 'tertiary')
        ),

        -- Create transport stop buffers (200m)
        transport_stop_buffers AS (
            SELECT 
                ST_Buffer(ST_Transform(way, 4326)::geography, 200)::geometry AS geom
            FROM planet_osm_point
            WHERE highway = 'bus_stop'
            OR public_transport = 'platform'
            OR railway = 'tram_stop'
        ),
        
        -- Create stationery shop buffers (250m)
        stationery_buffers AS (
            SELECT 
                ST_Buffer(ST_Transform(way, 4326)::geography, 250)::geometry AS geom
            FROM planet_osm_point
            WHERE shop IN ('stationery', 'supermarket')
            
            UNION ALL
            
            SELECT 
                ST_Buffer(ST_Transform(ST_Centroid(way), 4326)::geography, 250)::geometry AS geom
            FROM planet_osm_polygon
            WHERE shop IN ('stationery', 'supermarket')
        ),

        -- Merge all road and transport stop buffers into a single geometry
        merged_roads_and_stops AS (
            SELECT ST_Union(geom) AS geom FROM (
                SELECT geom FROM road_buffers
                UNION ALL
                SELECT geom FROM transport_stop_buffers
            ) AS combined
        
        -- Merge all stationery buffers into a single geometry
        merged_stationery AS (
            SELECT ST_Union(geom) AS geom FROM stationery_buffers
        ),
        
        -- Find areas of school buffers that intersect with roads and stops
        school_road_intersection AS (
            SELECT 
                s.osm_id,
                ST_Intersection(s.geom, r.geom) AS geom
            FROM school_buffers s, merged_roads_and_stops r
            WHERE ST_Intersects(s.geom, r.geom)
        ),
        
        -- Subtract stationery buffers from intersections
        good_areas AS (
            SELECT 
                src.osm_id,
                CASE 
                    WHEN st.geom IS NULL THEN src.geom
                    ELSE ST_Difference(src.geom, st.geom)
                END AS geom
            FROM school_road_intersection src
            LEFT JOIN merged_stationery st ON ST_Intersects(src.geom, st.geom)
        ),
        
        -- Calculate overlapping areas with merged weights
        overlap_analysis AS (
            -- Get the union of all polygon boundaries
            WITH boundaries AS (
                SELECT ST_Union(
                    ST_Boundary(geom)
                ) AS lines
                FROM good_areas
            ),
            -- Polygonize to get unique regions
            unique_regions AS (
                SELECT (ST_Dump(
                    ST_Polygonize(lines)
                )).geom AS geom
                FROM boundaries
            )
            -- Count how many original polygons contain each region's centroid
            SELECT 
                ur.geom,
                (
                    SELECT COUNT(*)
                    FROM good_areas ga
                    WHERE ST_Contains(ga.geom, ST_PointOnSurface(ur.geom))
                ) AS weight
            FROM unique_regions ur
            WHERE ST_Area(ur.geom) > 0
        )

        -- Final result - convert geometries to GeoJSON
        SELECT 
            ST_AsGeoJSON(geom) AS geom,
            weight
        FROM overlap_analysis
        WHERE ST_Area(geom) > 0
        ORDER BY weight DESC, ST_Area(geom) DESC
    """
    
    # Connect to the database and execute the query
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(query)
            rows = cur.fetchall()
            
            # Format as GeoJSON
            features = []
            for row in rows:
                geom = row['geom']
                weight = row['weight']
                
                # Parse the geometry JSON string
                geometry = geojson.loads(geom)
                
                features.append(geojson.Feature(
                    geometry=geometry, 
                    properties={'weight': weight}
                ))
            
            feature_collection = geojson.FeatureCollection(features)
            return feature_collection
    
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        if conn:
            conn.close()

@app.get("/geodb/")
async def read_root():
    # Server is running on port 8011
    return {"Server": "Running on port {PORT}"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=PORT, reload=True)
