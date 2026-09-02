/**
 * Motor de Anidado 2D de Extrema Densidad (Full Anchor Exploration).
 */

import { computeBounds, polygonArea } from '../geometry/math.js';
import {
  rotatePieceWithHoles,
  transformPolygon,
  subsamplePolygon,
  checkPieceCollision,
  isPolygonInside
} from '../geometry/polygonOffset.js';

export class NestingEngine {
  constructor(job, options = {}) {
    this.job = job;
    this.onProgress = options.onProgress || null;
    this.shouldStop = false;
  }

  stop() {
    this.shouldStop = true;
  }

  async run() {
    const startTime = performance.now();
    const { sheet, settings, items } = this.job;

    const sheetW = Number(sheet.width);
    const sheetH = Number(sheet.height);
    const sheetMargin = Number(sheet.margin || 0);
    const spacing = Number(settings.spacing || 5);
    const rotationStep = Math.max(1, Number(settings.rotationStep || 90));
    const holeNestingEnabled = Boolean(settings.holeNesting);

    const allowedAngles = [];
    // Si el paso es 360, significa que el usuario no quiere rotación (solo 0°)
    if (rotationStep >= 360 || rotationStep === 0) {
      allowedAngles.push(0);
    } else {
      for (let deg = 0; deg < 360; deg += rotationStep) {
        allowedAngles.push(deg);
      }
    }

    // Clasificamos dinámicamente si son ortogonales o no para la heurística
    const primaryAngles = allowedAngles.filter(a => a % 90 === 0);
    const secondaryAngles = allowedAngles.filter(a => a % 90 !== 0);

    const buildVariant = (baseOuter, baseHoles, angle, isOrthogonal) => {
      const rotated = rotatePieceWithHoles(baseOuter, baseHoles, angle);
      const simplified = subsamplePolygon(rotated.outerPolygon, 24);
      return {
        angle,
        isOrthogonal,
        outerPolygon: rotated.outerPolygon,
        simplified,
        holes: rotated.holes,
        bounds: rotated.bounds
      };
    };

    const piecesPool = [];
    for (const item of items) {
      const qty = item.quantity || 1;
      const baseOuter = item.localOuterContour || item.outerContour || [];
      const baseHoles = item.localHoles || item.holes || [];

      const orthogonalVariants = primaryAngles.map(a => buildVariant(baseOuter, baseHoles, a, true));
      const obliqueVariants = secondaryAngles.map(a => buildVariant(baseOuter, baseHoles, a, false));

      for (let q = 0; q < qty; q++) {
        piecesPool.push({
          instanceId: `${item.pieceId}_#${q + 1}`,
          pieceId: item.pieceId,
          sourceFileName: item.sourceFileName,
          area: item.area,
          orthogonalVariants,
          obliqueVariants
        });
      }
    }

    // Ordenamiento Estricto por Área (Mayor a menor sin excepciones)
    piecesPool.sort((a, b) => (b.area || 0) - (a.area || 0));

    const usableW = Math.max(0, sheetW - 2 * sheetMargin);
    const usableH = Math.max(0, sheetH - 2 * sheetMargin);

    const sheets = [];
    const unplacedPieces = [];
    let placedCount = 0;

    const createNewSheet = () => ({
      sheetIndex: sheets.length,
      width: sheetW, height: sheetH, margin: sheetMargin,
      placedPieces: [], availableHoles: [], usedArea: 0, wastePercent: 100
    });

    sheets.push(createNewSheet());

    let lastPlacedPieceId = null;
    let lastPlacedAngle = null;

    for (let pIdx = 0; pIdx < piecesPool.length; pIdx++) {
      if (this.shouldStop) break;

      const piece = piecesPool[pIdx];
      let placed = false;

      // Auto-Paridad en Piezas Asimétricas (Twin Pairing Heuristic)
      const isTwin = (lastPlacedPieceId === piece.pieceId && lastPlacedAngle !== null);
      const preferredComplementaryAngle = isTwin ? (lastPlacedAngle + 180) % 360 : null;

      for (let s = 0; s < sheets.length; s++) {
        const curSheet = sheets[s];

        if (holeNestingEnabled && curSheet.availableHoles.length > 0) {
          placed = this.tryPlaceInHoles(piece, curSheet, spacing);
        }

        if (!placed) {
          placed = this.tryPlaceBottomLeft(piece, curSheet, sheetMargin, usableW, usableH, spacing, preferredComplementaryAngle);
        }

        if (placed) break;
      }

      if (!placed) {
        const newSheet = createNewSheet();
        placed = this.tryPlaceBottomLeft(piece, newSheet, sheetMargin, usableW, usableH, spacing, preferredComplementaryAngle);
        if (placed) sheets.push(newSheet);
        else unplacedPieces.push({ instanceId: piece.instanceId, pieceId: piece.pieceId, area: piece.area });
      }

      if (placed) {
        placedCount++;
        lastPlacedPieceId = piece.pieceId;
        const lastSheet = sheets[sheets.length - 1];
        const lastRecord = lastSheet.placedPieces[lastSheet.placedPieces.length - 1];
        lastPlacedAngle = lastRecord ? lastRecord.rotation : null;
      } else {
        lastPlacedPieceId = null;
        lastPlacedAngle = null;
      }

      if (this.onProgress) {
        this.onProgress({
          currentIteration: placedCount, placedCount, totalCount: piecesPool.length,
          sheetsUsed: sheets.length, wastePercent: this.calculateTotalWaste(sheets),
          candidateLayout: { sheets: [...sheets] }
        });
      }
    }

    for (const s of sheets) this.finalizeSheetMetrics(s);

    return {
      sheets, unplacedPieces, totalPlaced: placedCount, totalCount: piecesPool.length,
      totalWaste: this.calculateTotalWaste(sheets),
      executionTime: Number((performance.now() - startTime).toFixed(2))
    };
  }

