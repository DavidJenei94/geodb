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
 * Shows loading spinner for a button
 * @param {string} buttonId - ID of the button to show loading state
 */
function showLoading(buttonId) {
  const button = document.getElementById(buttonId);
  button.classList.add('loading');
  button.disabled = true;
  button.classList.remove('success');
}

/**
 * Hides loading spinner for a button
 * @param {string} buttonId - ID of the button to hide loading state
 * @param {boolean} success - Indicates if the operation was successful
 */
function hideLoading(buttonId, success) {
  const button = document.getElementById(buttonId);
  button.classList.remove('loading');
  button.disabled = false;
  if (success) {
    button.classList.add('success');
  } else {
    button.classList.remove('success');
  }
}

// Layer visibility control
let layerVisibility = {
  schools: false,
  stationery: false,
  supermarkets: false,
  stops: false,
  roads: false,
};

// Setup layer control event listeners
document.addEventListener('DOMContentLoaded', function () {
  // Attach listeners to checkboxes
  document
    .getElementById('show-schools')
    .addEventListener('change', function () {
      layerVisibility.schools = this.checked;
      if (layers && layers.features) renderLayers();
    });

  document
    .getElementById('show-stationery')
    .addEventListener('change', function () {
      layerVisibility.stationery = this.checked;
      if (layers && layers.features) renderLayers();
    });

  document
    .getElementById('show-supermarkets')
    .addEventListener('change', function () {
      layerVisibility.supermarkets = this.checked;
      if (layers && layers.features) renderLayers();
    });

  document.getElementById('show-stops').addEventListener('change', function () {
    layerVisibility.stops = this.checked;
    if (layers && layers.features) renderLayers();
  });

  document.getElementById('show-roads').addEventListener('change', function () {
    layerVisibility.roads = this.checked;
    if (layers && layers.features) renderLayers();
  });
});

/**
 * Fetches points of interest and roads data from the server
 * and renders them on the map
 */
function getData() {
  showLoading('getData');
  fetch(`${URL_BASE}/geodb/data`)
    .then((response) => response.json())
    .then((data) => {
      layers = data; // Store the fetched data
      console.log(layers);
      renderLayers(); // Render the data on the map
      hideLoading('getData', true);
    })
    .catch((error) => {
      console.error('Error fetching data:', error);
      hideLoading('getData', false);
      alert('Hiba történt az adatok betöltése közben.');
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

  if (window.roadLayer) {
    map.removeLayer(window.roadLayer);
  }

  if (window.pointLayer) {
    map.removeLayer(window.pointLayer);
  }

  // Check if layers is a GeoJSON FeatureCollection
  if (!layers || !layers.features) {
    console.error('Invalid layer data structure');
    return;
  }

  // Separate road features and point features
  const roadFeatures = {
    type: 'FeatureCollection',
    features: layers.features.filter((feature) => {
      // Only include roads that should be visible
      if (
        (feature.geometry.type === 'LineString' ||
          feature.geometry.type === 'MultiLineString') &&
        layerVisibility.roads
      ) {
        return true;
      }
      return false;
    }),
  };

  const pointFeatures = {
    type: 'FeatureCollection',
    features: layers.features.filter((feature) => {
      // Skip road features
      if (
        feature.geometry.type === 'LineString' ||
        feature.geometry.type === 'MultiLineString'
      ) {
        return false;
      }

      const props = feature.properties;

      // Transport stops
      if (
        props.highway === 'bus_stop' ||
        props.public_transport === 'platform' ||
        props.railway === 'tram_stop'
      ) {
        return layerVisibility.stops;
      }

      // Educational institutions
      if (
        props.amenity === 'school' ||
        props.amenity === 'college' ||
        props.amenity === 'university'
      ) {
        return layerVisibility.schools;
      }

      // Stationery shops
      if (props.shop === 'stationery' || props.shop === 'books') {
        return layerVisibility.stationery;
      }

      // Supermarkets
      if (props.shop === 'supermarket') {
        return layerVisibility.supermarkets;
      }

      // Default: show if not categorized
      return true;
    }),
  };

  // Create road layer FIRST (so it's on the bottom)
  window.roadLayer = L.geoJSON(roadFeatures, {
    style: function (feature) {
      return {
        weight: getWeightForRoad(feature),
        color: getColorForRoad(feature),
        opacity: 0.7,
      };
    },
    onEachFeature: function (feature, layer) {
      let popupContent = `
        <div class="popup-content">
          <h3>${feature.properties.name || 'Unnamed Road'}</h3>
          <ul>
            <li><strong>Road Type:</strong> ${feature.properties.highway}</li>
            <li><strong>ID:</strong> ${feature.properties.id}</li>
          </ul>
        </div>
      `;
      layer.bindPopup(popupContent);
    },
  }).addTo(map);

  // Create point layer SECOND (so it's on top)
  window.pointLayer = L.geoJSON(pointFeatures, {
    pointToLayer: function (feature, latlng) {
      let markerOptions = {
        radius: 8,
        fillColor: getColorForFeature(feature),
        color: '#000',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
        zIndex: 1000,
      };

      return L.circleMarker(latlng, markerOptions);
    },
    onEachFeature: function (feature, layer) {
      let popupContent = `
        <div class="popup-content">
          <h3>${feature.properties.name || 'Unnamed'}</h3>
          <ul>
            <li><strong>Type:</strong> ${
              feature.properties.shop || feature.properties.amenity || 'Unknown'
            }</li>
            <li><strong>ID:</strong> ${feature.properties.id}</li>
          </ul>
        </div>
      `;
      layer.bindPopup(popupContent);
    },
  }).addTo(map);

  // For backward compatibility
  window.featureLayer = window.pointLayer;
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
  showLoading('showArea');
  fetch(`${URL_BASE}/geodb/area?area=szeged`)
    .then((response) => response.json())
    .then((data) => {
      console.log('Area data:', data);
      areaData = data; // Store the data for filtering
      renderAreas(data);
      hideLoading('showArea', true);
    })
    .catch((error) => {
      console.error('Error fetching area data:', error);
      hideLoading('showArea', false);
      alert('Hiba történt a területi adatok betöltése közben.');
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
  // Remove feature layers if they exist
  if (window.featureLayer) {
    map.removeLayer(window.featureLayer);
  }

  if (window.roadLayer) {
    map.removeLayer(window.roadLayer);
  }

  if (window.pointLayer) {
    map.removeLayer(window.pointLayer);
  }

  // Remove area layer if it exists
  if (areaLayer) {
    map.removeLayer(areaLayer);
  }

  // Reset stored data
  layers = [];
  areaData = null;

  document.getElementById('getData').classList.remove('success');
  document.getElementById('showArea').classList.remove('success');

  // Reset all checkboxes to checked
  document.getElementById('show-schools').checked = true;
  document.getElementById('show-stationery').checked = true;
  document.getElementById('show-supermarkets').checked = true;
  document.getElementById('show-stops').checked = true;
  document.getElementById('show-roads').checked = true;

  // Reset visibility settings
  layerVisibility = {
    schools: true,
    stationery: true,
    supermarkets: true,
    stops: true,
    roads: true,
  };
}

// Automatic data loading on page load - disabled for manual control
// document.addEventListener('DOMContentLoaded', getData);
