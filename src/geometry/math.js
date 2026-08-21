/**
 * Utilidades matemáticas y geométricas para procesamiento 2D CAD.
 */

export const EPSILON = 1e-4;
export const MICRO_SEGMENT_THRESHOLD = 0.001; // 0.001 mm

/**
 * Distancia euclidiana entre dos puntos
 */
export function distance(p1, p2) {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.hypot(dx, dy);
}

/**
 * Verifica si dos puntos son prácticamente coincidentes dentro de una tolerancia
 */
export function pointsEqual(p1, p2, tol = 0.05) {
  return distance(p1, p2) <= tol;
}

/**
 * Calcula el área con signo de un polígono usando la fórmula de Shoelace (Gauss).
 * Valor positivo = Sentido antihorario (CCW)
 * Valor negativo = Sentido horario (CW)
 */
export function signedPolygonArea(points) {
  const n = points.length;
  if (n < 3) return 0;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[i].x * points[j].y;
    area -= points[j].x * points[i].y;
  }
  return area / 2;
}

/**
 * Calcula el área absoluta de un polígono
 */
export function polygonArea(points) {
  return Math.abs(signedPolygonArea(points));
}

/**
 * Calcula los límites (Bounding Box) de un conjunto de puntos o polígono
 */
export function computeBounds(points) {
  if (!points || points.length === 0) {
    return { minX: 0, minY: 0, maxX: 0, maxY: 0, width: 0, height: 0 };
  }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return {
    minX: Number(minX.toFixed(4)),
    minY: Number(minY.toFixed(4)),
    maxX: Number(maxX.toFixed(4)),
    maxY: Number(maxY.toFixed(4)),
    width: Number(Math.max(0, maxX - minX).toFixed(4)),
    height: Number(Math.max(0, maxY - minY).toFixed(4))
  };
}

/**
 * Determina si un punto está dentro de un polígono usando el algoritmo Ray-Casting.
 */
export function pointInPolygon(point, polygon) {
  let inside = false;
  const n = polygon.length;
  if (n < 3) return false;

  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;

    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi + 1e-12) + xi);

    if (intersect) inside = !inside;
  }
  return inside;
}

/**
 * Fuerza el sentido de giro (Winding Order):
 * CCW (antihorario) para contornos exteriores (área con signo > 0).
 * CW (horario) para agujeros interiores (área con signo < 0).
 */
export function enforceWindingOrder(points, shouldBeCCW = true) {
  if (!points || points.length < 3) return points;
  const sArea = signedPolygonArea(points);
  const isCCW = sArea > 0;

  if (isCCW !== shouldBeCCW) {
    return [...points].reverse();
  }
  return [...points];
}

/**
 * Discretiza un arco con tolerancia sagital máxima (0.05 mm)
 */
export function discretizeArc(cx, cy, r, startAngleRad, endAngleRad, counterClockwise = true, maxSagitta = 0.05) {
  let sweep = endAngleRad - startAngleRad;
  if (counterClockwise) {
    while (sweep <= 0) sweep += 2 * Math.PI;
  } else {
    while (sweep >= 0) sweep -= 2 * Math.PI;
  }

  const ratio = Math.max(-1, Math.min(1, 1 - (maxSagitta / r)));
  const maxSegmentAngle = 2 * Math.acos(ratio);
  const totalAngle = Math.abs(sweep);
  const minSegments = Math.max(8, Math.ceil(totalAngle / Math.max(maxSegmentAngle, 0.02)));
  const steps = Math.min(minSegments, 720);

  const points = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const angle = startAngleRad + t * sweep;
    points.push({
      x: Number((cx + r * Math.cos(angle)).toFixed(4)),
      y: Number((cy + r * Math.sin(angle)).toFixed(4))
    });
  }
  return points;
}

/**
 * Discretiza segmento LWPOLYLINE con bulge
 */
export function discretizeBulge(p1, p2, bulge, maxSagitta = 0.05) {
  if (Math.abs(bulge) < 1e-6) {
    return [ { x: p1.x, y: p1.y }, { x: p2.x, y: p2.y } ];
  }

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const chordLen = Math.hypot(dx, dy);
  if (chordLen < MICRO_SEGMENT_THRESHOLD) return [{ x: p1.x, y: p1.y }];

  const theta = 4 * Math.atan(bulge);
  const radius = chordLen / (2 * Math.sin(Math.abs(theta) / 2));
  
  const mx = (p1.x + p2.x) / 2;
  const my = (p1.y + p2.y) / 2;

  const sagitta = radius - Math.sqrt(Math.max(0, radius * radius - (chordLen / 2) * (chordLen / 2)));
  const distCenter = radius - sagitta;
  
  let nx = -dy / chordLen;
  let ny = dx / chordLen;
  if (bulge < 0) {
    nx = -nx;
    ny = -ny;
  }

  const cx = mx + nx * distCenter;
  const cy = my + ny * distCenter;

  const startAngle = Math.atan2(p1.y - cy, p1.x - cx);
  const endAngle = Math.atan2(p2.y - cy, p2.x - cx);

  return discretizeArc(cx, cy, radius, startAngle, endAngle, bulge > 0, maxSagitta);
}

