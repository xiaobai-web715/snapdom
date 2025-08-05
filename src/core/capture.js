/**
 * Core logic for capturing DOM elements as SVG data URLs.
 * @module capture
 */

import { prepareClone } from './prepare.js';
import { inlineImages } from '../modules/images.js';
import { inlineBackgroundImages } from '../modules/background.js';
import { embedCustomFonts } from '../modules/fonts.js';
import { collectUsedTagNames, generateDedupedBaseCSS } from '../utils/cssTools.js';
import { idle } from '../utils/helpers.js';
import { cache } from '../core/cache.js';

/**
 * Captures an HTML element as an SVG data URL, inlining styles, images, backgrounds, and optionally fonts.
 *
 * @param {Element} element - DOM element to capture
 * @param {Object} [options={}] - Capture options
 * @param {boolean} [options.compress=true] - Whether to compress style keys
 * @param {boolean} [options.embedFonts=false] - Whether to embed custom fonts
 * @param {boolean} [options.fast=true] - Whether to skip idle delay for faster results
 * @param {number} [options.scale=1] - Output scale multiplier
 * @param {number} [options.width] - Optional override output width
 * @param {number} [options.height] - Optional override output height
 * @param {string[]} [options.exclude] - CSS selectors for elements to exclude
 * @param {Function} [options.filter] - Custom filter function
 * @returns {Promise<string>} Promise that resolves to an SVG data URL
 */
export async function captureDOM(element, options = {}) {
  if (!element) throw new Error("Element cannot be null or undefined");

  cache.reset();
  let fontsCSS = "", baseCSS = "", dataURL;

  // Step 1: Clone the element and collect scoped styles
  const { clone, classCSS } = await prepareClone(element, options);

  // Step 2: Inline all relevant assets
  await idle(() => inlineImages(clone, options), options.fast);
  await idle(() => inlineBackgroundImages(element, clone, options), options.fast);
  if (options.embedFonts) {
    fontsCSS = await idle(() => embedCustomFonts(), options.fast);
  }

  // Step 3: Generate deduplicated base CSS (only if compressing)
  if (options.compress) {
    baseCSS = await getBaseCSS(clone);
  }

  // Step 4: Build the final SVG data URL
  dataURL = await buildSVGDataURL(element, clone, {
    classCSS,
    fontsCSS,
    baseCSS,
    scale: options.scale,
    width: options.width,
    height: options.height,
    fast: options.fast
  });

  // Step 5: Clean up sandbox if it exists
  const sandbox = document.getElementById("snapdom-sandbox");
  if (sandbox?.style?.position === "absolute") sandbox.remove();

  return dataURL;
}

/**
 * Generates base CSS from used tag names, with caching.
 * @param {Element} clone - Cloned DOM node
 * @returns {Promise<string>} CSS string
 */
async function getBaseCSS(clone) {
  const usedTags = collectUsedTagNames(clone).sort();
  const tagKey = usedTags.join(",");
  if (cache.baseStyle.has(tagKey)) {
    return cache.baseStyle.get(tagKey);
  }

  const baseCSS = await idle(() => generateDedupedBaseCSS(usedTags));
  cache.baseStyle.set(tagKey, baseCSS);
  return baseCSS;
}

/**
 * Builds the final SVG data URL from the prepared clone.
 * @param {Element} original - Original DOM element
 * @param {Element} clone - Prepared and styled clone
 * @param {Object} params - Additional styling and layout info
 * @returns {Promise<string>} SVG as data URL
 */
async function buildSVGDataURL(original, clone, {
  classCSS = "", baseCSS = "", fontsCSS = "",
  scale, width, height, fast
}) {
  return new Promise((resolve, reject) => {
    idle(() => {
      try {
        const rect = original.getBoundingClientRect();
        let w = rect.width;
        let h = rect.height;
        const hasW = Number.isFinite(width);
        const hasH = Number.isFinite(height);
        const hasScale = typeof scale === "number" && scale !== 1;

        // Adjust dimensions
        if (!hasScale) {
          const aspect = rect.width / rect.height;
          if (hasW && hasH) {
            w = width;
            h = height;
          } else if (hasW) {
            w = width;
            h = w / aspect;
          } else if (hasH) {
            h = height;
            w = h * aspect;
          }
        }

        w = Math.ceil(w);
        h = Math.ceil(h);

        // Set transform scaling if resizing without explicit scale
        clone.setAttribute("xmlns", "http://www.w3.org/1999/xhtml");
        clone.style.transformOrigin = "top left";

        if (!hasScale && (hasW || hasH)) {
          const scaleX = w / rect.width;
          const scaleY = h / rect.height;
          const existingTransform = clone.style.transform || "";
          clone.style.transform = `scale(${scaleX}, ${scaleY}) ${existingTransform}`.trim();
        }

        // Construct SVG with <foreignObject>
        const svgNS = "http://www.w3.org/2000/svg";
        const fo = document.createElementNS(svgNS, "foreignObject");
        fo.setAttribute("width", "100%");
        fo.setAttribute("height", "100%");

        const styleTag = document.createElement("style");
        styleTag.textContent = baseCSS + fontsCSS + "svg{overflow:visible;}" + classCSS;

        fo.appendChild(styleTag);
        fo.appendChild(clone);

        const serializer = new XMLSerializer();
        const foString = serializer.serializeToString(fo);

        const svgString = `<svg xmlns="${svgNS}" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">${foString}</svg>`;
        const dataURL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgString)}`;
        resolve(dataURL);
      } catch (err) {
        reject(err);
      }
    }, fast);
  });
}
