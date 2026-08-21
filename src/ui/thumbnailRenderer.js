/**
 * Generador de miniaturas geométricas vectoriales para piezas 2D CAD.
 * Genera un SVG string o un elemento SVG embebido escalado proporcionalmente.
 */

export function renderPieceSvgThumbnail(piece, size = 64) {
  const bounds = piece.localBounds || piece.bounds;
  const padding = 6;
  const availSize = size - padding * 2;

  const maxDim = Math.max(bounds.width, bounds.height, 1);
  const scale = availSize / maxDim;

  // Centrado dentro del viewport
  const offsetX = padding + (availSize - bounds.width * scale) / 2;
  const offsetY = padding + (availSize - bounds.height * scale) / 2;

  function transformPoint(p) {
    const localX = (p.x - bounds.minX) * scale + offsetX;
    // Invertir eje Y para que la orientación SVG sea correcta con respecto a CAD
    const localY = size - ((p.y - bounds.minY) * scale + offsetY);
    return `${localX.toFixed(1)},${localY.toFixed(1)}`;
  }

  function contourToSvgPath(contour) {
    if (!contour || contour.length === 0) return '';
    return contour.map((pt, i) => `${i === 0 ? 'M' : 'L'} ${transformPoint(pt)}`).join(' ') + ' Z';
  }

  const outerPath = contourToSvgPath(piece.localOuterContour || piece.outerContour);
  let holesPaths = '';
  const holes = piece.localHoles || piece.holes || [];
  for (const h of holes) {
    holesPaths += ' ' + contourToSvgPath(h);
  }

  return `
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" class="piece-thumbnail-svg" xmlns="http://www.w3.org/2000/svg">
      <rect width="${size}" height="${size}" rx="6" fill="#0b1329" stroke="#1e293b" />
      <path d="${outerPath} ${holesPaths}" fill-rule="evenodd" fill="rgba(6, 182, 212, 0.25)" stroke="#38bdf8" stroke-width="1.2" stroke-linejoin="round" />
    </svg>
  `;
}
