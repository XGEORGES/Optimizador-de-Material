/**
 * Geometría 2D con Detección Robusta de Colisiones (Cruces, Colineales y Distancia).
 */

import { computeBounds } from './math.js';

export function rotatePoint(pt, angleDeg) {
  if (angleDeg === 0) return { x: pt.x, y: pt.y };
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  return {
    x: Number((pt.x * cos - pt.y * sin).toFixed(3)),
    y: Number((pt.x * sin + pt.y * cos).toFixed(3))
  };
}

export function transformPolygon(points, angleDeg = 0, offsetX = 0, offsetY = 0) {
  if (!points || points.length === 0) return [];
  const rad = (angleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const hasRot = Math.abs(angleDeg) > 1e-4;

  return points.map(p => {
    const rx = hasRot ? p.x * cos - p.y * sin : p.x;
    const ry = hasRot ? p.x * sin + p.y * cos : p.y;
    return {
      x: Number((rx + offsetX).toFixed(3)),
      y: Number((ry + offsetY).toFixed(3))
    };
  });
}

export function rotatePieceWithHoles(outerPoints, holesList, angleDeg) {
  const rotPoint = (p) => rotatePoint(p, angleDeg);
  const rotOuter = (outerPoints || []).map(rotPoint);
  const b = computeBounds(rotOuter);

  const normOuter = rotOuter.map(p => ({
    x: Number((p.x - b.minX).toFixed(3)),
    y: Number((p.y - b.minY).toFixed(3))
  }));

  const normHoles = (holesList || []).map(hole => {
    return (hole || []).map(p => {
      const rp = rotPoint(p);
      return {
        x: Number((rp.x - b.minX).toFixed(3)),
        y: Number((rp.y - b.minY).toFixed(3))
      };
    });
  });

  return {
    outerPolygon: normOuter,
    holes: normHoles,
    bounds: {
      minX: 0, minY: 0,
      maxX: b.width, maxY: b.height,
      width: b.width, height: b.height
    }
  };
}

export function subsamplePolygon(points, maxPoints = 28) {
  if (!points || points.length <= maxPoints) return points ? points.map(p => ({ ...p })) : [];
  const step = points.length / maxPoints;
  const result = [];
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.min(points.length - 1, Math.floor(i * step));
    result.push({ x: Number(points[idx].x.toFixed(3)), y: Number(points[idx].y.toFixed(3)) });
  }
  return result;
}

function distSqPointToSegment(px, py, ax, ay, bx, by) {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return (px - ax) ** 2 + (py - ay) ** 2;
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / lenSq));
  const prx = ax + t * dx;
  const pry = ay + t * dy;
  return (px - prx) ** 2 + (py - pry) ** 2;
}

function crossProduct(x1, y1, x2, y2, x3, y3) {
  return (x2 - x1) * (y3 - y1) - (y2 - y1) * (x3 - x1);
}

function onSegment(px, py, ax, ay, bx, by) {
  return px >= Math.min(ax, bx) - 0.05 && px <= Math.max(ax, bx) + 0.05 &&
    py >= Math.min(ay, by) - 0.05 && py <= Math.max(ay, by) + 0.05;
}

/**
 * Cruce robusto: detecta colisiones de líneas paralelas y exactas (colineales)
 */
function segmentsCrossRobust(a1x, a1y, a2x, a2y, b1x, b1y, b2x, b2y) {
  if (
    Math.max(a1x, a2x) < Math.min(b1x, b2x) - 0.05 ||
    Math.min(a1x, a2x) > Math.max(b1x, b2x) + 0.05 ||
    Math.max(a1y, a2y) < Math.min(b1y, b2y) - 0.05 ||
    Math.min(a1y, a2y) > Math.max(b1y, b2y) + 0.05
  ) {
    return false;
  }

  const d1 = crossProduct(b1x, b1y, b2x, b2y, a1x, a1y);
  const d2 = crossProduct(b1x, b1y, b2x, b2y, a2x, a2y);
  const d3 = crossProduct(a1x, a1y, a2x, a2y, b1x, b1y);
  const d4 = crossProduct(a1x, a1y, a2x, a2y, b2x, b2y);

  // Cruce estricto en X
  if (((d1 > 1e-5 && d2 < -1e-5) || (d1 < -1e-5 && d2 > 1e-5)) &&
    ((d3 > 1e-5 && d4 < -1e-5) || (d3 < -1e-5 && d4 > 1e-5))) {
    return true;
  }

  // Toques colineales y de frontera
  if (Math.abs(d1) <= 1e-5 && onSegment(a1x, a1y, b1x, b1y, b2x, b2y)) return true;
  if (Math.abs(d2) <= 1e-5 && onSegment(a2x, a2y, b1x, b1y, b2x, b2y)) return true;
  if (Math.abs(d3) <= 1e-5 && onSegment(b1x, b1y, a1x, a1y, a2x, a2y)) return true;
  if (Math.abs(d4) <= 1e-5 && onSegment(b2x, b2y, a1x, a1y, a2x, a2y)) return true;

  return false;
}

