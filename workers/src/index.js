const maplibregl = require("maplibre-gl");
const worker = new Worker(new URL("./worker.js", import.meta.url));

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [0, 0], // starting position [lng, lat]
  zoom: 0,
  hash: true, // starting zoom
});

class TileWorkerManager {
  constructor() {
    this.calls = 0;
    this.callbacks = {};
    this.getTile = this.getTile.bind(this);
  }

  getTile(url, callback) {
    worker.postMessage({
      url: url,
      id: this.calls
    });
    this.callbacks[this.calls++] = callback
    worker.onmessage = (e) => {
      const call = this.callbacks[e.data.id];
      delete this.callbacks[e.data.id];
      return call(null, e.data.tileData);
    }
  }
}
const TW = new TileWorkerManager();
maplibregl.addProtocol("ranger", (params, callback) => {
  console.log(params.url)
  TW.getTile(params.url, (err, data) => {
    return callback(null, data, null, null)
  });
  return { cancel: () => { } };
});

map.on("load", () => {
  map.addSource("counties", {
    type: "vector",
    tiles: ["ranger://worker-server/{z}/{x}/{y}.pbf"],
  });
  map.addLayer({
    id: "counties",
    type: "line",
    source: "counties",
    "source-layer": "counties",
    layout: {
      "line-join": "round",
      "line-cap": "round",
    },
    paint: {
      "line-color": "#ff69b4",
      "line-width": 1,
    },
  });
});
