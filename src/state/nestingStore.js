/**
 * Central State Store para el Optimizador de Corte y Anidado 2D.
 * Gestiona el inventario de piezas, configuración de planchas,
 * parámetros de corte y compila el objeto 'NestingJob'.
 */

class NestingStore {
  constructor() {
    this.subscribers = new Set();

    // 1. Configuración de Plancha (Sheet Config)
    this.sheet = {
      preset: '1200x2400',
      width: 2400,   // Ancho en mm
      height: 1200,  // Alto en mm
      margin: 10     // Margen perimetral en mm
    };

    // 2. Parámetros de Corte (Cutting Settings)
    this.settings = {
      spacing: 5,        // Distancia mínima entre piezas (mm)
      rotationStep: 90,  // Paso de rotación en grados (1..90)
      holeNesting: true  // Permitir anidado dentro de agujeros
    };

    // 3. Inventario de Piezas
    this.pieces = []; // Array de PieceModel (con quantity, thumbnail, etc.)
    this.openContours = [];

    // 4. Estado de Ejecución del Motor de Anidado (Módulo 3)
    this.nestingStatus = 'idle'; // 'idle' | 'running' | 'completed' | 'stopped' | 'error'
    this.nestingProgress = {
      currentIteration: 0,
      placedCount: 0,
      totalCount: 0,
      sheetsUsed: 0,
      wastePercent: 0,
      candidateLayout: null
    };
    this.nestingResult = null; // { sheets, unplacedPieces, totalPlaced, totalCount, totalWaste, executionTime }
  }

  /**
   * Suscripción a cambios del store (Patrón Observer)
   */
  subscribe(callback) {
    this.subscribers.add(callback);
    return () => this.subscribers.delete(callback);
  }

  notify() {
    for (const callback of this.subscribers) {
      try {
        callback(this.getState());
      } catch (err) {
        console.error('Error en suscriptor de NestingStore:', err);
      }
    }
  }

  getState() {
    return {
      sheet: { ...this.sheet },
      settings: { ...this.settings },
      pieces: [...this.pieces],
      openContours: [...this.openContours],
      metrics: this.computeMetrics(),
      nestingJob: this.compileNestingJob(),
      nestingStatus: this.nestingStatus,
      nestingProgress: { ...this.nestingProgress },
      nestingResult: this.nestingResult ? { ...this.nestingResult } : null
    };
  }

  // ==========================================
  // ESTADO DE EJECUCIÓN DE NESTING (MÓDULO 3)
  // ==========================================

  setNestingStatus(status) {
    this.nestingStatus = status;
    this.notify();
  }

  setNestingProgress(progressData) {
    this.nestingProgress = { ...this.nestingProgress, ...progressData };
    this.notify();
  }

  setNestingResult(result) {
    this.nestingStatus = 'completed';
    this.nestingResult = result;
    this.notify();
  }

  clearNestingResult() {
    this.nestingStatus = 'idle';
    this.nestingProgress = {
      currentIteration: 0,
      placedCount: 0,
      totalCount: 0,
      sheetsUsed: 0,
      wastePercent: 0,
      candidateLayout: null
    };
    this.nestingResult = null;
    this.notify();
  }

  // ==========================================
  // MÉTODOS DE CONFIGURACIÓN DE PLANCHA
  // ==========================================

  setSheetPreset(preset, customWidth = 2400, customHeight = 1200) {
    this.sheet.preset = preset;
    if (preset === '1200x2400') {
      this.sheet.width = 2400;
      this.sheet.height = 1200;
    } else if (preset === '1500x3000') {
      this.sheet.width = 3000;
      this.sheet.height = 1500;
    } else if (preset === 'custom') {
      this.sheet.width = Math.max(100, Number(customWidth) || 2400);
      this.sheet.height = Math.max(100, Number(customHeight) || 1200);
    }
    this.notify();
  }

  setSheetDimensions(width, height) {
    this.sheet.preset = 'custom';
    this.sheet.width = Math.max(50, Number(width) || 100);
    this.sheet.height = Math.max(50, Number(height) || 100);
    this.notify();
  }

  setSheetMargin(margin) {
    this.sheet.margin = Math.max(0, Number(margin) || 0);
    this.notify();
  }

  // ==========================================
  // MÉTODOS DE PARÁMETROS DE CORTE
  // ==========================================

  setSpacing(spacing) {
    this.settings.spacing = Math.max(0, Number(spacing) || 0);
    this.notify();
  }

  setRotationStep(step) {
    this.settings.rotationStep = Math.min(360, Math.max(1, Math.round(Number(step) || 15)));
    this.notify();
  }

