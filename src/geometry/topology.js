/**
 * Módulo de Topología 2D:
 * - Limpieza de micro-segmentos (< 0.001 mm) y deduplicación de geometrías.
 * - Stitcher de segmentos con tolerancia de cierre.
 * - Detección y reporte de contornos abiertos (Open Loops).
 * - Enforce estricto de Winding Order (CCW piezas, CW agujeros).
 * - Normalización de coordenadas a origen local (0,0).
 */

import {
  distance,
  pointsEqual,
  signedPolygonArea,
  polygonArea,
  computeBounds,
  pointInPolygon,
  enforceWindingOrder,
  MICRO_SEGMENT_THRESHOLD
} from './math.js';

const CONNECT_TOLERANCE = 0.05; // 0.05 mm de tolerancia de aproximación de cierre

/**
 * Limpia y filtra micro-segmentos y puntos duplicados de una lista de trayectorias
 */
export function sanitizeRawPaths(rawPaths) {
  const cleanPaths = [];

  for (const path of rawPaths) {
    if (!path || path.length < 2) continue;

    const filtered = [path[0]];
    for (let i = 1; i < path.length; i++) {
      const pt = path[i];
      const prev = filtered[filtered.length - 1];
      // Ignorar puntos a distancia inferior al umbral de micro-segmento (0.001 mm)
      if (distance(pt, prev) >= MICRO_SEGMENT_THRESHOLD) {
        filtered.push(pt);
      }
    }

    if (filtered.length >= 2) {
      // Evitar segmentos parásitos idénticos ya existentes
      if (!isDuplicatePath(filtered, cleanPaths)) {
        cleanPaths.push(filtered);
      }
    }
  }

  return cleanPaths;
}

/**
 * Comprueba si un camino ya existe de forma idéntica o invertida
 */
