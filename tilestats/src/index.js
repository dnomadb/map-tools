const maplibregl = require("maplibre-gl");
const worker = new Worker(new URL("./worker.js", import.meta.url));
const randomColor = require("randomcolor");
const { tileToGeoJSON } = require("@mapbox/tilebelt");
const bbox = require("@turf/bbox");

const layerStats = {};
const tileSizes = [];
const average = (array) => array.reduce((a, b) => a + b) / array.length;

const makeFill = (layer_id, color) => {
  return {
    id: `${layer_id}:fill`,
    type: "fill",
    source: "generated",
    "source-layer": layer_id,
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
    filter: ["==", ["geometry-type"], "Polygon"],
  };
};

const makeLine = (layer_id, color) => {
  return {
    id: `${layer_id}:line`,
    type: "line",
    source: "generated",
    "source-layer": layer_id,
    paint: {
      "line-color": color,
      "line-opacity": [
        "case",
        ["boolean", ["feature-state", "hover"], false],
        0.75,
        0.5,
      ],
    },
    filter: ["==", ["geometry-type"], "LineString"],
  };
};

const makeCircle = (layer_id, color) => {
  return {
    id: `${layer_id}:circle`,
    type: "circle",
    source: "generated",
    "source-layer": layer_id,
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
    filter: ["==", ["geometry-type"], "Point"],
  };
};

const makeSymbol = (layer_id, color, descProperty) => {
  return {
    id: `${layer_id}:symbol`,
    type: "symbol",
    source: "generated",
    "source-layer": layer_id,
    paint: {
      "text-color": randomColor({ hue: color }),
    },
    layout: {
      "text-variable-anchor": ["top", "bottom"],
      "text-field": ["to-string", ["get", descProperty]],
      "text-size": 10,
    },
    filter: ["==", ["geometry-type"], "Point"],
  };
};

const makeStyleFromTileJSON = (tileJSON) => {
  try {
    const styleLayers = tileJSON.vector_layers.reduce((all, layer, i) => {
      const fields = Object.keys(layer.fields).filter((f) => {
        return (
          f === "name" ||
          f === "Name" ||
          f === "NAME" ||
          f === "class" ||
          f === "CLASS"
        );
      });
      const descProperty =
        [...new Set(fields)][0] || Object.keys(layer.fields)[0] || "";

      const color = randomColor({ luminosity: "bright", seed: i });
      all.push(makeFill(layer.id, color));
      all.splice(i, 0, makeCircle(layer.id, color));
      all.splice(i + 1, 0, makeLine(layer.id, color));
      all.unshift(makeSymbol(layer.id, color, descProperty));
      return all;
    }, []);
    return [
      tileJSON.center,
      {
        version: 8,
        name: "Preview",
        glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
        sources: {
          generated: {
            type: "vector",
            tiles: tileJSON.tiles,
            maxzoom: tileJSON.maxzoom,
            minzoom: tileJSON.minzoom,
          },
        },
        layers: styleLayers,
      },
    ];
  } catch (err) {
    console.error(err);
  }
};

