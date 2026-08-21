/**
 * Extractor y Parser de Geometría DXF para chapa metálica y corte 2D.
 * Implementa filtrado de micro-segmentos, stitcher con detección de lazos abiertos
 * y normalización de coordenadas locales (0,0).
 */

import { discretizeArc, discretizeBulge, discretizeSpline } from './math.js';
import { stitchSegments, buildPiecesAndTopology } from './topology.js';

export class DxfGeometryExtractor {
  constructor(options = {}) {
    this.tolerance = options.tolerance || 0.05; // 0.05 mm por defecto
  }

  /**
   * Extrae y clasifica todas las entidades de un objeto DXF
   * @param {Object} dxfData - Objeto AST resultante de dxf-parser
   * @param {string} fileName - Nombre del archivo origen
   * @returns {{ pieces: Array<Object>, openContours: Array<Object>, totalExtracted: number }}
   */
  extractPieces(dxfData, fileName = 'drawing.dxf') {
    if (!dxfData || !dxfData.entities) {
      console.warn('DXF sin entidades válidas:', dxfData);
      return { pieces: [], openContours: [], totalExtracted: 0 };
    }

    const rawPaths = [];

    for (const entity of dxfData.entities) {
      const paths = this.processEntity(entity);
      if (paths && paths.length > 0) {
        rawPaths.push(...paths);
      }
    }

    // 1. Stitcher de segmentos con filtrado de micro-segmentos y deduplicación
    const { closedLoops, unclosedLoops } = stitchSegments(rawPaths, this.tolerance);

    // 2. Construcción topológica: Winding order estricto, Agujeros y Normalización a (0,0)
    const result = buildPiecesAndTopology(closedLoops, unclosedLoops, fileName);

    return {
      pieces: result.pieces,
      openContours: result.openContours,
      totalExtracted: result.pieces.length
    };
  }

  /**
   * Procesa una entidad DXF individual
   */
  processEntity(entity) {
    if (!entity || !entity.type) return [];

    switch (entity.type) {
      case 'LINE':
        if (entity.vertices && entity.vertices.length >= 2) {
          const p1 = { x: Number(entity.vertices[0].x.toFixed(4)), y: Number(entity.vertices[0].y.toFixed(4)) };
          const p2 = { x: Number(entity.vertices[1].x.toFixed(4)), y: Number(entity.vertices[1].y.toFixed(4)) };
          return [[p1, p2]];
        }
        break;

      case 'LWPOLYLINE':
      case 'POLYLINE':
        return this.processPolyline(entity);

      case 'ARC':
        return this.processArc(entity);

      case 'CIRCLE':
        return this.processCircle(entity);

      case 'SPLINE':
        return this.processSpline(entity);

      case 'ELLIPSE':
        return this.processEllipse(entity);

      default:
        // Capas no relevantes o texto se descartan con seguridad
        break;
    }

    return [];
  }

  processPolyline(entity) {
    const vertices = entity.vertices || [];
    if (vertices.length < 2) return [];

    const isClosed = Boolean(entity.shape || entity.closed);
    const discretizedPath = [];

    const count = vertices.length;
    const numSegments = isClosed ? count : count - 1;

    for (let i = 0; i < numSegments; i++) {
      const p1 = vertices[i];
      const p2 = vertices[(i + 1) % count];
      const bulge = p1.bulge || 0;

      if (Math.abs(bulge) > 1e-5) {
        const arcPts = discretizeBulge(p1, p2, bulge, this.tolerance);
        if (discretizedPath.length > 0) {
          discretizedPath.push(...arcPts.slice(1));
        } else {
          discretizedPath.push(...arcPts);
        }
      } else {
        if (discretizedPath.length === 0) {
          discretizedPath.push({ x: Number(p1.x.toFixed(4)), y: Number(p1.y.toFixed(4)) });
        }
        discretizedPath.push({ x: Number(p2.x.toFixed(4)), y: Number(p2.y.toFixed(4)) });
      }
    }

    if (isClosed && discretizedPath.length >= 3) {
      discretizedPath[discretizedPath.length - 1] = { ...discretizedPath[0] };
    }

    return [discretizedPath];
  }

  processArc(entity) {
    if (!entity.center || entity.radius === undefined) return [];
    
    const cx = entity.center.x || 0;
    const cy = entity.center.y || 0;
    const r = entity.radius;

    let startAngle = entity.startAngle || 0;
    let endAngle = entity.endAngle || 0;

    if (Math.abs(startAngle) > 2 * Math.PI || Math.abs(endAngle) > 2 * Math.PI) {
      startAngle = (startAngle * Math.PI) / 180;
      endAngle = (endAngle * Math.PI) / 180;
    }

    const points = discretizeArc(cx, cy, r, startAngle, endAngle, true, this.tolerance);
    return [points];
  }

  processCircle(entity) {
    if (!entity.center || entity.radius === undefined) return [];
    const cx = entity.center.x || 0;
    const cy = entity.center.y || 0;
    const r = entity.radius;

    const points = discretizeArc(cx, cy, r, 0, 2 * Math.PI, true, this.tolerance);
    return [points];
  }

  processSpline(entity) {
    const controlPoints = entity.controlPoints || entity.points || [];
    if (controlPoints.length < 2) return [];

    const pts = discretizeSpline(controlPoints, this.tolerance);
    if (entity.closed && pts.length > 2) {
      pts[pts.length - 1] = { ...pts[0] };
    }
    return [pts];
  }

  processEllipse(entity) {
    if (!entity.center || !entity.majorAxisEndPoint) return [];
    const cx = entity.center.x;
    const cy = entity.center.y;
    const rx = Math.hypot(entity.majorAxisEndPoint.x, entity.majorAxisEndPoint.y);
    const ry = rx * (entity.axisRatio || 1);
    const rotation = Math.atan2(entity.majorAxisEndPoint.y, entity.majorAxisEndPoint.x);

    const steps = Math.max(36, Math.ceil((2 * Math.PI * rx) / (this.tolerance * 10)));
    const points = [];
    for (let i = 0; i <= steps; i++) {
      const theta = (i / steps) * 2 * Math.PI;
      const xLocal = rx * Math.cos(theta);
      const yLocal = ry * Math.sin(theta);

      const x = cx + xLocal * Math.cos(rotation) - yLocal * Math.sin(rotation);
      const y = cy + xLocal * Math.sin(rotation) + yLocal * Math.cos(rotation);
      points.push({ x: Number(x.toFixed(4)), y: Number(y.toFixed(4)) });
    }
    return [points];
  }
}