  setHoleNesting(enabled) {
    this.settings.holeNesting = Boolean(enabled);
    this.notify();
  }

  // ==========================================
  // MÉTODOS DE INVENTARIO DE PIEZAS
  // ==========================================

  addPieces(newPieces, openContours = []) {
    for (const p of newPieces) {
      // Asegurar que tenga cantidad inicial 1 si no está definida
      const pieceWithQty = {
        ...p,
        quantity: p.quantity || 1
      };
      this.pieces.push(pieceWithQty);
    }
    if (openContours && openContours.length > 0) {
      this.openContours.push(...openContours);
    }
    this.notify();
  }

  setPieceQuantity(pieceId, quantity) {
    const piece = this.pieces.find(p => p.id === pieceId);
    if (piece) {
      piece.quantity = Math.max(1, Math.floor(Number(quantity) || 1));
      this.notify();
    }
  }

  multiplyFileQuantity(sourceFileName, factor) {
    const mult = Math.max(1, Math.floor(Number(factor) || 1));
    for (const piece of this.pieces) {
      if (piece.sourceFileName === sourceFileName) {
        piece.quantity *= mult;
      }
    }
    this.notify();
  }

  removePiece(pieceId) {
    this.pieces = this.pieces.filter(p => p.id !== pieceId);
    this.notify();
  }

  clearAll() {
    this.pieces = [];
    this.openContours = [];
    this.notify();
  }

  // ==========================================
  // MÉTRICAS PREVIAS Y VALIDACIÓN
  // ==========================================

  computeMetrics() {
    const uniquePieces = this.pieces.length;
    let totalPiecesCount = 0;
    let totalPiecesAreaMm2 = 0;

    for (const p of this.pieces) {
      const qty = p.quantity || 1;
      totalPiecesCount += qty;
      totalPiecesAreaMm2 += (p.area * qty);
    }

    // Área neta en m² (1 m² = 1,000,000 mm²)
    const totalPiecesAreaM2 = totalPiecesAreaMm2 / 1_000_000;

    // Dimensiones útiles de la plancha descontando márgenes
    const usableW = Math.max(0, this.sheet.width - 2 * this.sheet.margin);
    const usableH = Math.max(0, this.sheet.height - 2 * this.sheet.margin);
    const sheetUsableAreaMm2 = usableW * usableH;
    const sheetGrossAreaMm2 = this.sheet.width * this.sheet.height;

    const sheetUsableAreaM2 = sheetUsableAreaMm2 / 1_000_000;
    const sheetGrossAreaM2 = sheetGrossAreaMm2 / 1_000_000;

    // Estimación teórica mínima de planchas
    const minEstimatedSheets = sheetUsableAreaMm2 > 0 && totalPiecesCount > 0
      ? Math.ceil(totalPiecesAreaMm2 / sheetUsableAreaMm2)
      : 0;

    // Ocupación teórica ideal (%)
    const theoreticalYieldPercent = (minEstimatedSheets > 0 && sheetUsableAreaMm2 > 0)
      ? Number(((totalPiecesAreaMm2 / (minEstimatedSheets * sheetGrossAreaMm2)) * 100).toFixed(1))
      : 0;

    return {
      uniquePieces,
      totalPiecesCount,
      totalPiecesAreaMm2: Number(totalPiecesAreaMm2.toFixed(2)),
      totalPiecesAreaM2: Number(totalPiecesAreaM2.toFixed(3)),
      sheetUsableAreaMm2: Number(sheetUsableAreaMm2.toFixed(2)),
      sheetUsableAreaM2: Number(sheetUsableAreaM2.toFixed(3)),
      sheetGrossAreaM2: Number(sheetGrossAreaM2.toFixed(3)),
      minEstimatedSheets,
      theoreticalYieldPercent
    };
  }

  /**
   * Compila el objeto final estándar 'NestingJob' para los siguientes módulos
   */
  compileNestingJob() {
    return {
      sheet: {
        width: this.sheet.width,
        height: this.sheet.height,
        margin: this.sheet.margin
      },
      settings: {
        spacing: this.settings.spacing,
        rotationStep: this.settings.rotationStep,
        holeNesting: this.settings.holeNesting
      },
      items: this.pieces.map(p => ({
        pieceId: p.id,
        sourceFileName: p.sourceFileName,
        quantity: p.quantity,
        area: p.area,
        // Geometría normalizada en mm
        outerContour: p.localOuterContour || p.outerContour,
        holes: p.localHoles || p.holes || [],
        bounds: p.localBounds || p.bounds
      }))
    };
  }
}

// Singleton global exportable
export const nestingStore = new NestingStore();
