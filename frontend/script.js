let map = L.map('map').setView([46.253, 20.1414], 13); // Center Szeged
let mode = 'tiles'; // Default mode is prerendered
let layers = [];
let tileLayer;
let osmLayer = L.tileLayer(
  'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  {
    maxZoom: 19,
    attribution:
      '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  }
).addTo(map);

function getData() {
  fetch('http://localhost:8011/geodb/points')
    .then((response) => response.json())
    .then((data) => {
      layers = data;
      console.log(layers);
      renderLayers();
    });
}

function renderLayers() {
  // Clear any existing layers first
  if (window.featureLayer) {
    map.removeLayer(window.featureLayer);
  }

  // Create a GeoJSON layer with custom popups
  window.featureLayer = L.geoJSON(layers, {
    pointToLayer: function (feature, latlng) {
      // Create markers with different styles based on feature type
      let markerOptions = {
        radius: 8,
        fillColor: getColorForFeature(feature),
        color: '#000',
        weight: 1,
        opacity: 1,
        fillOpacity: 0.8,
      };

      return L.circleMarker(latlng, markerOptions);
    },
    onEachFeature: function (feature, layer) {
      // Create popup content
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

      // Bind popup to layer
      layer.bindPopup(popupContent);
    },
  }).addTo(map);
}

// Function to determine marker color based on feature type
function getColorForFeature(feature) {
  const props = feature.properties;

  if (props.shop === 'supermarket') return '#3388ff';
  if (props.shop === 'stationery') return '#33cc33';
  if (props.shop === 'books') return '#ff9900';
  if (props.shop === 'department_store') return '#9933ff';
  if (props.amenity === 'school') return '#ff3333';
  if (props.amenity === 'college') return '#ff66b2';

  return '#888888'; // Default color
}

// Call getData when the page loads
document.addEventListener('DOMContentLoaded', getData);