  tryPlaceInHoles(piece, sheet, spacing) {
    const allVariants = [...piece.orthogonalVariants, ...piece.obliqueVariants];

    for (let h = 0; h < sheet.availableHoles.length; h++) {
      const hole = sheet.availableHoles[h];
      if (!hole.polygon || hole.polygon.length < 3 || hole.area <= piece.area) continue;

      const hBounds = computeBounds(hole.polygon);

      for (const variant of allVariants) {
        const vBounds = variant.bounds;
        if (vBounds.width > hBounds.width || vBounds.height > hBounds.height) continue;

        const anchorX = hBounds.minX + (hBounds.width - vBounds.width) / 2;
        const anchorY = hBounds.minY + (hBounds.height - vBounds.height) / 2;
        const candBBox = { minX: anchorX, minY: anchorY, maxX: anchorX + vBounds.width, maxY: anchorY + vBounds.height };

        const candidatePoly = transformPolygon(variant.outerPolygon, 0, anchorX, anchorY);

        if (isPolygonInside(candidatePoly, hole.polygon)) {
          let collision = false;
          for (let p = 0; p < sheet.placedPieces.length; p++) {
            const placed = sheet.placedPieces[p];
            if (placed.instanceId === hole.parentInstanceId) continue;

            if (checkPieceCollision(candidatePoly, placed.polygon, candBBox, placed.bounds, spacing)) {
              collision = true;
              break;
            }
          }

          if (!collision) {
            return this.applyPlacement(sheet, piece, variant, anchorX, anchorY, hole.parentInstanceId);
          }
        }
      }
    }
    return false;
  }