(async () => {
  const query = new URLSearchParams(window.location.search);
  let tileJSONurl = query.get("tilejson");
  let tilesUrl = query.get("tiles");
  let tileJSON;
  if (!tileJSONurl && !tilesUrl) {
    tileJSONurl = window.prompt("Enter a tilejson url");
    query.set("tilejson", tileJSONurl);
    window.location.search = query.toString();
  } else if (tilesUrl) {
    tileJSON = {
      tilejson: "2.2.0",
      name: "states",
      version: "1.0.0",
      scheme: "xyz",
      tiles: [tilesUrl],
      minzoom: 0,
      maxzoom: 22,
      bounds: [-180.0, -85.0, 180.0, 85.0],
      center: [0.0, 0.0, 0],
      vector_layers: [{ id: "none", fields: [] }],
    };
  }
  if (tileJSONurl) {
    const res = await fetch(tileJSONurl);
    tileJSON = await res.json();
  }
  let [[lat, lng, zoom], style] = makeStyleFromTileJSON(tileJSON);
  const map = new maplibregl.Map({
    container: "map",
    style: style,
    center: [lng, lat], // starting position [lng, lat]
    zoom: zoom, // starting zoom
    transformRequest: (r, t) => {
      if (t == "Tile") {
        const url = r.replace("http://", "https://");
        worker.postMessage(url);
        return { url: url };
      }
    },
    hash: true,
  });
  const tileShapes = {
    type: "FeatureCollection",
    features: [],
  };
  const map2 = new maplibregl.Map({
    container: "map2",
    style: {
      version: 8,
      name: "Preview",
      glyphs: "https://demotiles.maplibre.org/font/{fontstack}/{range}.pbf",
      sources: {
        tiles: {
          type: "geojson",
          data: tileShapes,
        },
        nations: {
          type: "geojson",
          data: "./world.geojson",
        },
      },
      layers: [
        {
          id: "nations",
          source: "nations",
          type: "line",
          paint: {
            "line-color": "white",
            "line-width": 0.25,
          },
        },
        {
          id: "shapes",
          source: "tiles",
          type: "fill",
          paint: {
            "fill-color": [
              "interpolate",
              ["linear"],
              ["get", "size"],
              0,
              "#428296",
              150,
              "#9182AD",
              300,
              "#D87D9E",
              500,
              "#FB8976",
            ],
            "fill-opacity": 0.2,
          },
        },
      ],
    },
    center: [lng, lat], // starting position [lng, lat]
    zoom: zoom, // starting zoom
  });
  window.api = {
    map: map,
    map2: map2,
  };
  const addClick = (layer) => {
    const paintMap = {
      fill: "fill-opacity",
      line: "line-opacity",
      circle: "circle-opacity",
    };
    if (layer.type in paintMap) {
      map.on("mouseover", layer.id, (e) => {
        map.setPaintProperty(layer.id, paintMap[layer.type], 1);
      });
      map.on("mouseleave", layer.id, () => {
        map.setPaintProperty(
          layer.id,
          paintMap[layer.type],
          layer.paint[paintMap[layer.type]]
        );
      });
    }
  };

  map.showTileBoundaries = true;
  const unCheckTracker = {};
  const numberFormatter = (number) => {
    if (number > 10e6) {
      return "" + Math.round(number / 10000) / 100 + "m";
    } else if (number > 100000) {
      return "" + Math.round(number / 10) / 100 + "k";
    } else {
      return Math.round(number * 100) / 100;
    }
  };
  const createRow = (data, cellType) => {
    const row = document.createElement("tr");
    let check;
    if (cellType === "td") {
      check = document.createElement("INPUT");
      check.setAttribute("type", "checkbox");
      if (!(data[0] in unCheckTracker)) {
        check.setAttribute("checked", "true");
      }

      check.setAttribute("id", data[0]);
      check.addEventListener("change", function () {
        const relatedLayers = style.layers.filter((l) => {
          return l["source-layer"] === this.id;
        });

        if (this.checked) {
          delete unCheckTracker[this.id];
          for (const layer of relatedLayers) {
            map.setLayoutProperty(layer.id, "visibility", "visible");
          }
        } else {
          unCheckTracker[this.id] = true;
          for (const layer of relatedLayers) {
            map.setLayoutProperty(layer.id, "visibility", "none");
          }
        }
      });
    } else {
      check = document.createTextNode("👁");
    }

    const checkCell = document.createElement(cellType);
    checkCell.appendChild(check);
    row.appendChild(checkCell);
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
  let tilesLoaded = 0;

  // map.on("mousemove", (e) => {
  //   const features = map.queryRenderedFeatures(e.point);
  //   if (features.length) {
  //     console.log(features[0].layer.id)
  //     map.once("mouseleave", features[0].layer.id, (a) => {
  //       console.log(a)
  //     })
  //   }
  // });
  class hoverChecker {
    constructor(layerID, sourceId, sourceLayer) {
      self.hovered = false;
      this.hoverOver = this.hoverOver.bind(this);
      map.on("mouseover", layerID, this.hoverOver);
      this.sourceId = this.sourceId;
    }
    hoverOver(e) {
      // console.log(e.features[0]);
    }
  }
  const hoverState = {};
  const jsHeap = [];
  worker.onmessage = (e) => {
    jsHeap.push(window.performance.memory.usedJSHeapSize);
    // console.log()
    if (tilesUrl) {
      let newLayer = false;
      let flatLayers = tileJSON.vector_layers.map((l) => {
        return l.id;
      });
      for (const layer of Object.keys(e.data.layers)) {
        if (flatLayers.indexOf(layer) == -1) {
          tileJSON.vector_layers.push({ id: layer, fields: [] });
          newLayer = true;
        }
      }
      if (newLayer) {
        [[lat, lng, zoom], style] = makeStyleFromTileJSON(tileJSON);
        style.layers.forEach((l) => {
          if (!(l.id in hoverState)) {
            hoverState[l.id] = new hoverChecker(
              l.id,
              l.source,
              l["source-layer"]
            );
          }
        });
        map.setStyle(style);
      }
    }

    tileShapes.features.push({
      type: "Feature",
      geometry: tileToGeoJSON(e.data.tile),
      properties: {
        size: e.data.size,
      },
    });
    map2.getSource("tiles").setData(tileShapes);
    map2.fitBounds(bbox.default(tileShapes));
    tileSizes.push(e.data.size);
    tilesLoaded++;
    for (const [layer, stats] of Object.entries(e.data.layers)) {
      if (layer in layerStats) {
        for (const [stat, value] of Object.entries(stats)) {
          layerStats[layer][stat].push(value[0]);
        }
      } else {
        layerStats[layer] = stats;
      }
    }
    const rows = Object.entries(layerStats);
    const table = document.createElement("table");
    const tableBody = document.createElement("tbody");
    const header = ["layer"].concat(Object.keys(rows[0][1]));
    const headerRow = createRow(header, "th");
    tableBody.appendChild(headerRow);

    rows.forEach(([l, r]) => {
      const bodyRow = createRow(
        [l].concat(
          header.slice(1, header.length).map((h) => {
            if (h === "kb") {
              const minval = Math.min(...r[h]);
              const maxval = Math.max(...r[h]);
              const avgval = average(r[h]);
              return `${Math.round(minval * 10) / 10}/${
                Math.round(avgval * 10) / 10
              }/${Math.round(maxval * 10) / 10}`;
            } else {
              return numberFormatter(average(r[h]));
            }
          })
        ),
        "td"
      );
      tableBody.appendChild(bodyRow);
    });
    console.log(Math.max(...jsHeap))
    table.appendChild(tableBody);
    document.getElementById("info").innerHTML = "";
    const summary = document.createElement("span");
    summary.innerHTML = `total tiles: ${tilesLoaded}<br />min size: ${
      Math.round(Math.min(...tileSizes) * 100) / 100
    }kb<br />avg size: ${
      Math.round(average(tileSizes) * 100) / 100
    }kb<br />max size: ${Math.round(Math.max(...tileSizes) * 100) / 100}kb`;
    const h1 = document.createElement("h3");
    h1.innerText = "Tiles loaded:";
    document.getElementById("info").appendChild(h1);
    document.getElementById("info").appendChild(summary);
    const h2 = document.createElement("h3");
    h2.innerText = "Layer statistics (average of all tiles):";
    document.getElementById("info").appendChild(h2);
    document.getElementById("info").appendChild(table);
  };
})();
