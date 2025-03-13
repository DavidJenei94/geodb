/**
 * GeoData Visualization Application
 *
 * This script handles the interactive map visualization of geographical data
 * including points of interest (schools, shops), roads, and potential
 * locations for new stationery shops based on various criteria.
 */

// Configuration variables
const isProduction = false; // Toggle between production and development environments
const URL_BASE = isProduction
  ? 'https://api.warpaintvision.com' // Production API endpoint
  : 'http://localhost:8011'; // Development API endpoint

// Global state variables
let weightFilterValue = 1; // Minimum weight value for filtering area polygons
let areaData = null; // Stores the fetched area data for filtering

// Map initialization
let map = L.map('map').setView([46.253, 20.1414], 13); // Center on Szeged, Hungary
let mode = 'tiles'; // Default map mode
let layers = []; // Stores fetched GeoJSON features
let tileLayer; // Variable for custom tile layers if needed
// Initialize OpenStreetMap base layer
let osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }
).addTo(map);

/**
 * Fetches points of interest and roads data from the server
 * and renders them on the map
 */
function getData() {
  fetch(`${URL_BASE}/geodb/data`)
    .then((response) => response.json())
    .then((data) => {
      layers = data; // Store the fetched data
      console.log(layers);
      renderLayers(); // Render the data on the map
    })
    .catch((error) => {
      console.error('Error fetching data:', error);
    });
}

/**
 * Renders GeoJSON features (POIs and roads) on the map with
 * custom styling and popups
 */
function renderLayers() {
  // Clear any existing layers first for a clean render
  if (window.featureLayer) {
    map.removeLayer(window.featureLayer);
  }

  // Create a GeoJSON layer with custom styling and popups
  window.featureLayer = L.geoJSON(layers, {
    // Custom styling for line features (roads)
    style: function (feature) {
      if (
        feature.geometry.type === 'LineString' ||
        feature.geometry.type === 'MultiLineString'
      ) {
        return {
          weight: getWeightForRoad(feature), // Line thickness based on road type
          color: getColorForRoad(feature), // Color based on road type
          opacity: 0.7,
        };
      }
    },
    // Custom marker styling for point features (POIs)
    pointToLayer: function (feature, latlng) {
      if (feature.geometry.type === 'Point') {
        let markerOptions = {
          radius: 8,
          fillColor: getColorForFeature(feature), // Color based on POI type
          color: '#000',
          weight: 1,
          opacity: 1,
          fillOpacity: 0.8,
        };

        return L.circleMarker(latlng, markerOptions);
      }
    },
    // Create custom popups for each feature
    onEachFeature: function (feature, layer) {
      let popupContent;

      // Different popup content for roads vs POIs
      if (feature.properties.highway) {
        // Popup content for roads
        popupContent = `
          <div class="popup-content">
            <h3>${feature.properties.name || 'Unnamed Road'}</h3>
            <ul>
              <li><strong>Road Type:</strong> ${feature.properties.highway}</li>
              <li><strong>ID:</strong> ${feature.properties.id}</li>
            </ul>
          </div>
        `;
      } else {
        // Popup content for POIs (schools, shops, etc.)
        popupContent = `
          <div class="popup-content">
            <h3>${feature.properties.name || 'Unnamed'}</h3>
            <ul>
              <li><strong>Type:</strong> ${
                feature.properties.shop ||
                feature.properties.amenity ||
                'Unknown'
              }</li>
              <li><strong>ID:</strong> ${feature.properties.id}</li>
            </ul>
          </div>
        `;
      }

      layer.bindPopup(popupContent);
    },
  }).addTo(map);
}

/**
 * Determines the color of road lines based on road type/importance
 * @param {Object} feature - GeoJSON feature representing a road
 * @returns {string} - Hex color code for the road
 */
function getColorForRoad(feature) {
  const highway = feature.properties.highway;

  if (highway === 'primary') return '#ff0000'; // Primary roads: red
  if (highway === 'secondary') return '#ff4400'; // Secondary roads: orange-red
  if (highway === 'tertiary') return '#ff6600'; // Tertiary roads: orange

  return '#aaaaaa'; // Default color: gray
}

/**
 * Determines the line thickness of roads based on road type/importance
 * @param {Object} feature - GeoJSON feature representing a road
 * @returns {number} - Line thickness value
 */
