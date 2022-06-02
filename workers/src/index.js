const maplibregl = require("maplibre-gl");
navigator.serviceWorker.register(new URL("./worker.js", import.meta.url));

const map = new maplibregl.Map({
  container: "map",
  style: "https://demotiles.maplibre.org/style.json",
  center: [0, 0], // starting position [lng, lat]
  zoom: 0,
  hash: true, // starting zoom
});

map.on("load", () => {
  console.log("hi");
  map.addSource("counties", {
    type: "vector",
    tiles: ["https://worker-server/{z}/{x}/{y}.pbf"],
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
