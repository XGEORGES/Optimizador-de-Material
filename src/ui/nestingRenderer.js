/**
 * Renderizador de Planchas y Piezas Anidadas (Módulo 4).
 * Renderiza matrices de transformación 2D (traslación x,y y rotación theta),
 * contornos con agujeros (evenodd), indicadores de Hole Nesting
 * y soporte para vista individual o en tira horizontal multi-plancha.
 */

import { computeBounds } from '../geometry/math.js';

export class NestingRenderer {
  constructor(palette) {
    this.palette = palette || [
      '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
      '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#a855f7'
    ];
  }

  /**
   * Renderiza el conjunto de planchas del anidado
   */
  renderSheets(ctx, sheets, options, worldToScreen) {
    if (!sheets || sheets.length === 0) return;

    const { activeSheetIndex = 0, hoveredPiece = null, selectedPiece = null } = options;
    const isSingleView = activeSheetIndex !== 'all';

    let offsetX = 0;
    const sheetGap = 200; // 200 mm de separación visual en tira horizontal

    sheets.forEach((sheet, idx) => {
      if (isSingleView && idx !== activeSheetIndex) {
        return;
      }

      const worldOriginX = isSingleView ? 0 : offsetX;
      const worldOriginY = 0;

      // 1. Marco de la plancha
      this.drawSheetBase(ctx, sheet, worldOriginX, worldOriginY, worldToScreen, idx);

      // 2. Piezas colocadas con agujeros
      if (sheet.placedPieces && sheet.placedPieces.length > 0) {
        sheet.placedPieces.forEach((piece, pIdx) => {
          const isHovered = hoveredPiece && hoveredPiece.instanceId === piece.instanceId;
          const isSelected = selectedPiece && selectedPiece.instanceId === piece.instanceId;
          this.drawPlacedPiece(ctx, piece, worldOriginX, worldOriginY, worldToScreen, pIdx, isHovered, isSelected);
        });
      }

      offsetX += sheet.width + sheetGap;
    });
  }

  /**
   * Dibuja la plancha base con margen perimetral
   */
  drawSheetBase(ctx, sheet, worldX, worldY, worldToScreen, sheetIdx) {
    const p1 = worldToScreen(worldX, worldY);
    const p2 = worldToScreen(worldX + sheet.width, worldY + sheet.height);

    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    ctx.save();

    // Fondo y borde exterior de la plancha
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x, y, w, h);

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2.0;
    ctx.strokeRect(x, y, w, h);

    // Margen perimetral interior
    const margin = sheet.margin || 0;
    if (margin > 0 && sheet.width > margin * 2 && sheet.height > margin * 2) {
      const pm1 = worldToScreen(worldX + margin, worldY + margin);
      const pm2 = worldToScreen(worldX + sheet.width - margin, worldY + sheet.height - margin);
      const mx = Math.min(pm1.x, pm2.x);
      const my = Math.min(pm1.y, pm2.y);
      const mw = Math.abs(pm2.x - pm1.x);
      const mh = Math.abs(pm2.y - pm1.y);

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(mx, my, mw, mh);
      ctx.setLineDash([]);
    }

    // Cabecera superior
    const usedPercent = sheet.wastePercent !== undefined ? (100 - sheet.wastePercent).toFixed(1) : 0;
    const piecesCount = sheet.placedPieces ? sheet.placedPieces.length : 0;

    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(
      `PLANCHA #${sheetIdx + 1}: ${sheet.width} × ${sheet.height} mm | ${piecesCount} piezas | Ocupación: ${usedPercent}%`,
      x + 12,
      y - 12
    );

    ctx.restore();
  }

  /**
   * Dibuja una pieza colocada perforando sus agujeros interiores mediante Even-Odd
   */
  drawPlacedPiece(ctx, piece, worldOriginX, worldOriginY, worldToScreen, pieceIdx, isHovered, isSelected) {
    const polygon = piece.polygon;
    if (!polygon || polygon.length < 3) return;

    const holes = piece.holes || piece.deflatedHoles || [];
    const color = this.getColorForPiece(piece.pieceId);
    const isInHole = Boolean(piece.inHoleOf);

    ctx.save();

    // 1. Relleno con perforación Even-Odd
    ctx.beginPath();
    this.addWorldPolyToPath(ctx, polygon, worldOriginX, worldOriginY, worldToScreen);

    if (holes.length > 0) {
      for (const hole of holes) {
        if (hole && hole.length >= 3) {
          this.addWorldPolyToPath(ctx, hole, worldOriginX, worldOriginY, worldToScreen);
        }
      }
    }

    if (isSelected) {
      ctx.fillStyle = `${color}90`;
    } else if (isHovered) {
      ctx.fillStyle = `${color}60`;
    } else if (isInHole) {
      ctx.fillStyle = 'rgba(236, 72, 153, 0.45)';
    } else {
      ctx.fillStyle = `${color}35`;
    }
    ctx.fill('evenodd');

    // 2. Trazo del contorno exterior
    ctx.beginPath();
    this.addWorldPolyToPath(ctx, polygon, worldOriginX, worldOriginY, worldToScreen);
    ctx.strokeStyle = isSelected ? '#ffffff' : (isHovered ? '#38bdf8' : (isInHole ? '#f472b6' : color));
    ctx.lineWidth = isSelected ? 2.5 : (isHovered ? 2.0 : 1.5);
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 3. Trazo visible de agujeros interiores (Rojo #f87171)
    if (holes.length > 0) {
      for (const hole of holes) {
        if (hole && hole.length >= 3) {
          ctx.beginPath();
          this.addWorldPolyToPath(ctx, hole, worldOriginX, worldOriginY, worldToScreen);
          ctx.strokeStyle = '#f87171';
          ctx.lineWidth = 1.4;
          ctx.stroke();
        }
      }
    }

    // 4. Bounding box al hacer hover o seleccionar
    if (isHovered || isSelected) {
      this.drawSelectionBounds(ctx, polygon, worldOriginX, worldOriginY, worldToScreen, isSelected);
    }

    ctx.restore();
  }

  addWorldPolyToPath(ctx, poly, worldOriginX, worldOriginY, worldToScreen) {
    if (!poly || poly.length === 0) return;
    const start = worldToScreen(poly[0].x + worldOriginX, poly[0].y + worldOriginY);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < poly.length; i++) {
      const pt = worldToScreen(poly[i].x + worldOriginX, poly[i].y + worldOriginY);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
  }

  drawSelectionBounds(ctx, polygon, worldOriginX, worldOriginY, worldToScreen, isSelected) {
    const b = computeBounds(polygon);
    const pMin = worldToScreen(b.minX + worldOriginX, b.minY + worldOriginY);
    const pMax = worldToScreen(b.maxX + worldOriginX, b.maxY + worldOriginY);

    const x = Math.min(pMin.x, pMax.x) - 3;
    const y = Math.min(pMin.y, pMax.y) - 3;
    const w = Math.abs(pMax.x - pMin.x) + 6;
    const h = Math.abs(pMax.y - pMin.y) + 6;

    ctx.save();
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(56, 189, 248, 0.6)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 3]);
    ctx.strokeRect(x, y, w, h);
    ctx.restore();
  }

  getColorForPiece(pieceId) {
    let hash = 0;
    for (let i = 0; i < pieceId.length; i++) {
      hash = pieceId.charCodeAt(i) + ((hash << 5) - hash);
    }
    const idx = Math.abs(hash) % this.palette.length;
    return this.palette[idx];
  }
}