function pointInPoly(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i].x, yi = poly[i].y;
    const xj = poly[j].x, yj = poly[j].y;
    if (((yi > py) !== (yj > py)) && (px < (xj - xi) * (py - yi) / (yj - yi + 1e-9) + xi)) inside = !inside;
  }
  return inside;
}

export function checkPieceCollision(polyA, polyB, boundsA, boundsB, minSpacing = 5) {
  const S = minSpacing;
  const sSq = S * S;

  if (
    boundsA.maxX + S < boundsB.minX ||
    boundsA.minX > boundsB.maxX + S ||
    boundsA.maxY + S < boundsB.minY ||
    boundsA.minY > boundsB.maxY + S
  ) {
    return false;
  }

  const nA = polyA.length;
  const nB = polyB.length;

  for (let i = 0; i < nA; i++) {
    const a1 = polyA[i], a2 = polyA[(i + 1) % nA];
    for (let j = 0; j < nB; j++) {
      const b1 = polyB[j], b2 = polyB[(j + 1) % nB];
      if (segmentsCrossRobust(a1.x, a1.y, a2.x, a2.y, b1.x, b1.y, b2.x, b2.y)) {
        return true;
      }
    }
  }

  const overlapMinX = Math.max(boundsA.minX, boundsB.minX);
  const overlapMaxX = Math.min(boundsA.maxX, boundsB.maxX);
  const overlapMinY = Math.max(boundsA.minY, boundsB.minY);
  const overlapMaxY = Math.min(boundsA.maxY, boundsB.maxY);

  for (let i = 0; i < nA; i++) {
    const p = polyA[i];
    if (p.x >= overlapMinX && p.x <= overlapMaxX && p.y >= overlapMinY && p.y <= overlapMaxY) {
      if (pointInPoly(p.x, p.y, polyB)) return true;
    }
  }
  for (let j = 0; j < nB; j++) {
    const p = polyB[j];
    if (p.x >= overlapMinX && p.x <= overlapMaxX && p.y >= overlapMinY && p.y <= overlapMaxY) {
      if (pointInPoly(p.x, p.y, polyA)) return true;
    }
  }

  for (let i = 0; i < nA; i++) {
    const p = polyA[i];
    for (let j = 0; j < nB; j++) {
      const b1 = polyB[j], b2 = polyB[(j + 1) % nB];
      if (p.x < Math.min(b1.x, b2.x) - S || p.x > Math.max(b1.x, b2.x) + S ||
        p.y < Math.min(b1.y, b2.y) - S || p.y > Math.max(b1.y, b2.y) + S) continue;
      if (distSqPointToSegment(p.x, p.y, b1.x, b1.y, b2.x, b2.y) < sSq) return true;
    }
  }

  for (let j = 0; j < nB; j++) {
    const p = polyB[j];
    for (let i = 0; i < nA; i++) {
      const a1 = polyA[i], a2 = polyA[(i + 1) % nA];
      if (p.x < Math.min(a1.x, a2.x) - S || p.x > Math.max(a1.x, a2.x) + S ||
        p.y < Math.min(a1.y, a2.y) - S || p.y > Math.max(a1.y, a2.y) + S) continue;
      if (distSqPointToSegment(p.x, p.y, a1.x, a1.y, a2.x, a2.y) < sSq) return true;
    }
  }

  return false;
}

export function isPolygonInside(polyA, containerPoly) {
  if (!polyA || !containerPoly || polyA.length < 3 || containerPoly.length < 3) return false;
  for (let i = 0; i < polyA.length; i++) {
    if (!pointInPoly(polyA[i].x, polyA[i].y, containerPoly)) return false;
  }
  return true;
}