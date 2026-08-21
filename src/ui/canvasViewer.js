import { NestingRenderer } from './nestingRenderer.js';
import { pointInPolygon, computeBounds } from '../geometry/math.js';

export class CanvasViewer {
  constructor(canvasElement) {
    this.canvas = canvasElement;
    this.ctx = canvasElement.getContext('2d');
    
    // Modos de Vista: 'ingest' (Ingesta CAD original) | 'nesting' (Planchas optimizadas)
    this.viewMode = 'ingest';

    this.pieces = [];
    this.openContours = [];
    this.sheet = null; // { width, height, margin }
    this.selectedPieceId = null;

    // Estado de Anidado (Módulo 4)
    this.nestingSheets = [];
    this.activeSheetIndex = 0; // 0, 1, 2... o 'all'
    this.hoveredNestingPiece = null;
    this.selectedNestingPiece = null;
    this.onPieceHover = null; // Callback para tooltip
    this.onPieceClick = null; // Callback para selección

    // Renderizador de Anidado
    this.nestingRenderer = new NestingRenderer(this.palette);

    // Cámara
    this.scale = 1.0;
    this.panX = 50;
    this.panY = 50;
    this.isPanning = false;
    this.startX = 0;
    this.startY = 0;

    // Visual switches
    this.showVertices = false;
    this.showBounds = true;
    this.showDimensions = true;
    this.showSheetPreview = true;

    // Paleta CAD distinguible
    this.palette = [
      '#3b82f6', '#10b981', '#f59e0b', '#ec4899',
      '#8b5cf6', '#06b6d4', '#f97316', '#14b8a6', '#a855f7'
    ];

    this.initEvents();
    this.resizeCanvas();
    window.addEventListener('resize', () => this.resizeCanvas());
  }

  resizeCanvas() {
    const parent = this.canvas.parentElement;
    if (parent) {
      this.canvas.width = parent.clientWidth;
      this.canvas.height = parent.clientHeight;
      this.render();
    }
  }

