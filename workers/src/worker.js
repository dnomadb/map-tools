import { geojson } from "flatgeobuf";
import tilebelt from "@mapbox/tilebelt";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";


const zxyregex = new RegExp(
  /(\d+)\/(\d+)\/(\d+)\.pbf/
);

async function makeTile(tilearray) {
  const r = new Response(tilearray);

  return r;
}

async function queryData(x, y, z) {
  const [w, s, e, n] = tilebelt.tileToBBOX([x, y, z]);
  const rect = {
    minX: w,
    maxX: e,
    minY: s,
    maxY: n,
  };
  let gj = geojson.deserialize("counties.fgb", rect);
  const features = {
    type: "FeatureCollection",
    features: [],
  };
  for await (let feature of gj) {
    features.features.push(feature);
  }

  const tileIndex = geojsonvt(features, {
    maxZoom: 14,
    indexMaxZoom: 10,
  });

  const tile = vtpbf.fromGeojsonVt({ counties: tileIndex.getTile(z, x, y) });
  return tile;
}

self.addEventListener('message', async ev => {
  console.log(ev.data.id)

  const matches = zxyregex.exec(ev.data.url);
  if (matches) {
    const [z, x, y] = matches.slice(1, 4).map((i) => {
      return parseInt(i);
    });

  const res = await queryData(x, y, z);
    postMessage({tileData: res, id: ev.data.id});
  }
});