function getWeightForRoad(feature) {
  const highway = feature.properties.highway;

  if (highway === 'primary') return 4; // Primary roads: thickest
  if (highway === 'secondary') return 3; // Secondary roads: medium
  if (highway === 'tertiary') return 2; // Tertiary roads: thinner

  return 2; // Default weight
}

/**
 * Determines marker color for point features based on their type
 * @param {Object} feature - GeoJSON feature representing a POI
 * @returns {string} - Hex color code for the marker
 */
function getColorForFeature(feature) {
  const props = feature.properties;

  if (props.shop === 'supermarket') return '#3388ff'; // Blue
  if (props.shop === 'stationery') return '#33cc33'; // Green
  if (props.shop === 'books') return '#ff9900'; // Orange
  if (props.shop === 'department_store') return '#9933ff'; // Purple
  if (props.amenity === 'school') return '#ff3333'; // Red
  if (props.amenity === 'college') return '#ff66b2'; // Pink
  if (props.amenity === 'university') return '#ff66b2'; // Pink

  return '#888888'; // Default color: gray - for stops
}

// Variable to store the rendered area layer for potential shop locations
let areaLayer;

/**
 * Updates the weight filter threshold and re-renders area visualizations
 * @param {string|number} value - New weight filter value
 */
function updateWeightFilter(value) {
  weightFilterValue = parseInt(value);
  document.getElementById('weightValue').textContent = value;

  // Re-render areas with the new filter if we have data
  if (areaData) {
    renderAreas(areaData);
  }
}

/**
 * Fetches and displays potential stationery shop locations
 * Areas are weighted by factors like proximity to schools and roads,
 * and absence of competing shops
 */
function showArea() {
  fetch(`${URL_BASE}/geodb/area?area=szeged`)
    .then((response) => response.json())
    .then((data) => {
      console.log('Area data:', data);
      areaData = data; // Store the data for filtering
      renderAreas(data);
    })
    .catch((error) => {
      console.error('Error fetching area data:', error);
    });
}

/**
 * Renders potential stationery shop locations as polygons on the map
 * with custom styling based on their weights
 * @param {Object} areaData - GeoJSON data for potential shop locations
 */
function renderAreas(areaData) {
  // Remove existing area layer if it exists
  if (areaLayer) {
    map.removeLayer(areaLayer);
  }

  // Create new GeoJSON layer for areas
  areaLayer = L.geoJSON(areaData, {
    // Filter out areas with weight below the threshold
    filter: function (feature) {
      return feature.properties.weight >= weightFilterValue;
    },
    // Style polygons based on their weight values
    style: function (feature) {
      const weight = feature.properties.weight;

      // Higher weights are more opaque
      const opacity = Math.min(0.2 + weight * 0.1, 0.8);

      // Color coding based on weight ranges
      let fillColor = '#ff7800'; // Default: orange
      if (weight >= 5) {
        fillColor = '#7700AA'; // Very high weight: purple
      } else if (weight >= 4) {
        fillColor = '#0022AA'; // High weight: blue
      } else if (weight >= 3) {
        fillColor = '#007888'; // Medium weight: teal
      }

      return {
        fillColor: fillColor,
        weight: 1,
        opacity: 0.7,
        color: '#333',
        fillOpacity: opacity,
      };
    },
    // Add informative popups to each area
    onEachFeature: function (feature, layer) {
      layer.bindPopup(`
        <div class="popup-content">
          <h3>Potential Stationery Location</h3>
          <p><strong>Overlap Weight:</strong> ${feature.properties.weight}</p>
          <p>Higher weight indicates more overlapping school areas without stationery stores nearby.</p>
        </div>
      `);
    },
  }).addTo(map);

  // Auto-fit map to the area bounds - disabled to prevent disorientation
  // if (areaLayer.getBounds().isValid()) {
  //   map.fitBounds(areaLayer.getBounds());
  // }
}

/**
 * Removes all data layers from the map and resets the application state
 */
function clearMap() {
  // Remove feature layer if it exists
  if (window.featureLayer) {
    map.removeLayer(window.featureLayer);
  }

  // Remove area layer if it exists
  if (areaLayer) {
    map.removeLayer(areaLayer);
  }

  // Reset stored data
  layers = [];
  areaData = null;
}

// Automatic data loading on page load - disabled for manual control
// document.addEventListener('DOMContentLoaded', getData);
