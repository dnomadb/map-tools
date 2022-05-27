const maplibregl = require("maplibre-gl");
const worker = new Worker(new URL("./worker.js", import.meta.url));
const randomColor = require("randomcolor");

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

async function makeStyleFromTileJSON(url) {
  try {
    const res = await fetch(url);
    const tileJSON = await res.json();
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
            url: url,
          },
        },
        layers: styleLayers,
      },
    ];
  } catch (err) {
    console.error(err);
  }
}

(async () => {
  const query = new URLSearchParams(window.location.search);
  let tileJSONurl = query.get("tilejson");
  if (!tileJSONurl) {
    tileJSONurl = window.prompt("Enter a tilejson url");
    query.set("tilejson", tileJSONurl);
    window.location.search = query.toString();
  }
  const [[lat, lng, zoom], style] = await makeStyleFromTileJSON(tileJSONurl);
  const map = new maplibregl.Map({
    container: "map",
    style: style,
    center: [lng, lat], // starting position [lng, lat]
    zoom: zoom, // starting zoom
    transformRequest: (r, t) => {
      if (t == "Tile") {
        worker.postMessage(r);
      }
    },
    hash: true,
  });
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
      check = document.createTextNode("visible");
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
  worker.onmessage = (e) => {
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
            return numberFormatter(average(r[h]));
          })
        ),
        "td"
      );
      tableBody.appendChild(bodyRow);
    });

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
