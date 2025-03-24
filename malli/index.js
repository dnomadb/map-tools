(async () => {
    const query = new URLSearchParams(window.location.search);
    const infoUrl = query.get("url");

    try {
        const res = await fetch(infoUrl);
        const info = await res.json();

        const { minzoom, maxzoom, bounding_box, tile_url } = info.datasets[0];

        const [w, s, e, n] = bounding_box;
        const lng = (e - w) / 2 + w;
        const lat = (n - s) / 2 + s;

        const style = {
            'version': 8,
            'sources': {
                'raster-tiles': {
                    'type': 'raster',
                    'tiles': [tile_url],
                }
            },
            'layers': [
                {
                    'id': 'simple-tiles',
                    'type': 'raster',
                    'source': 'raster-tiles',
                    'minzoom': minzoom,
                    'maxzoom': maxzoom
                }
            ]
        }

        const beforeMap = new maplibregl.Map({
            container: "before",
            style: style,
            center: [lng, lat],
            zoom: maxzoom / 2,
        });

        const afterMap = new maplibregl.Map({
            container: "after",
            style: style,
            center: [lng, lat],
            zoom: maxzoom / 2,
            transformRequest: (r, t) => {
                if (t == "Tile") {
                    const urlObject = new URL(r);
                    urlObject.searchParams.set("query", JSON.stringify({ dynamic: true }));
                    return { url: urlObject.href }
                }
            }
        });

        // A selector or reference to HTML element
        const container = "#comparison-container";

        const map = new maplibregl.Compare(beforeMap, afterMap, container, {
        });
    } catch (err) {
        console.error(err)
    }



})();