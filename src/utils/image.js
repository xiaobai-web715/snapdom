
import { cache } from "../core/cache";
import { extractURL, safeEncodeURI } from "./helpers";


/**
 * Adds a background color to the canvas if specified.
 * @param {HTMLCanvasElement} baseCanvas - Source canvas element.
 * @param {string} backgroundColor - CSS color string for the background.
 * @returns {HTMLCanvasElement} Returns the original canvas if no background needed,
 * or a new canvas with the background applied.
 */
export function createBackground(baseCanvas, backgroundColor) {
  if (!backgroundColor || !baseCanvas.width || !baseCanvas.height) {
    return baseCanvas;
  }

  const temp = document.createElement('canvas');
  temp.width = baseCanvas.width;
  temp.height = baseCanvas.height;
  const ctx = temp.getContext('2d');

  ctx.fillStyle = backgroundColor;
  ctx.fillRect(0, 0, temp.width, temp.height);
  ctx.drawImage(baseCanvas, 0, 0);

  return temp;
}

/**
 * Fetches and inlines a single background-image entry to a data URL (with caching).
 * - If entry is a gradient or "none", returns unchanged.
 * - If entry is a url(...), fetches the image as data URL and caches it.
 *
 * @param {string} entry - Single background-image entry (e.g., "url(...)").
 * @param {Object} [options={}] - Options like crossOrigin.
 * @param {boolean} [options.skipInline=false] - If true, only fetches & caches, doesn't return a replacement.
 * @returns {Promise<string|void>} - The processed entry (unless skipInline is true).
 */
export async function inlineSingleBackgroundEntry(entry, options = {}) {
  const rawUrl = extractURL(entry)

  const isGradient = /^((repeating-)?(linear|radial|conic)-gradient)\(/i.test(entry);
  
  if (rawUrl) {
    const encodedUrl = safeEncodeURI(rawUrl);
    if (cache.background.has(encodedUrl)) {
      return options.skipInline ? void 0 : `url(${cache.background.get(encodedUrl)})`;
    } else {
      const dataUrl = await fetchImage(encodedUrl, options);
      cache.background.set(encodedUrl, dataUrl);
      return options.skipInline ? void 0 : `url("${dataUrl}")`;
    }
  }

  if (isGradient || entry === "none") {
    return entry;
  }

  return entry;
}

/**
 *
 *
 * @export
 * @param {*} src
 * @return {*} 
 */

export function fetchImage(src, options) {
  let timeout = 5000;
  function getCrossOriginMode(url) {
    try {
      const parsed = new URL(url, window.location.href);
      return parsed.origin === window.location.origin ? "use-credentials" : "anonymous";
    } catch {
      return "anonymous";
    }
  }

  // Función común para fallback vía fetch + proxy
  async function fetchWithFallback(url) {
    const fetchBlobAsDataURL = (fetchUrl) =>
      fetch(fetchUrl, {
        mode: "cors",
        credentials: getCrossOriginMode(fetchUrl) === "use-credentials" ? "include" : "omit",
      })
        .then(r => r.blob())
        .then(blob => new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const base64 = reader.result;
            if (typeof base64 !== "string" || !base64.startsWith("data:image/")) {
              reject(new Error("Invalid image data URL"));
              return;
            }
            resolve(base64);
          };
          reader.onerror = () => reject(new Error("FileReader error"));
          reader.readAsDataURL(blob);
        }));

    try {
      return await fetchBlobAsDataURL(url);
    } catch (e) {
      if (options.useProxy && typeof options.useProxy === "string") {
        const proxied = options.useProxy.replace(/\/$/, "") + safeEncodeURI(url);
        try {
          return await fetchBlobAsDataURL(proxied);
        } catch {
          
          throw new Error("[SnapDOM - fetchImage] CORS restrictions prevented image capture (even via proxy)");
        }
      } else {
       
        throw new Error("[SnapDOM - fetchImage] Fetch fallback failed and no proxy provided");
      }
    }
  }

  const crossOriginValue = getCrossOriginMode(src);

  if (cache.image.has(src)) {
    return Promise.resolve(cache.image.get(src));
  }

  // Detectamos si es un data URI, si sí, devolvemos directo sin fetch
  const isDataURI = src.startsWith("data:image/");
  if (isDataURI) {
    cache.image.set(src, src);
    return Promise.resolve(src);
  }

  // Mejor detección SVG, incluyendo query strings
  const isSVG = /\.svg(\?.*)?$/i.test(src);

  if (isSVG) {
    return (async () => {
      try {
        const response = await fetch(src, {
          mode: "cors",
          credentials: crossOriginValue === "use-credentials" ? "include" : "omit"
        });
        const svgText = await response.text();
        const encoded = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgText)}`;
        cache.image.set(src, encoded);
        return encoded;
      } catch {
        return fetchWithFallback(src);
      }
    })();
  }

  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error("[SnapDOM - fetchImage] Image load timed out"));
    }, timeout);

    const image = new Image();
    image.crossOrigin = crossOriginValue;

    image.onload = async () => {
      clearTimeout(timeoutId);
      try {
        await image.decode();
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext("2d");
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const dataURL = canvas.toDataURL("image/png");
        cache.image.set(src, dataURL);
        resolve(dataURL);
      } catch {
        try {
          const fallbackDataURL = await fetchWithFallback(src);
          cache.image.set(src, fallbackDataURL);
          resolve(fallbackDataURL);
        } catch (e) {
          reject(e);
        }
      }
    };

    image.onerror = async () => {
      clearTimeout(timeoutId);
      console.error(`[SnapDOM - fetchImage] Image failed to load: ${src}`);
      try {
        const fallbackDataURL = await fetchWithFallback(src);
        cache.image.set(src, fallbackDataURL);
        resolve(fallbackDataURL);
      } catch (e) {
        reject(e);
      }
    };

    image.src = src;
  });
}
