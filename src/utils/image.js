/**
 * 画像処理ユーティリティ - サムネイル生成・圧縮
 */

/**
 * 画像をリサイズしてサムネイルを生成
 * @param {File|Blob} file - 元画像ファイル
 * @param {Object} options - オプション
 * @param {number} options.maxWidth - 最大幅 (default: 360)
 * @param {number} options.maxHeight - 最大高さ (default: 640)
 * @param {number} options.quality - JPEG品質 0-1 (default: 0.7)
 * @returns {Promise<{dataUrl: string, blob: Blob, size: number}>}
 */
export async function createThumbnail(file, options = {}) {
  const {
    maxWidth = 360,
    maxHeight = 640,
    quality = 0.7
  } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      try {
        URL.revokeObjectURL(url);

        // アスペクト比を維持してリサイズ
        let width = img.width;
        let height = img.height;

        if (width > maxWidth) {
          height = Math.round(height * maxWidth / width);
          width = maxWidth;
        }

        if (height > maxHeight) {
          width = Math.round(width * maxHeight / height);
          height = maxHeight;
        }

        // Canvas でリサイズ
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);

        // Blob として出力
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              reject(new Error('サムネイル生成に失敗しました'));
              return;
            }

            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({
              dataUrl,
              blob,
              size: blob.size,
              width,
              height
            });
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };

    img.src = url;
  });
}

/**
 * 画像を中解像度にリサイズ（表示用）
 */
export async function createMediumImage(file, options = {}) {
  const {
    maxWidth = 1920,
    maxHeight = 1080,
    quality = 0.85
  } = options;

  return createThumbnail(file, { maxWidth, maxHeight, quality });
}

/**
 * 複数の画像を一括でサムネイル化
 */
export async function createThumbnailsBatch(files, options = {}, onProgress = null) {
  const results = [];
  const total = files.length;

  for (let i = 0; i < files.length; i++) {
    try {
      const thumbnail = await createThumbnail(files[i], options);
      results.push({ file: files[i], thumbnail, error: null });
    } catch (error) {
      results.push({ file: files[i], thumbnail: null, error });
    }

    if (onProgress) {
      onProgress((i + 1) / total, i + 1, total);
    }
  }

  return results;
}

/**
 * Base64 を Blob に変換
 */
export function base64ToBlob(base64, mimeType = 'image/jpeg') {
  const byteString = atob(base64.split(',')[1]);
  const ab = new ArrayBuffer(byteString.length);
  const ia = new Uint8Array(ab);

  for (let i = 0; i < byteString.length; i++) {
    ia[i] = byteString.charCodeAt(i);
  }

  return new Blob([ab], { type: mimeType });
}

/**
 * Blob を Data URL に変換
 */
export function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

/**
 * 画像ファイルのEXIF方向を修正してCanvas描画
 * @param {File} file - 画像ファイル
 * @param {number} maxSize - 最大サイズ
 * @returns {Promise<{canvas: HTMLCanvasElement, width: number, height: number}>}
 */
export async function loadImageWithOrientation(file, maxSize = 2048) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = async () => {
      try {
        URL.revokeObjectURL(url);

        // EXIF orientation を取得
        let orientation = 1;
        try {
          if (typeof exifr !== 'undefined') {
            const exif = await exifr.parse(file, { pick: ['Orientation'] });
            orientation = exif?.Orientation || 1;
          }
        } catch (_) {}

        let width = img.width;
        let height = img.height;

        // maxSize に収める
        if (width > maxSize || height > maxSize) {
          if (width > height) {
            height = Math.round(height * maxSize / width);
            width = maxSize;
          } else {
            width = Math.round(width * maxSize / height);
            height = maxSize;
          }
        }

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        // Orientation に応じて回転・反転
        if (orientation > 4) {
          canvas.width = height;
          canvas.height = width;
        } else {
          canvas.width = width;
          canvas.height = height;
        }

        switch (orientation) {
          case 2: ctx.transform(-1, 0, 0, 1, width, 0); break;
          case 3: ctx.transform(-1, 0, 0, -1, width, height); break;
          case 4: ctx.transform(1, 0, 0, -1, 0, height); break;
          case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
          case 6: ctx.transform(0, 1, -1, 0, height, 0); break;
          case 7: ctx.transform(0, -1, -1, 0, height, width); break;
          case 8: ctx.transform(0, -1, 1, 0, 0, width); break;
        }

        ctx.drawImage(img, 0, 0, width, height);

        resolve({ canvas, width, height });
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像の読み込みに失敗しました'));
    };

    img.src = url;
  });
}
