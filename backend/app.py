from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import psycopg2
import psycopg2.extras
from typing import Optional
import geojson
import os

# Configuration
DB_HOST = os.getenv("DB_HOST", "postgis")
DB_NAME = os.getenv("DB_NAME", "gis")
DB_USER = os.getenv("DB_USER", "osm")
DB_PASSWORD = os.getenv("DB_PASSWORD", "osm")
PORT = os.getenv("PORT", 8011)

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

@app.get("/geodb/points")
async def get_points(
    type: Optional[str] = Query(None, description="Point type (shop or amenity)"),
    value: Optional[str] = Query(None, description="Value of the type (e.g., 'supermarket', 'school')")
):
    """
    Get points of interest as GeoJSON.
    
    Only returns data for:
    - shop IN ('stationery', 'supermarket', 'department_store')
    - OR amenity IN ('school', 'college')
    """
    
    # Build query based on parameters
# Build query for points and polygons
    query = """
        -- Get points
        SELECT 
            osm_id, 
            name,
            ST_AsGeoJSON(ST_Transform(way, 4326)) as geom,
            amenity, 
            shop,
            'node' as osm_type
        FROM planet_osm_point
        WHERE 
            shop IN ('stationery', 'supermarket', 'department_store')
            OR amenity IN ('school', 'college')
            
        UNION ALL
        
        -- Get polygons (convert to centroid points)
        SELECT 
            osm_id, 
            name,
            ST_AsGeoJSON(ST_Transform(ST_Centroid(way), 4326)) as geom,
            amenity,
            shop,
            'way' as osm_type
        FROM planet_osm_polygon
        WHERE 
            shop IN ('stationery', 'supermarket', 'department_store')
            OR amenity IN ('school', 'college')
    """
    
    params = []
    
    # Add filtering if provided
    if type and value:
        if type not in ["shop", "amenity"]:
            raise HTTPException(status_code=400, detail="Type must be 'shop' or 'amenity'")
        
        allowed_values = {
            "shop": ["stationery", "supermarket", "department_store"],
            "amenity": ["school", "college"]
        }
        
        if value not in allowed_values.get(type, []):
            raise HTTPException(status_code=400, 
                detail=f"Value '{value}' not allowed for type '{type}'. Allowed values: {allowed_values.get(type)}")
        
        query += f" AND {type} = %s"
        params.append(value)
    
    # Limit results for performance
    query += " LIMIT 1000"
    
    # Connect to the database and execute the query
    try:
        conn = get_db_connection()
        with conn.cursor(cursor_factory=psycopg2.extras.DictCursor) as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            
            # Format as GeoJSON
            features = []
            for row in rows:
                geom = row['geom']
                properties = {
                    'id': row['osm_id'],
                    'name': row['name'],
                    'amenity': row['amenity'],
                    'shop': row['shop']
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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("app:app", host="0.0.0.0", port=8011, reload=True)