function isDuplicatePath(path, existingPaths) {
  if (path.length !== 2) return false; // Principalmente para líneas individuales
  const p1 = path[0], p2 = path[1];

  for (const existing of existingPaths) {
    if (existing.length === 2) {
      const e1 = existing[0], e2 = existing[1];
      if ((pointsEqual(p1, e1, 1e-4) && pointsEqual(p2, e2, 1e-4)) ||
          (pointsEqual(p1, e2, 1e-4) && pointsEqual(p2, e1, 1e-4))) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Une segmentos sueltos en bucles cerrados y detecta contornos abiertos no cerrables.
 */
export function stitchSegments(rawPaths, tolerance = CONNECT_TOLERANCE) {
  const sanitized = sanitizeRawPaths(rawPaths);
  let openPaths = sanitized.map(p => p.map(pt => ({ x: pt.x, y: pt.y })));

  const closedLoops = [];
  const unclosedLoops = []; // Contornos abiertos no procesables

  // 1. Separar contornos que ya vienen explícitamente cerrados
  for (let i = openPaths.length - 1; i >= 0; i--) {
    const path = openPaths[i];
    if (path.length >= 3 && pointsEqual(path[0], path[path.length - 1], tolerance)) {
      path[path.length - 1] = { x: path[0].x, y: path[0].y };
      if (polygonArea(path) > 1e-3) {
        closedLoops.push(cleanDegeneratePoints(path));
      }
      openPaths.splice(i, 1);
    }
  }

  // 2. Encadenar caminos restantes
  while (openPaths.length > 0) {
    let currentLoop = openPaths.shift();
    let extended = true;

    while (extended) {
      extended = false;
      const startPt = currentLoop[0];
      const endPt = currentLoop[currentLoop.length - 1];

      // ¿Se cerró el bucle actual?
      if (currentLoop.length >= 3 && pointsEqual(startPt, endPt, tolerance)) {
        currentLoop[currentLoop.length - 1] = { x: startPt.x, y: startPt.y };
        break;
      }

      for (let i = 0; i < openPaths.length; i++) {
        const candidate = openPaths[i];
        const candStart = candidate[0];
        const candEnd = candidate[candidate.length - 1];

        if (pointsEqual(endPt, candStart, tolerance)) {
          currentLoop.push(...candidate.slice(1));
          openPaths.splice(i, 1);
          extended = true;
          break;
        } else if (pointsEqual(endPt, candEnd, tolerance)) {
          const reversed = [...candidate].reverse();
          currentLoop.push(...reversed.slice(1));
          openPaths.splice(i, 1);
          extended = true;
          break;
        } else if (pointsEqual(startPt, candEnd, tolerance)) {
          currentLoop.unshift(...candidate.slice(0, -1));
          openPaths.splice(i, 1);
          extended = true;
          break;
        } else if (pointsEqual(startPt, candStart, tolerance)) {
          const reversed = [...candidate].reverse();
          currentLoop.unshift(...reversed.slice(0, -1));
          openPaths.splice(i, 1);
          extended = true;
          break;
        }
      }
    }

    const first = currentLoop[0];
    const last = currentLoop[currentLoop.length - 1];

    if (currentLoop.length >= 3 && pointsEqual(first, last, tolerance)) {
      currentLoop[currentLoop.length - 1] = { x: first.x, y: first.y };
      const cleaned = cleanDegeneratePoints(currentLoop);
      if (polygonArea(cleaned) > 1e-3) {
        closedLoops.push(cleaned);
      }
    } else {
      // Contorno abierto detectado
      unclosedLoops.push(cleanDegeneratePoints(currentLoop));
    }
  }

  return { closedLoops, unclosedLoops };
}

function cleanDegeneratePoints(points, tol = 1e-4) {
  if (points.length < 3) return points;
  const result = [points[0]];
  for (let i = 1; i < points.length; i++) {
    if (distance(points[i], result[result.length - 1]) > tol) {
      result.push(points[i]);
    }
  }
  return result;
}

/**
 * Desplaza un conjunto de puntos restando el origen (minX, minY) para normalizar a (0,0)
 */
export function normalizeToLocalOrigin(points, origin) {
  return points.map(p => ({
    x: Number((p.x - origin.x).toFixed(4)),
    y: Number((p.y - origin.y).toFixed(4))
  }));
}

/**
 * Procesa contornos y construye la estructura completa de piezas según los criterios exigidos
 */
export function buildPiecesAndTopology(closedLoops, unclosedLoops = [], sourceFileName = 'drawing.dxf') {
  const loopObjects = closedLoops.map((pts, index) => {
    const area = polygonArea(pts);
    const bounds = computeBounds(pts);
    return {
      index,
      points: pts,
      area,
      bounds,
      parentIdx: null,
      children: [],
      depth: 0
    };
  });

  // Ordenar por área descendente
  loopObjects.sort((a, b) => b.area - a.area);

  // Construcción del árbol de contención
  for (let i = 0; i < loopObjects.length; i++) {
    const child = loopObjects[i];
    for (let j = i - 1; j >= 0; j--) {
      const potentialParent = loopObjects[j];
      if (
        child.bounds.minX >= potentialParent.bounds.minX - 1e-3 &&
        child.bounds.maxX <= potentialParent.bounds.maxX + 1e-3 &&
        child.bounds.minY >= potentialParent.bounds.minY - 1e-3 &&
        child.bounds.maxY <= potentialParent.bounds.maxY + 1e-3
      ) {
        const testPoint = child.points[0];
        if (pointInPolygon(testPoint, potentialParent.points)) {
          child.parentIdx = potentialParent.index;
          potentialParent.children.push(child);
          break;
        }
      }
    }
  }

  function computeDepth(node) {
    if (node.parentIdx === null) {
      node.depth = 0;
    } else {
      const parent = loopObjects.find(l => l.index === node.parentIdx);
      node.depth = parent ? parent.depth + 1 : 0;
    }
  }
  loopObjects.forEach(computeDepth);

  const pieces = [];

  for (const loop of loopObjects) {
    if (loop.depth % 2 === 0) { // Contorno Exterior
      // 1. Sentido de giro forzado CCW (Antihorario) para contorno exterior
      const outerContour = enforceWindingOrder(loop.points, true);
      const bounds = loop.bounds;
      const origin = { x: bounds.minX, y: bounds.minY };

      // Contorno exterior normalizado a (0,0)
      const localOuterContour = normalizeToLocalOrigin(outerContour, origin);

      const holes = [];
      const localHoles = [];
      let totalHolesArea = 0;

      for (const child of loop.children) {
        if (child.depth === loop.depth + 1) {
          // 2. Sentido de giro forzado CW (Horario) para agujeros interiores
          const holeContour = enforceWindingOrder(child.points, false);
          holes.push(holeContour);
          localHoles.push(normalizeToLocalOrigin(holeContour, origin));
          totalHolesArea += child.area;
        }
      }

      const netArea = Math.max(0, loop.area - totalHolesArea);
      const pieceId = `PIECE-${Math.random().toString(36).substr(2, 6).toUpperCase()}-${pieces.length + 1}`;

      pieces.push({
        id: pieceId,
        sourceFileName,
        quantity: 1,
        // Coordenadas originales del plano
        outerContour,
        holes,
        // Coordenadas locales normalizadas a su propio (0,0)
        localOuterContour,
        localHoles,
        localBounds: {
          minX: 0,
          minY: 0,
          maxX: bounds.width,
          maxY: bounds.height,
          width: bounds.width,
          height: bounds.height
        },
        area: Number(netArea.toFixed(3)),
        grossArea: Number(loop.area.toFixed(3)),
        bounds,
        winding: {
          outer: 'CCW',
          holes: 'CW'
        }
      });
    }
  }

  // Estructurar contornos abiertos para visualización y alertas
  const openContours = unclosedLoops.map((pts, idx) => ({
    id: `OPEN-${idx + 1}`,
    points: pts,
    bounds: computeBounds(pts),
    length: Number(computePolylineLength(pts).toFixed(2))
  }));

  return { pieces, openContours };
}

function computePolylineLength(pts) {
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += distance(pts[i], pts[i - 1]);
  }
  return len;
}