  tryPlaceBottomLeft(piece, sheet, margin, usableW, usableH, spacing, preferredAngle = null) {
    const anchorPoints = this.getAnchorPoints(sheet, margin, spacing, usableW, usableH);

    // Auto-Paridad: Si hay un ángulo complementario preferido, ordenamos las variantes para probarlo primero
    const sortVariants = (varList) => {
      if (preferredAngle === null) return varList;
      return [...varList].sort((a, b) => (a.angle === preferredAngle ? -1 : (b.angle === preferredAngle ? 1 : 0)));
    };

    const ortho = sortVariants(piece.orthogonalVariants);
    const oblique = sortVariants(piece.obliqueVariants);

    // Prioridad a piezas ortogonales
    let bestPlacement = this.evaluateVariants(ortho, anchorPoints, sheet, margin, usableW, usableH, spacing, preferredAngle);

    // Si no entró derecha, intentamos inclinarla
    if (!bestPlacement && oblique.length > 0) {
      bestPlacement = this.evaluateVariants(oblique, anchorPoints, sheet, margin, usableW, usableH, spacing, preferredAngle);
    }

    if (bestPlacement) {
      return this.applyPlacement(sheet, piece, bestPlacement.variant, bestPlacement.targetX, bestPlacement.targetY);
    }
    return false;
  }

  evaluateVariants(variants, anchorPoints, sheet, margin, usableW, usableH, spacing, preferredAngle = null) {
    let best = null;
    let bestScore = Infinity;

    for (const variant of variants) {
      const vBounds = variant.bounds;
      if (vBounds.width > usableW || vBounds.height > usableH) continue;

      for (let i = 0; i < anchorPoints.length; i++) {
        const targetX = anchorPoints[i].x;
        const targetY = anchorPoints[i].y;

        if (targetX < margin || targetY < margin || targetX + vBounds.width > margin + usableW || targetY + vBounds.height > margin + usableH) {
          continue;
        }

        const candBBox = { minX: targetX, minY: targetY, maxX: targetX + vBounds.width, maxY: targetY + vBounds.height };

        // Fase 1: Filtro rápido Coarse
        const candidateCoarse = transformPolygon(variant.simplified, 0, targetX, targetY);
        let collision = false;

        for (let p = 0; p < sheet.placedPieces.length; p++) {
          const placed = sheet.placedPieces[p];
          if (checkPieceCollision(candidateCoarse, placed.simplifiedPolygon, candBBox, placed.bounds, spacing)) {
            collision = true;
            break;
          }
        }

        // Fase 2: Filtro exacto Fine
        if (!collision) {
          const candidateFine = transformPolygon(variant.outerPolygon, 0, targetX, targetY);
          for (let p = 0; p < sheet.placedPieces.length; p++) {
            const placed = sheet.placedPieces[p];
            if (checkPieceCollision(candidateFine, placed.polygon, candBBox, placed.bounds, spacing)) {
              collision = true;
              break;
            }
          }
        }

        if (!collision) {
          const pieceWidth = (vBounds && vBounds.width !== undefined) ? vBounds.width : (variant.width || 0);
          const pieceHeight = (vBounds && vBounds.height !== undefined) ? vBounds.height : (variant.height || 0);

          const pieceMaxX = targetX + pieceWidth;
          const pieceMaxY = targetY + pieceHeight;

          // Empaquetado por columnas estrictas (de abajo hacia arriba, luego saltar a la derecha):
          // Ponderamos con máxima prioridad X (para llenar la columna izquierda primero),
          // luego Y (para apilar desde la parte inferior hacia arriba),
          // y el desempate por targetX/targetY.
          let score = (pieceMaxX * 1000) + (pieceMaxY * 1) + (targetX * 0.1) + (targetY * 0.01);

          if (preferredAngle !== null && variant.angle === preferredAngle) {
            score -= 50; // Bonus por encastre de gemelos
          }

          if (!variant.isOrthogonal) {
            score += 25; // Ligera preferencia por colocación ortogonal
          }

          if (score < bestScore) {
            bestScore = score;
            best = { variant, targetX, targetY };
          }
        }
      }
    }
    return best;
  }