  initEvents() {
    this.canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const worldX = (mouseX - this.panX) / this.scale;
      const worldY = (mouseY - this.panY) / this.scale;

      this.scale *= zoomFactor;
      this.scale = Math.max(0.005, Math.min(this.scale, 50));

      this.panX = mouseX - worldX * this.scale;
      this.panY = mouseY - worldY * this.scale;

      this.render();
    }, { passive: false });

    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) { // Clic izquierdo
        this.isPanning = true;
        this.startX = e.clientX - this.panX;
        this.startY = e.clientY - this.panY;
        this.canvas.style.cursor = 'grabbing';

        // Hit testing para selección en modo nesting
        if (this.viewMode === 'nesting') {
          const hit = this.hitTestNestingPiece(e.clientX, e.clientY);
          this.selectedNestingPiece = hit ? hit.piece : null;
          if (this.onPieceClick) {
            this.onPieceClick(hit);
          }
          this.render();
        }
      }
    });

    window.addEventListener('mousemove', (e) => {
      if (this.isPanning) {
        this.panX = e.clientX - this.startX;
        this.panY = e.clientY - this.startY;
        this.render();
      } else if (this.viewMode === 'nesting') {
        // Hit test hover
        const hit = this.hitTestNestingPiece(e.clientX, e.clientY);
        const prevHover = this.hoveredNestingPiece;
        this.hoveredNestingPiece = hit ? hit.piece : null;

        if (this.onPieceHover) {
          this.onPieceHover(hit, e.clientX, e.clientY);
        }

        if (this.hoveredNestingPiece !== prevHover) {
          this.render();
        }
      }
    });

    window.addEventListener('mouseup', () => {
      if (this.isPanning) {
        this.isPanning = false;
        this.canvas.style.cursor = 'grab';
      }
    });

    this.canvas.style.cursor = 'grab';
  }

  setViewMode(mode) {
    if (this.viewMode !== mode) {
      this.viewMode = mode;
      this.zoomToFit();
    }
  }

  setNestingData(sheets) {
    this.nestingSheets = sheets || [];
    if (this.activeSheetIndex !== 'all' && this.activeSheetIndex >= this.nestingSheets.length) {
      this.activeSheetIndex = 0;
    }
    this.render();
  }

  setActiveSheetIndex(index) {
    this.activeSheetIndex = index;
    this.zoomToFit();
  }

  setData(pieces, openContours = [], sheet = null) {
    this.pieces = pieces;
    this.openContours = openContours;
    this.sheet = sheet;
    if (this.viewMode === 'ingest') {
      this.zoomToFit();
    }
  }

  updateSheet(sheet) {
    this.sheet = sheet;
    this.render();
  }

  selectPiece(pieceId) {
    this.selectedPieceId = pieceId;
    this.render();
  }

  hitTestNestingPiece(clientX, clientY) {
    if (!this.nestingSheets || this.nestingSheets.length === 0) return null;

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;

    const worldMouseX = (mouseX - this.panX) / this.scale;
    const worldMouseY = (this.panY - mouseY) / this.scale;

    const isSingleView = this.activeSheetIndex !== 'all';
    let offsetX = 0;
    const sheetGap = 200;

    for (let sIdx = 0; sIdx < this.nestingSheets.length; sIdx++) {
      if (isSingleView && sIdx !== this.activeSheetIndex) {
        continue;
      }

      const sheet = this.nestingSheets[sIdx];
      const worldOriginX = isSingleView ? 0 : offsetX;
      const localWorldX = worldMouseX - worldOriginX;
      const localWorldY = worldMouseY;

      if (sheet.placedPieces) {
        // Probar en orden inverso para seleccionar primero piezas superiores/anidadas
        for (let i = sheet.placedPieces.length - 1; i >= 0; i--) {
          const piece = sheet.placedPieces[i];
          if (pointInPolygon({ x: localWorldX, y: localWorldY }, piece.polygon)) {
            const b = computeBounds(piece.polygon);
            return {
              piece,
              sheetIndex: sIdx,
              bounds: b,
              screenX: clientX,
              screenY: clientY
            };
          }
        }
      }

      offsetX += sheet.width + sheetGap;
    }

    return null;
  }

  zoomToFit() {
    const allBounds = [];

    if (this.viewMode === 'nesting') {
      if (this.nestingSheets && this.nestingSheets.length > 0) {
        const isSingle = this.activeSheetIndex !== 'all';
        let offsetX = 0;
        const sheetGap = 200;

        this.nestingSheets.forEach((s, idx) => {
          if (isSingle && idx !== this.activeSheetIndex) return;
          const originX = isSingle ? 0 : offsetX;
          allBounds.push({
            minX: originX,
            minY: 0,
            maxX: originX + s.width,
            maxY: s.height
          });
          offsetX += s.width + sheetGap;
        });
      } else if (this.sheet) {
        allBounds.push({ minX: 0, minY: 0, maxX: this.sheet.width, maxY: this.sheet.height });
      }
    } else {
      // Modo Ingesta
      if (this.pieces && this.pieces.length > 0) {
        this.pieces.forEach(p => allBounds.push(p.bounds));
      }
      if (this.openContours && this.openContours.length > 0) {
        this.openContours.forEach(o => allBounds.push(o.bounds));
      }
      if (allBounds.length === 0 && this.sheet) {
        allBounds.push({ minX: 0, minY: 0, maxX: this.sheet.width, maxY: this.sheet.height });
      }
    }

    if (allBounds.length === 0) {
      this.render();
      return;
    }

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const b of allBounds) {
      minX = Math.min(minX, b.minX);
      minY = Math.min(minY, b.minY);
      maxX = Math.max(maxX, b.maxX);
      maxY = Math.max(maxY, b.maxY);
    }

    const worldWidth = maxX - minX || 100;
    const worldHeight = maxY - minY || 100;

    const margin = 70;
    const availW = Math.max(50, this.canvas.width - margin * 2);
    const availH = Math.max(50, this.canvas.height - margin * 2);

    const scaleX = availW / worldWidth;
    const scaleY = availH / worldHeight;
    this.scale = Math.min(scaleX, scaleY);

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    this.panX = this.canvas.width / 2 - centerX * this.scale;
    this.panY = this.canvas.height / 2 + centerY * this.scale;

    this.render();
  }

  worldToScreen(x, y) {
    return {
      x: this.panX + x * this.scale,
      y: this.panY - y * this.scale
    };
  }

  drawGrid() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, w, h);

    let gridStep = 100;
    if (this.scale < 0.05) gridStep = 1000;
    else if (this.scale < 0.2) gridStep = 500;
    else if (this.scale < 0.8) gridStep = 100;
    else if (this.scale > 2) gridStep = 20;
    else if (this.scale > 10) gridStep = 5;

    ctx.lineWidth = 1;
    ctx.strokeStyle = '#151d2f';

    const leftWorld = (-this.panX) / this.scale;
    const rightWorld = (w - this.panX) / this.scale;
    const topWorld = (this.panY) / this.scale;
    const bottomWorld = (this.panY - h) / this.scale;

    const startX = Math.floor(leftWorld / gridStep) * gridStep;
    const endX = Math.ceil(rightWorld / gridStep) * gridStep;
    const startY = Math.floor(bottomWorld / gridStep) * gridStep;
    const endY = Math.ceil(topWorld / gridStep) * gridStep;

    ctx.beginPath();
    for (let x = startX; x <= endX; x += gridStep) {
      const scr = this.worldToScreen(x, 0);
      ctx.moveTo(scr.x, 0);
      ctx.lineTo(scr.x, h);
    }
    for (let y = startY; y <= endY; y += gridStep) {
      const scr = this.worldToScreen(0, y);
      ctx.moveTo(0, scr.y);
      ctx.lineTo(w, scr.y);
    }
    ctx.stroke();

    // Ejes cartesianos
    const origin = this.worldToScreen(0, 0);
    ctx.beginPath();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = '#24324f';
    ctx.moveTo(0, origin.y);
    ctx.lineTo(w, origin.y);
    ctx.moveTo(origin.x, 0);
    ctx.lineTo(origin.x, h);
    ctx.stroke();

    ctx.restore();
  }

  render() {
    this.drawGrid();

    // RAMA 1: MODO ANIDADO (MÓDULO 4)
    if (this.viewMode === 'nesting') {
      if (this.nestingSheets && this.nestingSheets.length > 0) {
        this.nestingRenderer.renderSheets(
          this.ctx,
          this.nestingSheets,
          {
            activeSheetIndex: this.activeSheetIndex,
            hoveredPiece: this.hoveredNestingPiece,
            selectedPiece: this.selectedNestingPiece
          },
          (x, y) => this.worldToScreen(x, y)
        );
      } else {
        this.drawEmptyNestingState();
      }
      return;
    }

    // RAMA 2: MODO INGESTA CAD (MÓDULOS 1 & 2)
    // 1. Dibujar Plancha de fondo si está configurada
    if (this.showSheetPreview && this.sheet) {
      this.drawSheetPreview();
    }

    if ((!this.pieces || this.pieces.length === 0) && (!this.openContours || this.openContours.length === 0)) {
      if (!this.sheet) this.drawEmptyState();
      return;
    }

    // 2. Dibujar Piezas de entrada
    this.pieces.forEach((piece, idx) => {
      this.drawPiece(piece, idx);
    });

    // 3. Dibujar Contornos Abiertos
    if (this.openContours && this.openContours.length > 0) {
      this.openContours.forEach((open, idx) => {
        this.drawOpenContour(open, idx);
      });
    }
  }

  drawEmptyNestingState() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.font = '600 15px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Sin resultados de anidado. Haz clic en "▶ Iniciar Optimización".', w / 2, h / 2);
    ctx.restore();
  }

  drawSheetPreview() {
    const ctx = this.ctx;
    const s = this.sheet;
    const p1 = this.worldToScreen(0, 0);
    const p2 = this.worldToScreen(s.width, s.height);

    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    ctx.save();
    // Borde exterior de la chapa
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.4)';
    ctx.lineWidth = 1.8;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.6)';
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x, y, w, h);

    // Margen perimetral interior
    if (s.margin > 0 && s.width > s.margin * 2 && s.height > s.margin * 2) {
      const pm1 = this.worldToScreen(s.margin, s.margin);
      const pm2 = this.worldToScreen(s.width - s.margin, s.height - s.margin);
      const mx = Math.min(pm1.x, pm2.x);
      const my = Math.min(pm1.y, pm2.y);
      const mw = Math.abs(pm2.x - pm1.x);
      const mh = Math.abs(pm2.y - pm1.y);

      ctx.strokeStyle = 'rgba(245, 158, 11, 0.5)';
      ctx.lineWidth = 1.2;
      ctx.setLineDash([6, 6]);
      ctx.strokeRect(mx, my, mw, mh);
      ctx.setLineDash([]);
    }

    // Texto de cota de la plancha
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.fillText(`PLANCHA: ${s.width} x ${s.height} mm (Margen: ${s.margin} mm)`, x + 10, y + 20);

    ctx.restore();
  }

  drawPiece(piece, index) {
    const ctx = this.ctx;
    const color = this.palette[index % this.palette.length];
    const isSelected = piece.id === this.selectedPieceId;

    ctx.save();

    // Relleno Even-Odd
    ctx.beginPath();
    this.addContourToPath(piece.outerContour);
    if (piece.holes && piece.holes.length > 0) {
      for (const hole of piece.holes) {
        this.addContourToPath(hole);
      }
    }
    ctx.fillStyle = isSelected ? `${color}55` : `${color}28`;
    ctx.fill('evenodd');

    // Trazo Contorno Exterior
    ctx.beginPath();
    this.addContourToPath(piece.outerContour);
    ctx.strokeStyle = isSelected ? '#ffffff' : color;
    ctx.lineWidth = isSelected ? 2.5 : 1.8;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Trazo Agujeros Interiores
    if (piece.holes && piece.holes.length > 0) {
      for (const hole of piece.holes) {
        ctx.beginPath();
        this.addContourToPath(hole);
        ctx.strokeStyle = '#f87171';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }

    // Bounding Box y Cotas
    if (this.showBounds || isSelected) {
      this.drawBoundsAndDimensions(piece.bounds, color, isSelected);
    }

    // Vértices
    if (this.showVertices) {
      this.drawVertices(piece.outerContour, color);
      if (piece.holes) {
        piece.holes.forEach(h => this.drawVertices(h, '#f87171'));
      }
    }

    // Etiqueta con Multiplicador de Cantidad
    this.drawPieceLabel(piece, index);

    ctx.restore();
  }

  drawOpenContour(openContour, index) {
    const ctx = this.ctx;
    const pts = openContour.points;
    if (pts.length < 2) return;

    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([6, 4]);

    ctx.beginPath();
    const start = this.worldToScreen(pts[0].x, pts[0].y);
    ctx.moveTo(start.x, start.y);
    for (let i = 1; i < pts.length; i++) {
      const scr = this.worldToScreen(pts[i].x, pts[i].y);
      ctx.lineTo(scr.x, scr.y);
    }
    ctx.stroke();
    ctx.setLineDash([]);

    const end = this.worldToScreen(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(start.x, start.y, 5, 0, 2 * Math.PI);
    ctx.arc(end.x, end.y, 5, 0, 2 * Math.PI);
    ctx.fill();

    ctx.restore();
  }

  addContourToPath(contour) {
    if (!contour || contour.length === 0) return;
    const ctx = this.ctx;
    const start = this.worldToScreen(contour[0].x, contour[0].y);
    ctx.moveTo(start.x, start.y);

    for (let i = 1; i < contour.length; i++) {
      const pt = this.worldToScreen(contour[i].x, contour[i].y);
      ctx.lineTo(pt.x, pt.y);
    }
    ctx.closePath();
  }

  drawVertices(contour, color) {
    const ctx = this.ctx;
    ctx.fillStyle = color;
    for (const pt of contour) {
      const scr = this.worldToScreen(pt.x, pt.y);
      ctx.beginPath();
      ctx.arc(scr.x, scr.y, 2.5, 0, 2 * Math.PI);
      ctx.fill();
    }
  }

  drawBoundsAndDimensions(b, color, isSelected) {
    const ctx = this.ctx;
    const pMin = this.worldToScreen(b.minX, b.minY);
    const pMax = this.worldToScreen(b.maxX, b.maxY);

    const x = Math.min(pMin.x, pMax.x);
    const y = Math.min(pMin.y, pMax.y);
    const w = Math.abs(pMax.x - pMin.x);
    const h = Math.abs(pMax.y - pMin.y);

    ctx.save();
    ctx.strokeStyle = isSelected ? '#38bdf8' : 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(x, y, w, h);
    ctx.setLineDash([]);

    if (this.showDimensions) {
      ctx.font = '11px monospace';
      ctx.fillStyle = '#94a3b8';
      
      const widthText = `${b.width.toFixed(1)} mm`;
      ctx.fillText(widthText, x + w / 2 - 20, y + h + 14);

      const heightText = `${b.height.toFixed(1)} mm`;
      ctx.save();
      ctx.translate(x + w + 14, y + h / 2 + 10);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText(heightText, 0, 0);
      ctx.restore();
    }

    ctx.restore();
  }

  drawPieceLabel(piece, index) {
    const ctx = this.ctx;
    const b = piece.bounds;
    const center = this.worldToScreen((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    const qty = piece.quantity || 1;

    ctx.save();
    ctx.font = 'bold 12px Inter, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.8)';
    ctx.shadowBlur = 4;
    ctx.fillText(`P${index + 1} [x${qty}] (${(piece.area / 100).toFixed(1)} cm²)`, center.x, center.y);
    ctx.restore();
  }

  drawEmptyState() {
    const ctx = this.ctx;
    const w = this.canvas.width;
    const h = this.canvas.height;

    ctx.save();
    ctx.font = '15px Inter, sans-serif';
    ctx.fillStyle = '#64748b';
    ctx.textAlign = 'center';
    ctx.fillText('Arrastra archivos DXF o carga muestras para comenzar', w / 2, h / 2);
    ctx.restore();
  }
}
