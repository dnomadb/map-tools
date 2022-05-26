const VectorTileLayer = require("@mapbox/vector-tile/lib/vectortilelayer");
const Protobuf = require("pbf");

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

const tileHash = {};

onmessage = function (e) {
  const tileInfo = { layers: {} };
  if (!(e.data in tileHash)) {
    fetch(e.data)
      .then((response) => {
        return response.arrayBuffer();
      })
      .then((data) => {
        tileHash[e.data] = true;
        const tile = new VectorTile(new Protobuf(data));
        tileInfo.size = data.byteLength / 1000;
        for (let layer in tile.layers) {
          const layerInfo = {
            features: [tile.layers[layer].length],
            coordinates: [0],
            kb: [tile.layers[layer].bytelength / 1000],
          };
          const layerPropertyHasher = [];
          for (var f = 0; f < tile.layers[layer].length; f++) {
            for (const [key, value] of Object.entries(
              tile.layers[layer].feature(f).properties
            )) {
              layerPropertyHasher.push(`${key}:${value}`);
            }
            layerInfo.features[0] += tile.layers[layer].length;
            let coordinates;

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
                layerInfo.coordinates[0] += part.length;
              });
            });
          }
          const unique = [...new Set(layerPropertyHasher)];
          layerInfo.unique_properties = [unique.length];
          tileInfo.layers[layer] = layerInfo;
        }
        postMessage(tileInfo);
      });
  } else {
    console.log(`Already checked ${e.data}, skipping`);
  }
};