/**
 * Discretiza Spline paramétricamente
 */
export function discretizeSpline(controlPoints, maxSagitta = 0.05) {
  if (!controlPoints || controlPoints.length === 0) return [];
  if (controlPoints.length < 3) {
    return controlPoints.map(p => ({ x: Number(p.x.toFixed(4)), y: Number(p.y.toFixed(4)) }));
  }

  const n = controlPoints.length;
  const samples = Math.max(30, n * 12);
  const points = [];

  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * (n - 1);
    const idx = Math.min(Math.floor(t), n - 2);
    const localT = t - idx;

    const p0 = controlPoints[Math.max(0, idx - 1)];
    const p1 = controlPoints[idx];
    const p2 = controlPoints[Math.min(n - 1, idx + 1)];
    const p3 = controlPoints[Math.min(n - 1, idx + 2)];

    const t2 = localT * localT;
    const t3 = t2 * localT;

    const x = 0.5 * ((2 * p1.x) +
      (-p0.x + p2.x) * localT +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);

    const y = 0.5 * ((2 * p1.y) +
      (-p0.y + p2.y) * localT +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);

    points.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
  }

  return points;
}

/**
 * Distancia perpendicular de un punto P a un segmento de línea (A, B)
 */
function perpendicularDistance(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-8) {
    return Math.hypot(p.x - a.x, p.y - a.y);
  }
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.hypot(p.x - projX, p.y - projY);
}

/**
 * Simplificación Poligonal Ramer-Douglas-Peucker (RDP) con límite estricto de vértices (Max 24 a 32 vértices).
 * Reduce drásticamente la cantidad de vértices en curvas/splines para evaluaciones ultrarrápidas.
 * @param {Array<{x:number, y:number}>} points - Vértices del polígono
 * @param {number} epsilon - Tolerancia inicial en mm
 * @param {number} maxVertices - Límite máximo estricto de vértices (default: 32)
 * @returns {Array<{x:number, y:number}>} - Polígono simplificado
 */
export function simplifyPolygonRDP(points, epsilon = 1.5, maxVertices = 32) {
  if (!points || points.length <= 4) return points ? points.map(p => ({ ...p })) : [];

  const isClosed = pointsEqual(points[0], points[points.length - 1], 1e-3);
  const pts = isClosed ? points.slice(0, -1) : points;
  const n = pts.length;
  if (n <= maxVertices) return points.map(p => ({ ...p }));

  let currentEps = epsilon;
  let simplified = [];

  // Bucle adaptativo para forzar que el polígono tenga <= maxVertices
  for (let iter = 0; iter < 4; iter++) {
    function rdpRecursive(pointList, startIdx, endIdx, tol, keepSet) {
      let maxDist = 0;
      let maxIdx = -1;

      for (let i = startIdx + 1; i < endIdx; i++) {
        const d = perpendicularDistance(pointList[i], pointList[startIdx], pointList[endIdx]);
        if (d > maxDist) {
          maxDist = d;
          maxIdx = i;
        }
      }

      if (maxDist > tol && maxIdx !== -1) {
        keepSet.add(maxIdx);
        rdpRecursive(pointList, startIdx, maxIdx, tol, keepSet);
        rdpRecursive(pointList, maxIdx, endIdx, tol, keepSet);
      }
    }

    const midIdx = Math.floor(n / 2);
    const keepSet = new Set([0, midIdx, n - 1]);

    rdpRecursive(pts, 0, midIdx, currentEps, keepSet);
    rdpRecursive(pts, midIdx, n - 1, currentEps, keepSet);

    simplified = [];
    for (let i = 0; i < n; i++) {
      if (keepSet.has(i)) {
        simplified.push({ x: Number(pts[i].x.toFixed(4)), y: Number(pts[i].y.toFixed(4)) });
      }
    }

    if (simplified.length <= maxVertices) {
      break;
    }
    currentEps *= 1.8; // Aumentar tolerancia si supera los vértices máximos
  }

  // Si aún supera maxVertices por muchas aristas rectas cortas, submuestrear equitativamente
  if (simplified.length > maxVertices) {
    const step = simplified.length / maxVertices;
    const clamped = [];
    for (let i = 0; i < maxVertices; i++) {
      clamped.push(simplified[Math.floor(i * step)]);
    }
    simplified = clamped;
  }

  if (isClosed && simplified.length >= 3) {
    simplified.push({ ...simplified[0] });
  }

  return simplified.length >= 3 ? simplified : points.map(p => ({ ...p }));
}
