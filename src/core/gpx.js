/**
 * GPX処理 - ルート解析・トラックポイント・距離計算
 */

import { haversineKm, distSq } from '../utils/helpers.js';

/**
 * GPX XMLからルートポイントを抽出
 */
export function getGpxRoutePoints(gpxXml) {
  if (!gpxXml) return [];

  try {
    const doc = new DOMParser().parseFromString(gpxXml, 'text/xml');
    const pts = [];
    doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (!isNaN(lat) && !isNaN(lon)) pts.push([lat, lon]);
    });
    return pts;
  } catch {
    return [];
  }
}

/**
 * GPXトラックポイントの詳細データ（速度・気温・標高・心拍数）を取得
 */
export function parseGpxTrackPoints(gpxXml) {
  if (!gpxXml) return [];

  const pts = [];

  try {
    const doc = new DOMParser().parseFromString(gpxXml, 'text/xml');
    doc.querySelectorAll('trkpt, rtept, wpt').forEach(pt => {
      const lat = parseFloat(pt.getAttribute('lat'));
      const lon = parseFloat(pt.getAttribute('lon'));
      if (isNaN(lat) || isNaN(lon)) return;

      const data = { lat, lon, time: null, ele: null, speed: null, temp: null, hr: null };

      // 標高
      const eleEl = pt.querySelector('ele');
      if (eleEl) data.ele = parseFloat(eleEl.textContent);

      // 時刻
      const timeEl = pt.querySelector('time');
      if (timeEl) data.time = new Date(timeEl.textContent.trim()).getTime();

      // 速度（メートル/秒 → km/h）
      const speedEl = pt.querySelector('speed');
      if (speedEl) {
        const v = parseFloat(speedEl.textContent);
        if (!isNaN(v)) data.speed = v < 50 ? v * 3.6 : v;
      }

      // Extensions（Garmin・Strava等の拡張データ）
      const ext = pt.querySelector('extensions');
      if (ext) {
        for (const name of ['speed', 'atemp', 'temp', 'hr', 'heartrate']) {
          const n = ext.querySelector(`*[local-name()='${name}']`);
          if (n && n.textContent) {
            const v = parseFloat(n.textContent);
            if (!isNaN(v)) {
              if (name === 'speed') data.speed = v < 50 ? v * 3.6 : v;
              if (name === 'atemp' || name === 'temp') data.temp = v;
              if (name === 'hr' || name === 'heartrate') data.hr = Math.round(v);
            }
          }
        }
      }

      pts.push(data);
    });

    // 速度が未設定のポイントは前後の時刻・距離から計算
    if (pts.length >= 2) {
      for (let i = 0; i < pts.length; i++) {
        if (pts[i].speed == null && i < pts.length - 1 && pts[i].time && pts[i + 1].time) {
          const dt = (pts[i + 1].time - pts[i].time) / 3600000; // 時間
          if (dt > 0) {
            const km = haversineKm([pts[i].lat, pts[i].lon], [pts[i + 1].lat, pts[i + 1].lon]);
            pts[i].speed = km / dt;
          }
        }
      }
    }
  } catch (_) {}

  return pts;
}

/**
 * 写真にGPXトラックポイントのデータ（速度・温度・標高・心拍）を割り当て
 */
export function assignGpxDataToPhotos(photos, gpxTrackPoints) {
  if (gpxTrackPoints.length === 0) return photos;

  const CLOSE_ENOUGH_SQ = 1e-12; // 非常に近い判定閾値

  photos.forEach(p => {
    if (p.lat == null || p.lng == null) return;

    let best = null;
    let bestDist = Infinity;

    for (const pt of gpxTrackPoints) {
      const d = distSq([p.lat, p.lng], [pt.lat, pt.lon]);
      if (d < bestDist) {
        bestDist = d;
        best = pt;
        if (d < CLOSE_ENOUGH_SQ) break; // 十分近い場合は探索終了
      }
    }

    if (best) {
      p.gpxData = {
        speed: best.speed,
        temp: best.temp,
        ele: best.ele,
        hr: best.hr,
      };
    }
  });

  return photos;
}

/**
 * GPXルートの距離を計算 (km)
 */
