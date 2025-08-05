// src/utils/createBackground.js
/**
 * Adds a background color to the canvas if specified.
 * @param {HTMLCanvasElement} baseCanvas - Source canvas element.
 * @param {string} backgroundColor - CSS color string for the background.
 * @returns {HTMLCanvasElement} Returns the original canvas if no background needed,
 *                             or a new canvas with the background applied.
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