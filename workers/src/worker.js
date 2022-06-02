import { geojson } from "flatgeobuf";
import tilebelt from "@mapbox/tilebelt";
import geojsonvt from "geojson-vt";
import vtpbf from "vt-pbf";

const cacheName = "tiles";
const cacheAssets = [];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(cacheName)
      .then((cache) => {
        console.log(`${cacheName}`);
        cache.addAll(cacheAssets);
        // not sure if i needed this but..
      })
      .then(() => self.skipWaiting())
  );
});

const zxyregex = new RegExp(
  /https\:\/\/worker\-server\/(\d+)\/(\d+)\/(\d+)\.pbf/
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
  let gj = geojson.deserialize("https://flatgeobuf.org/test/data/UScounties.fgb", rect);
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

self.addEventListener("fetch", (ev) => {
  const matches = zxyregex.exec(ev.request.url);
  console.log(matches, ev.request.url);
  if (matches) {
    const [z, x, y] = matches.slice(1, 4).map((i) => {
      return parseInt(i);
    });

    const res = queryData(x, y, z).then((data) => makeTile(data));

    ev.respondWith(res);
  }
});
