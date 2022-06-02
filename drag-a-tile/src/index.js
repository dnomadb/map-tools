const maplibregl = require("maplibre-gl");
const VectorTileLayer = require("@mapbox/vector-tile/lib/vectortilelayer");
const Protobuf = require("pbf");
const randomColor = require("randomcolor");
const { tileToBBOX } = require("@mapbox/tilebelt");

function VectorTile(pbf, end) {
  this.layers = pbf.readFields(readTile, { last: 0 }, end);
  delete this.layers.last;
}

const readTile = (tag, layers, pbf) => {
  if (tag === 3) {
    const layer = new VectorTileLayer(pbf, pbf.readVarint() + pbf.pos);
    layer.bytelength = pbf.pos - layers.last;
    layers.last = pbf.pos;
    if (layer.length) layers[layer.name] = layer;
  }
};

const map = new maplibregl.Map({
  container: "map",
  style: {
    'version': 8,
    'sources': {
    'raster-tiles': {
    'type': 'raster',
    'tiles': [
    'https://stamen-tiles.a.ssl.fastly.net/watercolor/{z}/{x}/{y}.jpg'
    ],
    'tileSize': 256,
    'attribution':
    'Map tiles by <a target="_top" rel="noopener" href="http://stamen.com">Stamen Design</a>, under <a target="_top" rel="noopener" href="http://creativecommons.org/licenses/by/3.0">CC BY 3.0</a>. Data by <a target="_top" rel="noopener" href="http://openstreetmap.org">OpenStreetMap</a>, under <a target="_top" rel="noopener" href="http://creativecommons.org/licenses/by-sa/3.0">CC BY SA</a>'
    }
    },
    'layers': [
    {
    'id': 'simple-tiles',
    'type': 'raster',
    'source': 'raster-tiles',
    'minzoom': 0,
    'maxzoom': 22
    }
    ]
    },
  center: [0, 0], // starting position [lng, lat]
  zoom: 0, // starting zoom
});
map.showTileBoundaries = true;
const arrayBufferToString = (buffer, encoding, callback) => {
  var blob = new Blob([buffer], { type: "text/plain" });
  var reader = new FileReader();
  reader.onload = function (evt) {
    callback(evt.target.result);
  };
  reader.readAsText(blob, encoding);
};

