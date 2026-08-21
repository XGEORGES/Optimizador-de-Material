/**
 * Controlador de la Vista de Inventario de Piezas y Métricas (Módulo 2).
 */

import { nestingStore } from '../state/nestingStore.js';
import { renderPieceSvgThumbnail } from './thumbnailRenderer.js';
import { HologramCube } from './hologramViewer.js';

export class InventoryView {
  constructor(containerElement, metricsElements) {
    this.container = containerElement;
    this.metricsElements = metricsElements;
    this.hologram = null;

    // Suscribirse a cambios del Store
    nestingStore.subscribe((state) => {
      this.render(state);
      this.updateMetrics(state.metrics);
    });
  }

  render(state) {
    const pieces = state.pieces;

    // Destruir holograma previo si existe
    if (this.hologram) {
      this.hologram.destroy();
      this.hologram = null;
    }

    this.container.innerHTML = '';

    if (pieces.length === 0) {
      this.container.innerHTML = `
        <div class="empty-inventory-container">
          <div id="hologram-container" class="hologram-box"></div>
          <div class="empty-inventory-title">SISTEMA EN ESPERA</div>
          <p class="empty-inventory-desc">
            No hay piezas en el inventario.<br>Arrastra o carga archivos <strong>.DXF</strong> para iniciar el análisis.
          </p>
        </div>
      `;
      // Iniciar Cubo Holográfico 3D
      const holoEl = document.getElementById('hologram-container');
      if (holoEl) {
        this.hologram = new HologramCube(holoEl);
      }
      return;
    }

    // Agrupar piezas por archivo de origen para permitir multiplicadores por archivo
    const filesMap = new Map();
    for (const p of pieces) {
      if (!filesMap.has(p.sourceFileName)) {
        filesMap.set(p.sourceFileName, []);
      }
      filesMap.get(p.sourceFileName).push(p);
    }

    // Renderizar por grupos de archivo
    filesMap.forEach((filePieces, fileName) => {
      const fileHeader = document.createElement('div');
      fileHeader.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.4rem 0.2rem;
        border-bottom: 1px solid var(--border-color);
        margin-top: 0.5rem;
      `;
      fileHeader.innerHTML = `
        <div style="font-size: 0.78rem; font-weight: 600; color: #38bdf8; display: flex; align-items: center; gap: 4px;">
          📄 ${fileName} (${filePieces.length} piezas)
        </div>
        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="btn btn-secondary btn-sm btn-mult-file" data-file="${fileName}" style="padding: 2px 6px; font-size: 0.7rem;" title="Multiplicar cantidades de este archivo">
            Multiplicar ×
          </button>
        </div>
      `;
      this.container.appendChild(fileHeader);

      // Renderizar tarjetas de cada pieza del archivo
      filePieces.forEach((piece) => {
        const card = document.createElement('div');
        card.className = 'inventory-card';
        card.dataset.id = piece.id;

        const bounds = piece.localBounds || piece.bounds;
        const netAreaCm2 = (piece.area / 100).toFixed(1);
        const holesCount = piece.holes ? piece.holes.length : 0;

        card.innerHTML = `
          <div class="piece-thumbnail-box">
            ${renderPieceSvgThumbnail(piece, 60)}
          </div>
          <div class="piece-details">
            <div class="piece-name" title="${piece.id}">${piece.id}</div>
            <div class="piece-subinfo">Dim: <strong>${bounds.width.toFixed(1)} × ${bounds.height.toFixed(1)} mm</strong></div>
            <div class="piece-subinfo">Área: <strong>${netAreaCm2} cm²</strong> | Agujeros: <strong>${holesCount}</strong></div>
          </div>
          <div class="piece-actions">
            <div class="qty-control">
              <button class="qty-btn btn-dec" data-id="${piece.id}">-</button>
              <input type="number" class="qty-input" data-id="${piece.id}" value="${piece.quantity || 1}" min="1" max="9999">
              <button class="qty-btn btn-inc" data-id="${piece.id}">+</button>
            </div>
            <button class="btn btn-danger btn-sm btn-remove-piece" data-id="${piece.id}" style="padding: 2px 6px; font-size: 0.7rem;">
              🗑 Quitar
            </button>
          </div>
        `;

        this.setupCardEvents(card, piece);
        this.container.appendChild(card);
      });
    });

    // Eventos de multiplicador por archivo
    this.container.querySelectorAll('.btn-mult-file').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const fileName = e.currentTarget.dataset.file;
        const factorStr = prompt(`Multiplicar cantidades de todas las piezas de "${fileName}" por:`, "2");
        if (factorStr) {
          const factor = parseInt(factorStr, 10);
          if (!isNaN(factor) && factor > 0) {
            nestingStore.multiplyFileQuantity(fileName, factor);
          }
        }
      });
    });
  }

  setupCardEvents(card, piece) {
    // Selección visual
    card.addEventListener('click', (e) => {
      if (e.target.closest('button') || e.target.closest('input')) return;
      document.querySelectorAll('.inventory-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      if (window.app && window.app.viewer) {
        window.app.viewer.selectPiece(piece.id);
      }
    });

    // Incrementar cantidad
    card.querySelector('.btn-inc').addEventListener('click', () => {
      nestingStore.setPieceQuantity(piece.id, (piece.quantity || 1) + 1);
    });

    // Decrementar cantidad
    card.querySelector('.btn-dec').addEventListener('click', () => {
      nestingStore.setPieceQuantity(piece.id, Math.max(1, (piece.quantity || 1) - 1));
    });

    // Cambio manual de input
    const input = card.querySelector('.qty-input');
    input.addEventListener('change', (e) => {
      const val = parseInt(e.target.value, 10);
      nestingStore.setPieceQuantity(piece.id, isNaN(val) ? 1 : val);
    });

    // Eliminar pieza
    card.querySelector('.btn-remove-piece').addEventListener('click', () => {
      nestingStore.removePiece(piece.id);
    });
  }

  updateMetrics(m) {
    if (!this.metricsElements) return;

    if (this.metricsElements.uniquePieces) {
      this.metricsElements.uniquePieces.textContent = m.uniquePieces;
    }
    if (this.metricsElements.totalPieces) {
      this.metricsElements.totalPieces.textContent = m.totalPiecesCount;
    }
    if (this.metricsElements.totalArea) {
      this.metricsElements.totalArea.textContent = `${m.totalPiecesAreaM2} m²`;
    }
    if (this.metricsElements.sheetUsableArea) {
      this.metricsElements.sheetUsableArea.textContent = `${m.sheetUsableAreaM2} m²`;
    }
    if (this.metricsElements.minSheets) {
      this.metricsElements.minSheets.textContent = `${m.minEstimatedSheets} plancha(s)`;
    }
    if (this.metricsElements.estYield) {
      this.metricsElements.estYield.textContent = `${m.theoreticalYieldPercent}%`;
    }
  }
}