  applyPlacement(sheet, piece, variant, x, y, inHoleOf = null) {
    const vBounds = variant.bounds;
    const worldHoles = (variant.holes || []).map(h => transformPolygon(h, 0, x, y));

    const placedRecord = {
      instanceId: piece.instanceId,
      pieceId: piece.pieceId,
      sourceFileName: piece.sourceFileName,
      x: Number(x.toFixed(2)),
      y: Number(y.toFixed(2)),
      rotation: variant.angle,
      area: piece.area,
      polygon: transformPolygon(variant.outerPolygon, 0, x, y),
      holes: worldHoles,
      deflatedHoles: worldHoles,
      simplifiedPolygon: transformPolygon(variant.simplified, 0, x, y),
      bounds: { minX: x, minY: y, maxX: x + vBounds.width, maxY: y + vBounds.height },
      inHoleOf
    };

    sheet.placedPieces.push(placedRecord);
    sheet.usedArea += piece.area;

    if (variant.holes && variant.holes.length > 0) {
      for (const hole of variant.holes) {
        if (hole && hole.length >= 3) {
          sheet.availableHoles.push({
            polygon: transformPolygon(hole, 0, x, y),
            area: polygonArea(hole),
            parentInstanceId: piece.instanceId
          });
        }
      }
    }

    return true;
  }

  getAnchorPoints(sheet, margin, spacing, usableW, usableH) {
    const S = spacing;
    const pts = [{ x: margin, y: margin }];

    for (let i = 0; i < sheet.placedPieces.length; i++) {
      const b = sheet.placedPieces[i].bounds;

      pts.push({ x: b.maxX + S, y: b.minY });
      pts.push({ x: b.minX, y: b.maxY + S });
      pts.push({ x: b.maxX + S, y: margin });
      pts.push({ x: margin, y: b.maxY + S });
      pts.push({ x: b.maxX + S, y: b.maxY + S });

      // Anclajes direccionales para descubrir concavidades interiores y encastres
      const poly = sheet.placedPieces[i].simplifiedPolygon;
      if (poly && poly.length > 0) {
        const step = Math.max(1, Math.floor(poly.length / 12));
        for (let v = 0; v < poly.length; v += step) {
          pts.push({ x: poly[v].x + S, y: poly[v].y });
          pts.push({ x: poly[v].x, y: poly[v].y + S });
          pts.push({ x: poly[v].x - S, y: poly[v].y });
          pts.push({ x: poly[v].x, y: poly[v].y - S });
        }
      }
    }

    // Escaneo de piso y pared izquierda
    for (let x = margin; x <= margin + usableW; x += 50) pts.push({ x, y: margin });
    for (let y = margin; y <= margin + usableH; y += 50) pts.push({ x: margin, y });

    // Ordenamiento por Columnas Virtuales (5mm):
    // Prioridad 1: Menor columna X (extremo izquierdo)
    // Prioridad 2: Menor Y dentro de la misma columna (de abajo hacia arriba)
    pts.sort((a, b) => {
      const colA = Math.floor(a.x / 5);
      const colB = Math.floor(b.x / 5);
      if (colA === colB) return a.y - b.y;
      return colA - colB;
    });

    const unique = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      if (p.x >= margin && p.y >= margin && p.x <= margin + usableW && p.y <= margin + usableH) {
        if (!unique.some(u => Math.abs(u.x - p.x) < 1.0 && Math.abs(u.y - p.y) < 1.0)) {
          unique.push(p);
        }
      }
    }

    return unique;
  }

  finalizeSheetMetrics(sheet) {
    const gross = sheet.width * sheet.height;
    sheet.wastePercent = gross > 0 ? Number((((gross - sheet.usedArea) / gross) * 100).toFixed(1)) : 100;
  }

  calculateTotalWaste(sheets) {
    let totalGross = 0, totalUsed = 0;
    for (const s of sheets) {
      totalGross += s.width * s.height;
      totalUsed += s.usedArea;
    }
    return totalGross > 0 ? Number((((totalGross - totalUsed) / totalGross) * 100).toFixed(1)) : 100;
  }
}