const makeStyle = (features) => {
  const geometryType = [
    ...new Set(
      features.features.map((f) => {
        return f.geometry.type;
      })
    ),
  ];

  const properties = features.features.map((f) => {
    const props = Object.keys(f.properties);
    if (
      props.indexOf("name") >= 0 ||
      props.indexOf("Name") >= 0 ||
      props.indexOf("NAME") >= 0
    ) {
      return "name";
    } else {
      return props[0];
    }
  });
  const descProperty = [...new Set(properties)][0] || "";

  const geometryPriority = [
    "Point",
    "MultiPoint",
    "LineString",
    "MultiLineString",
    "Polygon",
    "MultiPolygon",
  ];
  const styleGeometry = geometryPriority.find((g) => {
    return geometryType.indexOf(g) >= 0;
  });
  const color = randomColor({ luminosity: "bright" });
  switch (styleGeometry) {
    case "Point":
    case "MultiPoint":
      return [
        {
          paint: {
            "circle-color": color,
            "circle-radius": 1,
            "circle-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.75,
              0.5,
            ],
          },
          type: "circle",
        },
        {
          paint: {
            "text-color": randomColor({ hue: color }),
          },
          layout: {
            "text-variable-anchor": ["top", "bottom"],
            "text-field": ["to-string", ["get", descProperty]],
            "text-size": 10,
          },
          type: "symbol",
        },
      ];
      break;
    case "LineString":
    case "MultiLineString":
      return [
        {
          paint: {
            "line-color": color,
            "line-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.75,
              0.5,
            ],
          },
          type: "line",
        },
      ];
      break;
    case "Polygon":
    case "MultiPolygon":
      return [
        {
          paint: {
            "fill-color": color,
            "fill-opacity": [
              "case",
              ["boolean", ["feature-state", "hover"], false],
              0.5,
              0.2,
            ],
            "fill-outline-color": randomColor({ hue: color }),
          },
          type: "fill",
        },
      ];
      break;
  }
};
const createRow = (data, cellType) => {
  const row = document.createElement("tr");
  data.forEach((d, i) => {
    const cell = document.createElement(cellType);
    cell.appendChild(document.createTextNode(d));
    if (i !== 0) {
      cell.className = "number";
    }
    row.appendChild(cell);
  });
  return row;
};
let features;
const dropHandler = (e) => {
  e.preventDefault();
  const reader = new FileReader();
  
  document.getElementById("info").style.visibility = "visible";
  reader.readAsArrayBuffer(e.dataTransfer.files[0]);

  reader.onload = () => {
    try {
      const pbf = new Protobuf(reader.result);

      const tile = new VectorTile(pbf);

      const zxy = window.prompt("Enter the tile z/x/y", document.cookie);
      document.cookie = zxy;
      const [z, x, y] = /(\d+)\/(\d+)\/(\d+)/
        .exec(zxy)
        .slice(1, 4)
        .map((t) => {
          return parseInt(t);
        });

      const tileInfo = { layers: {} };

      for (let layer in tile.layers) {
        const layerInfo = {
          features: 0,
          coordinates: 0,
          extent: tile.layers[layer].extent,
          kb: Math.round(tile.layers[layer].bytelength / 1000),
        };
        const layerPropertyHasher = [];
        features = {
          type: "FeatureCollection",
          features: [],
        };
        for (var f = 0; f < tile.layers[layer].length; f++) {
          for (const [key, value] of Object.entries(
            tile.layers[layer].feature(f).properties
          )) {
            layerPropertyHasher.push(`${key}:${value}`);
          }
          layerInfo.features += tile.layers[layer].length;
          let coordinates;
          // let geometry = tile.layers[layer]
          //     .feature(f).toGeoJSON(
          let geometry = tile.layers[layer]
            .feature(f)
            .toGeoJSON(10, 10, 10).geometry;
          if (geometry["type"] === "Point") {
            coordinates = [[[geometry["coordinates"]]]];
          } else if (
            geometry["type"] === "MultiPoint" ||
            geometry["type"] === "LineString"
          ) {
            coordinates = [[geometry["coordinates"]]];
          } else if (
            geometry["type"] === "MultiLineString" ||
            geometry["type"] === "Polygon"
          ) {
            coordinates = [geometry["coordinates"]];
          } else {
            coordinates = geometry["coordinates"];
          }

          coordinates.forEach((chunk) => {
            chunk.forEach((part) => {
              layerInfo.coordinates += part.length;
            });
          });

          features.features.push(
            tile.layers[layer].feature(f).toGeoJSON(x, y, z)
          );
        }
        map.addSource(layer, { type: "geojson", data: features });
        makeStyle(features).forEach((s, i) => {
          s.id = `${layer}-${i}`;
          s.source = layer;
          map.addLayer(s);
        });
        map.fitBounds(tileToBBOX([x, y, z]));
        const unique = [...new Set(layerPropertyHasher)];
        layerInfo.unique_props = unique.length;
        tileInfo.layers[layer] = layerInfo;
      }
      const rows = Object.entries(tileInfo.layers);
      const table = document.createElement("table");
      const tableBody = document.createElement("tbody");
      const header = ["layer"].concat(Object.keys(rows[0][1]));
      const headerRow = createRow(header, "th");
      tableBody.appendChild(headerRow);

      rows.forEach(([l, r]) => {
        const bodyRow = createRow(
          [l].concat(
            header.slice(1, header.length).map((h) => {
              return r[h];
            })
          ),
          "td"
        );
        bodyRow.setAttribute("id", l);

        tableBody.appendChild(bodyRow);
      });

      table.appendChild(tableBody);
      document.getElementById("info").innerHTML = "";
      document.getElementById("info").appendChild(table);
    } catch (err) {
      map.getStyle().layers.forEach((layer) => {
        map.removeLayer(layer.id);
      });
      arrayBufferToString(reader.result, "UTF-8", (data) => {
        const style = JSON.parse(data);
        //  Adding the layers individually is a naive way to ignore if a source / layer doesn't exist in the tile
        style.layers.forEach((layer) => {
          if ("source" in layer) {
            layer.source = layer["source-layer"];
            delete layer["source-layer"];
          }
          map.addLayer(layer);
        });
        const newStyle = map.getStyle();
        newStyle.glyphs = style.glyphs;
        newStyle.sprite = style.sprite;
        map.setStyle(newStyle);
      });
    }
  };
};

const dragOverHandler = (e) => {
  e.preventDefault();
};

map.getContainer().addEventListener("dragover", dragOverHandler);
map.getContainer().addEventListener("drop", dropHandler);
