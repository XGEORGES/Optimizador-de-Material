/**
 * Controlador Principal Integrado (Módulos 1 & 2).
 */

import { DxfGeometryExtractor } from './geometry/dxfExtractor.js';
import { CanvasViewer } from './ui/canvasViewer.js';
import { nestingStore } from './state/nestingStore.js';
import { InventoryView } from './ui/inventoryView.js';
import { DxfExporter } from './export/dxfExporter.js';

class AppController {
  constructor() {
    this.extractor = new DxfGeometryExtractor({ tolerance: 0.05 });
    this.init();
    this.initPWA();
  }

  initPWA() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
          .then(reg => console.log('✓ Service Worker PWA registrado con éxito:', reg.scope))
          .catch(err => console.warn('Error al registrar Service Worker PWA:', err));
      });
    }
  }

  init() {
    // 1. Inicializar Visor Canvas
    const canvas = document.getElementById('cadCanvas');
    this.viewer = new CanvasViewer(canvas);

    // 2. Inicializar Vista de Inventario
    const inventoryContainer = document.getElementById('inventoryList');
    const metricsElements = {
      uniquePieces: document.getElementById('metricUniquePieces'),
      totalPieces: document.getElementById('metricTotalPieces'),
      totalArea: document.getElementById('metricTotalArea'),
      sheetUsableArea: document.getElementById('metricSheetUsableArea'),
      minSheets: document.getElementById('metricMinSheets'),
      estYield: document.getElementById('metricEstYield')
    };
    this.inventoryView = new InventoryView(inventoryContainer, metricsElements);

    // 3. Suscribir Visor CAD a cambios en el Store
    nestingStore.subscribe((state) => {
      this.viewer.setData(state.pieces, state.openContours, state.sheet);
    });

    this.setupEventListeners();
    this.initStoreDefaults();
  }

  initStoreDefaults() {
    // Sincronizar estado inicial
    nestingStore.setSheetPreset('1200x2400');
    nestingStore.setSheetMargin(10);
    nestingStore.setSpacing(5);
    nestingStore.setRotationStep(15);
    nestingStore.setHoleNesting(true);
  }

  setupEventListeners() {
    // ==========================================
    // 1. FORMULARIOS DE PLANCHA (MÓDULO 2)
    // ==========================================
    const sheetPresetSelect = document.getElementById('sheetPreset');
    const customDimRow = document.getElementById('customSheetDimensions');
    const sheetCustomWidth = document.getElementById('sheetCustomWidth');
    const sheetCustomHeight = document.getElementById('sheetCustomHeight');
    const sheetMarginInput = document.getElementById('sheetMargin');

    sheetPresetSelect.addEventListener('change', (e) => {
      const preset = e.target.value;
      if (preset === 'custom') {
        customDimRow.style.display = 'grid';
        nestingStore.setSheetPreset('custom', sheetCustomWidth.value, sheetCustomHeight.value);
      } else {
        customDimRow.style.display = 'none';
        nestingStore.setSheetPreset(preset);
      }
    });

    const updateCustomDims = () => {
      nestingStore.setSheetDimensions(sheetCustomWidth.value, sheetCustomHeight.value);
    };
    sheetCustomWidth.addEventListener('input', updateCustomDims);
    sheetCustomHeight.addEventListener('input', updateCustomDims);

    sheetMarginInput.addEventListener('input', (e) => {
      nestingStore.setSheetMargin(e.target.value);
    });

    // ==========================================
    // 2. PARÁMETROS DE CORTE (MÓDULO 2)
    // ==========================================
    const partSpacingInput = document.getElementById('partSpacing');
    const rotationStepSlider = document.getElementById('rotationStep');
    const rotationStepBadge = document.getElementById('rotationStepBadge');
    const holeNestingToggle = document.getElementById('holeNestingToggle');

    partSpacingInput.addEventListener('input', (e) => {
      nestingStore.setSpacing(e.target.value);
    });

    rotationStepSlider.addEventListener('input', (e) => {
      const val = e.target.value;
      rotationStepBadge.textContent = `${val}°`;
      nestingStore.setRotationStep(val);
    });

    holeNestingToggle.addEventListener('change', (e) => {
      nestingStore.setHoleNesting(e.target.checked);
    });

    // ==========================================
    // 3. INGESTA DXF (MÓDULO 1)
    // ==========================================
    const dropzone = document.getElementById('dropzone');
    const fileInput = document.getElementById('fileInput');

    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    dropzone.addEventListener('dragleave', () => {
      dropzone.classList.remove('dragover');
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropzone.classList.remove('dragover');
      if (e.dataTransfer.files.length > 0) {
        this.handleFiles(e.dataTransfer.files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.handleFiles(e.target.files);
      }
    });

    // ==========================================
    // 4. CONTROLES DE CANVAS
    // ==========================================
    document.getElementById('btnZoomFit').addEventListener('click', () => {
      this.viewer.zoomToFit();
    });

    document.getElementById('btnToggleVertices').addEventListener('click', () => {
      this.viewer.showVertices = !this.viewer.showVertices;
      this.viewer.render();
    });

    document.getElementById('btnToggleBounds').addEventListener('click', () => {
      this.viewer.showBounds = !this.viewer.showBounds;
      this.viewer.render();
    });

    document.getElementById('btnToggleSheet').addEventListener('click', () => {
      this.viewer.showSheetPreview = !this.viewer.showSheetPreview;
      this.viewer.render();
    });

    document.getElementById('btnClearAll').addEventListener('click', () => {
      nestingStore.clearAll();
      nestingStore.clearNestingResult();
    });

    // ==========================================
    // 5. MOTOR DE NESTING WEB WORKER & VISTA (MÓDULOS 3 & 4)
    // ==========================================
    const btnStartNesting = document.getElementById('btnStartNesting');
    const btnStopNesting = document.getElementById('btnStopNesting');
    const progressContainer = document.getElementById('nestingProgressContainer');
    const statusLabel = document.getElementById('nestingStatusLabel');
    const percentLabel = document.getElementById('nestingPercentLabel');
    const progressBar = document.getElementById('nestingProgressBar');
    const summaryText = document.getElementById('nestingSummaryText');

    // Selector de Modo de Vista (Módulo 4)
    const btnViewIngest = document.getElementById('btnViewIngest');
    const btnViewNesting = document.getElementById('btnViewNesting');
    const sheetTabBar = document.getElementById('sheetTabBar');
    const canvasTooltip = document.getElementById('canvasTooltip');

    btnViewIngest.addEventListener('click', () => {
      this.setViewMode('ingest');
    });

    btnViewNesting.addEventListener('click', () => {
      this.setViewMode('nesting');
    });

    // Tooltip & Selección Interactiva en Canvas
    this.viewer.onPieceHover = (hit, mouseX, mouseY) => {
      if (!hit) {
        canvasTooltip.style.display = 'none';
        return;
      }

      const p = hit.piece;
      const b = hit.bounds;
      const areaCm2 = (p.area / 100).toFixed(1);
      const isHole = p.inHoleOf ? `<span style="color:#f472b6;">En agujero de ${p.inHoleOf}</span>` : 'Superficie de plancha';

      canvasTooltip.style.display = 'flex';
      canvasTooltip.style.left = `${mouseX + 15}px`;
      canvasTooltip.style.top = `${mouseY + 15}px`;
      canvasTooltip.innerHTML = `
        <div class="tooltip-title">${p.pieceId}</div>
        <div class="tooltip-row"><span>Posición (X, Y):</span> <strong>${p.x}, ${p.y} mm</strong></div>
        <div class="tooltip-row"><span>Rotación (θ):</span> <strong>${p.rotation}°</strong></div>
        <div class="tooltip-row"><span>Dimensiones:</span> <strong>${b.width.toFixed(1)} × ${b.height.toFixed(1)} mm</strong></div>
        <div class="tooltip-row"><span>Área Neta:</span> <strong>${areaCm2} cm²</strong></div>
        <div class="tooltip-row"><span>Ubicación:</span> <strong>${isHole}</strong></div>
      `;
    };

    btnStartNesting.addEventListener('click', () => {
      this.startNesting();
    });

    btnStopNesting.addEventListener('click', () => {
      this.stopNesting();
    });

    // Botón de Descarga DXF (Módulo 5)
    const btnDownloadDxf = document.getElementById('btnDownloadDxf');
    btnDownloadDxf.addEventListener('click', () => {
      const state = nestingStore.getState();
      if (state.nestingResult && state.nestingResult.sheets.length > 0) {
        DxfExporter.downloadDxf(state.nestingResult);
      }
    });

    // Suscribir UI a cambios de estado de anidado
    nestingStore.subscribe((state) => {
      if (state.nestingStatus === 'running') {
        btnStartNesting.style.display = 'none';
        btnStopNesting.style.display = 'inline-flex';
        btnDownloadDxf.disabled = true;
        progressContainer.style.display = 'flex';
        
        const prog = state.nestingProgress;
        const pct = prog.totalCount > 0 ? Math.round((prog.placedCount / prog.totalCount) * 100) : 0;
        statusLabel.textContent = `Optimizando (${prog.placedCount}/${prog.totalCount} piezas)...`;
        percentLabel.textContent = `${pct}%`;
        progressBar.style.width = `${pct}%`;
        summaryText.textContent = `Planchas: ${prog.sheetsUsed} | Merma actual: ${prog.wastePercent}%`;

        // Renderizado en tiempo real de layouts candidatos
        if (prog.candidateLayout && prog.candidateLayout.sheets) {
          this.viewer.setNestingData(prog.candidateLayout.sheets);
          this.updateSheetTabs(prog.candidateLayout.sheets);
        }
      } else if (state.nestingStatus === 'completed') {
        btnStartNesting.style.display = 'inline-flex';
        btnStopNesting.style.display = 'none';
        btnDownloadDxf.disabled = false;
        progressContainer.style.display = 'flex';
        
        const res = state.nestingResult;
        statusLabel.textContent = `✓ Optimización Completa`;
        percentLabel.textContent = `100%`;
        progressBar.style.width = `100%`;
        summaryText.textContent = `${res.totalPlaced}/${res.totalCount} piezas en ${res.sheets.length} plancha(s) (${res.executionTime} ms) | Merma: ${res.totalWaste}%`;

        this.viewer.setNestingData(res.sheets);
        this.updateSheetTabs(res.sheets);
        this.updatePostOptimizationMetrics(res);
      } else if (state.nestingStatus === 'stopped') {
        btnStartNesting.style.display = 'inline-flex';
        btnStopNesting.style.display = 'none';
        btnDownloadDxf.disabled = !(state.nestingResult && state.nestingResult.sheets.length > 0);
        statusLabel.textContent = `⏹ Detenido por el usuario`;
      } else {
        btnStartNesting.style.display = 'inline-flex';
        btnStopNesting.style.display = 'none';
        btnDownloadDxf.disabled = true;
        progressContainer.style.display = 'none';
        sheetTabBar.style.display = 'none';
      }
    });
  }

  setViewMode(mode) {
    this.viewer.setViewMode(mode);
    const btnIngest = document.getElementById('btnViewIngest');
    const btnNesting = document.getElementById('btnViewNesting');
    const sheetTabBar = document.getElementById('sheetTabBar');

    if (mode === 'nesting') {
      btnNesting.classList.add('active');
      btnIngest.classList.remove('active');
      const state = nestingStore.getState();
      if (state.nestingResult && state.nestingResult.sheets.length > 0) {
        sheetTabBar.style.display = 'flex';
      }
    } else {
      btnIngest.classList.add('active');
      btnNesting.classList.remove('active');
      sheetTabBar.style.display = 'none';
    }
  }

  updateSheetTabs(sheets) {
    const sheetTabBar = document.getElementById('sheetTabBar');
    if (!sheets || sheets.length === 0) {
      sheetTabBar.style.display = 'none';
      return;
    }

    if (this.viewer.viewMode === 'nesting') {
      sheetTabBar.style.display = 'flex';
    }

    sheetTabBar.innerHTML = '';

    sheets.forEach((sheet, idx) => {
      const btn = document.createElement('button');
      btn.className = `sheet-tab-btn ${this.viewer.activeSheetIndex === idx ? 'active' : ''}`;
      const occupancy = (100 - sheet.wastePercent).toFixed(1);
      btn.textContent = `Plancha ${idx + 1} (${occupancy}%)`;
      btn.addEventListener('click', () => {
        document.querySelectorAll('.sheet-tab-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        this.viewer.setActiveSheetIndex(idx);
      });
      sheetTabBar.appendChild(btn);
    });

    if (sheets.length > 1) {
      const btnAll = document.createElement('button');
      btnAll.className = `sheet-tab-btn ${this.viewer.activeSheetIndex === 'all' ? 'active' : ''}`;
      btnAll.textContent = `☷ Ver Todas (${sheets.length})`;
      btnAll.addEventListener('click', () => {
        document.querySelectorAll('.sheet-tab-btn').forEach(b => b.classList.remove('active'));
        btnAll.classList.add('active');
        this.viewer.setActiveSheetIndex('all');
      });
      sheetTabBar.appendChild(btnAll);
    }
  }

  updatePostOptimizationMetrics(result) {
    const minSheetsElem = document.getElementById('metricMinSheets');
    const estYieldElem = document.getElementById('metricEstYield');
    const totalPiecesElem = document.getElementById('metricTotalPieces');

    if (minSheetsElem) {
      minSheetsElem.textContent = `${result.sheets.length} plancha(s) usadas`;
    }
    if (estYieldElem) {
      const efficiency = (100 - result.totalWaste).toFixed(1);
      estYieldElem.textContent = `${efficiency}% útil (${result.totalWaste}% merma)`;
    }
    if (totalPiecesElem) {
      totalPiecesElem.textContent = `${result.totalPlaced}/${result.totalCount}`;
      if (result.totalPlaced < result.totalCount) {
        totalPiecesElem.style.color = '#ef4444';
      } else {
        totalPiecesElem.style.color = '#06b6d4';
      }
    }
  }

  startNesting() {
    const state = nestingStore.getState();
    if (state.pieces.length === 0) {
      alert('No hay piezas en el inventario. Carga o genera piezas antes de optimizar.');
      return;
    }

    // Cambiar automáticamente a modo Nesting
    this.setViewMode('nesting');

    const job = nestingStore.compileNestingJob();

    if (!this.worker) {
      this.worker = new Worker(new URL('./nesting/nesting.worker.js', import.meta.url), { type: 'module' });
      this.worker.addEventListener('message', (e) => this.handleWorkerMessage(e.data));
      this.worker.addEventListener('error', (err) => {
        console.error('Error en Web Worker:', err);
        nestingStore.setNestingStatus('error');
        alert(`Error en Web Worker: ${err.message}`);
      });
    }

    nestingStore.setNestingStatus('running');
    this.worker.postMessage({
      type: 'START_NESTING',
      payload: job
    });
  }

  stopNesting() {
    if (this.worker) {
      this.worker.postMessage({ type: 'STOP_NESTING' });
      nestingStore.setNestingStatus('stopped');
    }
  }

  handleWorkerMessage(msg) {
    const { type, data, error } = msg;

    switch (type) {
      case 'NESTING_PROGRESS':
        nestingStore.setNestingProgress(data);
        break;

      case 'NESTING_COMPLETE':
        nestingStore.setNestingResult(data);
        break;

      case 'NESTING_ERROR':
        nestingStore.setNestingStatus('error');
        alert(`Error durante la optimización: ${error}`);
        break;
    }
  }

  async handleFiles(files) {
    for (const file of files) {
      if (file.name.toLowerCase().endsWith('.dxf')) {
        try {
          const text = await file.text();
          this.parseDxfString(text, file.name);
        } catch (err) {
          console.error('Error al leer DXF:', file.name, err);
          alert(`Error procesando ${file.name}: ${err.message}`);
        }
      } else {
        alert(`El archivo "${file.name}" no es un .DXF válido.`);
      }
    }
  }

  parseDxfString(dxfContent, fileName) {
    try {
      const parser = new window.DxfParser();
      const parsed = parser.parseSync(dxfContent);

      const { pieces, openContours } = this.extractor.extractPieces(parsed, fileName);

      if (pieces.length === 0 && openContours.length === 0) {
        alert(`No se detectó geometría procesable en ${fileName}.`);
        return;
      }

      // Agregar directamente al Store Central
      nestingStore.addPieces(pieces, openContours);

      if (openContours.length > 0) {
        const alertsContainer = document.getElementById('openContoursAlert');
        alertsContainer.style.display = 'block';
        alertsContainer.innerHTML = `
          <strong>⚠ Atención:</strong> Se detectaron ${openContours.length} contorno(s) no cerrado(s) en "${fileName}". 
          Han sido resaltados en rojo y excluidos del inventario de corte.
        `;
        setTimeout(() => { alertsContainer.style.display = 'none'; }, 8000);
      }

    } catch (err) {
      console.error('Error al parsear DXF:', err);
      alert(`Error de parseo DXF: ${err.message}`);
    }
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new AppController();
});
