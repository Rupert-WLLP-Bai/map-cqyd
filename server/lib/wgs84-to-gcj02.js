// server/lib/wgs84-to-gcj02.js
//
// WGS-84 (GPS / OSM / CartoDB / Three.js) -> GCJ-02 (高德 / 腾讯 / 中国火星坐标系)
//
// China adds a deliberate obfuscation offset to public maps. WGS-84 points
// drawn directly on Gaode tiles appear ~50–500 m off from roads. To make
// generated building markers line up with the raster basemap we serve,
// transform at the API boundary.
//
// Reference: the algorithm is the standard GCJ-02 obfuscation on the
// Krasovsky 1940 ellipsoid (a=6378245.0, ee=0.00669342162296594323).
// Points outside mainland China pass through unchanged.

const PI = Math.PI;
const A = 6378245.0;
const EE = 0.00669342162296594323;

function outOfChina(lng, lat) {
  // Mainland bounding box; outside this, GCJ-02 == WGS-84.
  return lng < 72.004 || lng > 137.8347 || lat < 0.8293 || lat > 55.8271;
}

function transformLat(x, y) {
  let ret = -100.0 + 2.0 * x + 3.0 * y + 0.2 * y * y + 0.1 * x * y + 0.2 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(y * PI) + 40.0 * Math.sin((y / 3.0) * PI)) * 2.0 / 3.0;
  ret += (160.0 * Math.sin((y / 12.0) * PI) + 320.0 * Math.sin((y * PI) / 30.0)) * 2.0 / 3.0;
  return ret;
}

function transformLng(x, y) {
  let ret = 300.0 + x + 2.0 * y + 0.1 * x * x + 0.1 * x * y + 0.1 * Math.sqrt(Math.abs(x));
  ret += (20.0 * Math.sin(6.0 * x * PI) + 20.0 * Math.sin(2.0 * x * PI)) * 2.0 / 3.0;
  ret += (20.0 * Math.sin(x * PI) + 40.0 * Math.sin((x / 3.0) * PI)) * 2.0 / 3.0;
  ret += (150.0 * Math.sin((x / 12.0) * PI) + 300.0 * Math.sin((x / 30.0) * PI)) * 2.0 / 3.0;
  return ret;
}

/**
 * *WGS-84 -> GCJ-02.
 * @param {number} lng
 * @param {number} lat
 * @returns {[number, number]} [lng, lat] in GCJ-02 (or unchanged if outside China)
 */
export function wgs84ToGcj02(lng, lat) {
  if (outOfChina(lng, lat)) return [lng, lat];

  let dLat = transformLat(lng - 105.0, lat - 35.0);
  let dLng = transformLng(lng - 105.0, lat - 35.0);

  const radLat = (lat / 180.0) * PI;
  let magic = Math.sin(radLat);
  magic = 1 - EE * magic * magic;
  const sqrtMagic = Math.sqrt(magic);

  dLat = (dLat * 180.0) / (((A * (1 - EE)) / (magic * sqrtMagic)) * PI);
  dLng = (dLng * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI);

  return [lng + dLng, lat + dLat];
}