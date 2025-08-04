// src/api/snapdom.js

import { captureDOM } from '../core/capture';
import { isSafari } from '../utils/helpers.js';
import { extendIconFonts } from '../modules/iconFonts.js';
import { createContext } from '../core/context';

/**
 * Converts a data URL to an HTMLImageElement.
 * @param {string} url - The data URL of the image.
 * @param {object} options - Context options including scale.
 * @returns {Promise<HTMLImageElement>}
 */
async function toImg(url, options) {
  const img = new Image();
  img.src = url;
  await img.decode();

  if (options.scale !== 1) {
    img.style.width = `${img.naturalWidth * options.scale}px`;
    img.style.height = `${img.naturalHeight * options.scale}px`;
  }

  return img;
}

/**
 * Converts a data URL to a Canvas element.
 * @param {string} url - The image data URL.
 * @param {object} options - Context including scale and dpr.
 * @returns {Promise<HTMLCanvasElement>}
 */
async function toCanvas(url, options) {
  const img = new Image();
  img.crossOrigin = 'anonymous';
  img.loading = 'eager';
  img.decoding = 'sync';
  img.src = url;

  const isSafariBrowser = isSafari();
  let appended = false;

  if (isSafariBrowser) {
    document.body.appendChild(img);
    appended = true;
  }

  await img.decode();

  if (isSafariBrowser) await new Promise(resolve => setTimeout(resolve, 100));

  const width = img.naturalWidth * options.scale;
  const height = img.naturalHeight * options.scale;

  const canvas = document.createElement('canvas');
  const dpr = options.dpr;
  canvas.width = Math.ceil(width * dpr);
  canvas.height = Math.ceil(height * dpr);
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
  ctx.drawImage(img, 0, 0, width, height);

  if (appended) img.remove();

  return canvas;
}

/**
 * Adds a background color to the canvas if specified.
 * @param {string} url - Image data URL.
 * @param {object} options - Context including backgroundColor.
 * @returns {Promise<HTMLCanvasElement>}
 */
async function createBackground(url, options) {
  const baseCanvas = await toCanvas(url, options);

  if (!options.backgroundColor || !baseCanvas.width || !baseCanvas.height) return baseCanvas;

  const temp = document.createElement('canvas');
  temp.width = baseCanvas.width;
  temp.height = baseCanvas.height;
  const ctx = temp.getContext('2d');

  ctx.fillStyle = options.backgroundColor;
  ctx.fillRect(0, 0, temp.width, temp.height);
  ctx.drawImage(baseCanvas, 0, 0);

  return temp;
}

/**
 * Converts the rendered output to a Blob.
 * @param {string} url - Image data URL.
 * @param {object} options - Context including type and quality.
 * @returns {Promise<Blob>}
 */
async function toBlob(url, options) {
  const type = options.type;
  
  if (type === 'svg') {
    const svgText = decodeURIComponent(url.split(',')[1]);
    return new Blob([svgText], { type: 'image/svg+xml' });
  }

  const canvas = await createBackground(url, options);
  const mimeType = `image/${type}`;
  
  return new Promise(resolve => canvas.toBlob(blob => resolve(blob), mimeType, options.quality));
}

/**
 * Converts to an HTMLImageElement with raster format.
 * @param {string} url - Image data URL.
 * @param {object} options - Context including format and dpr.
 * @returns {Promise<HTMLImageElement>}
 */
async function toRasterImg(url, options) {
  const format = options.format;
  const canvas = await createBackground(url, options);
  const img = new Image();
  
  img.src = canvas.toDataURL(`image/${format}`, options.quality);
  await img.decode();

  img.style.width = `${canvas.width / options.dpr}px`;
  img.style.height = `${canvas.height / options.dpr}px`;

  return img;
}

/**
 * Triggers download of the generated image.
 * @param {string} url - Image data URL.
 * @param {object} options - Context including format, quality, filename.
 */
async function download(url, options) {
  const format = options.format;
  
  if (format === 'svg') {
    const blob = await toBlob(url, { ...options, type: 'svg' });
    const objectURL = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectURL;
    a.download = options.filename;
    a.click();
    URL.revokeObjectURL(objectURL);
    return;
  }

  const canvas = await createBackground(url, options);
  const a = document.createElement('a');
  a.href = canvas.toDataURL(`image/${format}`, options.quality);
  a.download = options.filename;
  a.click();
}

/**
 * Main function that captures a DOM element and returns export utilities.
 * @param {HTMLElement} element - The DOM element to capture.
 * @param {object} userOptions - Options for rendering/exporting.
 * @returns {Promise<object>} - Utilities for converting the captured content.
 */
export async function snapdom(element, userOptions) {
  if (!element) throw new Error('Element cannot be null or undefined');

  const context = createContext(userOptions);

  if (context.iconFonts && context.iconFonts.length > 0) extendIconFonts(context.iconFonts);

  return snapdom.capture(element, context);
}

/**
 * Captures the DOM and returns helper methods for transformation/export.
 * @param {HTMLElement} el - The DOM element to capture.
 * @param {object} context - Normalized context options.
 * @returns {Promise<object>} - Exporter functions.
 */
snapdom.capture = async (el, context) => {
  const url = await captureDOM(el, context);

  const ensureContext = (opts) => createContext({ ...context, ...(opts || {}) });
  const withFormat = (format) => (opts) =>
    toRasterImg(url, ensureContext({ ...(opts || {}), format }));

  return {
    url,
    toRaw: () => url,
    toImg: (opts) => toImg(url, ensureContext(opts)),
    toCanvas: (opts) => toCanvas(url, ensureContext(opts)),
    toBlob: (opts) => toBlob(url, ensureContext(opts)),
    toPng: withFormat('png'),
    toJpg: withFormat('jpeg'),
    toWebp: withFormat('webp'),
    download: (opts) => download(url, ensureContext(opts)),
  };
};

// Compatibility methods — all normalize options through snapdom first

/**
 * Returns the raw data URL from a captured element.
 */
snapdom.toRaw = (el, options) => snapdom(el, options).then(result => result.toRaw());

/**
 * Returns an HTMLImageElement from a captured element.
 */
snapdom.toImg = (el, options) => snapdom(el, options).then(result => result.toImg());

/**
 * Returns a Canvas element from a captured element.
 */
snapdom.toCanvas = (el, options) => snapdom(el, options).then(result => result.toCanvas());

/**
 * Returns a Blob from a captured element.
 */
snapdom.toBlob = (el, options) => snapdom(el, options).then(result => result.toBlob());

/**
 * Returns a PNG image from a captured element.
 */
snapdom.toPng = (el, options) => snapdom(el, { ...options, format: 'png' }).then(result => result.toPng());

/**
 * Returns a JPEG image from a captured element.
 */
snapdom.toJpg = (el, options) => snapdom(el, { ...options, format: 'jpeg' }).then(result => result.toJpg());

/**
 * Returns a WebP image from a captured element.
 */
snapdom.toWebp = (el, options) => snapdom(el, { ...options, format: 'webp' }).then(result => result.toWebp());

/**
 * Downloads the captured image in the specified format.
 */
snapdom.download = (el, options) => snapdom(el, options).then(result => result.download());