export function getRouteDistanceKm(gpxXml) {
  const route = getGpxRoutePoints(gpxXml);

  if (route.length >= 2) {
    let km = 0;
    for (let i = 0; i < route.length - 1; i++) {
      km += haversineKm(route[i], route[i + 1]);
    }
    return km;
  }

  return 0;
}

/**
 * 写真の軌跡から距離を計算（GPXがない場合）
 */
export function getPhotoRouteDistanceKm(photos) {
  const withGps = photos.filter(p => p.lat != null && p.lng != null);

  if (withGps.length >= 2) {
    let km = 0;
    for (let i = 0; i < withGps.length - 1; i++) {
      km += haversineKm([withGps[i].lat, withGps[i].lng], [withGps[i + 1].lat, withGps[i + 1].lng]);
    }
    return km;
  }

  return 0;
}

/**
 * GPXルートに沿って写真をソート
 */
export function sortPhotosByGpxRoute(photos, gpxXml) {
  const route = getGpxRoutePoints(gpxXml);
  if (route.length === 0) return photos;

  const withGps = photos.filter(p => p.lat != null && p.lng != null);
  const withoutGps = photos.filter(p => p.lat == null || p.lng == null);

  // 各写真にルート上の最近接ポイントのインデックスを割り当て
  withGps.forEach(p => {
    let bestDist = Infinity;
    let bestIdx = 0;

    for (let i = 0; i < route.length; i++) {
      const d = distSq([p.lat, p.lng], route[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    p._routeIndex = bestIdx;
  });

  // ルート順でソート
  withGps.sort((a, b) => a._routeIndex - b._routeIndex);

  // GPSなし写真は末尾に追加
  return [...withGps, ...withoutGps];
}

/**
 * GPXファイルから統計情報を抽出
 */
export function getGpxStats(gpxXml) {
  const pts = parseGpxTrackPoints(gpxXml);

  if (pts.length === 0) {
    return null;
  }

  const stats = {
    pointCount: pts.length,
    distance: 0,
    duration: 0,
    avgSpeed: 0,
    maxSpeed: 0,
    minEle: Infinity,
    maxEle: -Infinity,
    eleGain: 0,
    eleLoss: 0,
    avgTemp: 0,
    avgHr: 0,
  };

  let speedSum = 0;
  let speedCount = 0;
  let tempSum = 0;
  let tempCount = 0;
  let hrSum = 0;
  let hrCount = 0;

  // 距離・速度・標高の統計
  for (let i = 0; i < pts.length; i++) {
    const pt = pts[i];

    if (i < pts.length - 1) {
      stats.distance += haversineKm([pt.lat, pt.lon], [pts[i + 1].lat, pts[i + 1].lon]);
    }

    if (pt.speed != null && !isNaN(pt.speed)) {
      speedSum += pt.speed;
      speedCount++;
      stats.maxSpeed = Math.max(stats.maxSpeed, pt.speed);
    }

    if (pt.ele != null && !isNaN(pt.ele)) {
      stats.minEle = Math.min(stats.minEle, pt.ele);
      stats.maxEle = Math.max(stats.maxEle, pt.ele);

      if (i > 0 && pts[i - 1].ele != null) {
        const diff = pt.ele - pts[i - 1].ele;
        if (diff > 0) stats.eleGain += diff;
        else stats.eleLoss += Math.abs(diff);
      }
    }

    if (pt.temp != null && !isNaN(pt.temp)) {
      tempSum += pt.temp;
      tempCount++;
    }

    if (pt.hr != null && !isNaN(pt.hr)) {
      hrSum += pt.hr;
      hrCount++;
    }
  }

  // 所要時間
  if (pts[0].time && pts[pts.length - 1].time) {
    stats.duration = (pts[pts.length - 1].time - pts[0].time) / 3600000; // 時間
  }

  // 平均値
  if (speedCount > 0) stats.avgSpeed = speedSum / speedCount;
  if (tempCount > 0) stats.avgTemp = tempSum / tempCount;
  if (hrCount > 0) stats.avgHr = Math.round(hrSum / hrCount);

  // 標高が取得できていない場合
  if (stats.minEle === Infinity) stats.minEle = null;
  if (stats.maxEle === -Infinity) stats.maxEle = null;

  return stats;
}
