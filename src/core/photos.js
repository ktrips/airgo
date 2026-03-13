/**
 * 写真管理 - EXIF GPS読み取り・逆ジオコーディング
 */

/**
 * DMS (度分秒) を十進度に変換
 */
function dmsToDecimal(dms, ref) {
  if (!Array.isArray(dms) || dms.length < 3) return null;
  const [d, m, s] = dms.map(Number);
  if (isNaN(d) || isNaN(m) || isNaN(s)) return null;
  let decimal = d + m / 60 + s / 3600;
  if (ref === 'S' || ref === 'W') decimal = -decimal;
  return decimal;
}

/**
 * 写真ファイルからEXIF GPS情報を読み取る
 * @param {File} file - 写真ファイル
 * @returns {Promise<{file, url, lat, lng, date, name}>}
 */
export async function loadPhotoWithExif(file) {
  const url = URL.createObjectURL(file);
  let lat = null;
  let lng = null;
  let date = null;

  try {
    // exifr.gps() が JPG/JPEG の GPS 抽出に最適（DMS→十進度変換済み）
    const gps = await exifr.gps(file);
    if (gps && typeof gps.latitude === 'number' && typeof gps.longitude === 'number') {
      lat = gps.latitude;
      lng = gps.longitude;
    }
  } catch (_) {}

  if (lat == null || lng == null) {
    try {
      const exif = await exifr.parse(file, {
        pick: ['latitude', 'longitude', 'GPSLatitude', 'GPSLongitude', 'GPSLatitudeRef', 'GPSLongitudeRef', 'DateTimeOriginal']
      });
      lat = exif?.latitude;
      lng = exif?.longitude;
      date = exif?.DateTimeOriginal;

      if (lat == null && exif?.GPSLatitude) {
        lat = dmsToDecimal(exif.GPSLatitude, exif.GPSLatitudeRef);
      }
      if (lng == null && exif?.GPSLongitude) {
        lng = dmsToDecimal(exif.GPSLongitude, exif.GPSLongitudeRef);
      }
    } catch (_) {}
  } else {
    try {
      const exif = await exifr.parse(file, { pick: ['DateTimeOriginal'] });
      date = exif?.DateTimeOriginal;
    } catch (_) {}
  }

  return {
    file,
    url,
    lat: typeof lat === 'number' && !isNaN(lat) ? lat : null,
    lng: typeof lng === 'number' && !isNaN(lng) ? lng : null,
    date,
    name: file.name,
  };
}

/**
 * 複数の写真を並列で処理
 */
export async function loadPhotosWithExif(files, onProgress = null) {
  const results = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    const photo = await loadPhotoWithExif(files[i]);
    results.push(photo);

    if (onProgress) {
      onProgress((i + 1) / total, i + 1, total);
    }
  }

  return results;
}

/**
 * 逆ジオコーディング - GPS座標から地名を取得
 */
const _geocodeCache = {};
let _geocodeLastReq = 0;

export async function reverseGeocode(lat, lng) {
  const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (_geocodeCache[key]) return _geocodeCache[key];

  // Nominatim API の制限: 1秒間に1リクエスト
  const now = Date.now();
  const wait = Math.max(0, 1100 - (now - _geocodeLastReq));
  if (wait > 0) await new Promise(r => setTimeout(r, wait));
  _geocodeLastReq = Date.now();

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&accept-language=ja`,
      { headers: { 'User-Agent': 'AirGo/1.0' } }
    );
    const data = await res.json();
    const addr = data.address || {};
    const name = addr.village || addr.town || addr.city || addr.municipality ||
                 addr.suburb || addr.county || addr.state || addr.country || '';
    _geocodeCache[key] = name;
    return name;
  } catch {
    _geocodeCache[key] = '';
    return '';
  }
}

/**
 * 写真に地名を一括取得
 */
export async function fetchPlaceNamesForPhotos(photos, onProgress = null) {
  const withGps = photos.filter(p => p.lat != null && p.lng != null && !p.placeName);
  const CONCURRENCY = 5; // 並列処理数
  let processed = 0;

  for (let i = 0; i < withGps.length; i += CONCURRENCY) {
    const batch = withGps.slice(i, i + CONCURRENCY);
    const results = await Promise.all(batch.map(p => reverseGeocode(p.lat, p.lng)));

    batch.forEach((p, j) => {
      p.placeName = results[j];
      processed++;
    });

    if (onProgress) {
      onProgress(processed / withGps.length, processed, withGps.length);
    }
  }

  return photos;
}

/**
 * 写真を日付順にソート
 */
export function sortPhotosByDate(photos) {
  return photos.sort((a, b) => {
    const timeA = a.date?.getTime?.() || 0;
    const timeB = b.date?.getTime?.() || 0;
    return timeA - timeB;
  });
}

/**
 * GPS付き写真のみフィルタ
 */
export function filterPhotosWithGps(photos) {
  return photos.filter(p => p.lat != null && p.lng != null);
}
