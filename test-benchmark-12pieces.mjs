/**
 * Test de Benchmark de 12 Piezas Complejas (Lote de producción con rotaciones y agujeros).
 * Verifica que el anidado de 12 piezas se ejecute en menos de 2 segundos.
 */

import { discretizeArc } from './src/geometry/math.js';
import { NestingEngine } from './src/nesting/nestingEngine.js';

console.log('================================================================');
console.log('  BENCHMARK: 12 PIEZAS COMPLEJAS CON PUNTOS DE ANCLAJE');
console.log('================================================================\n');

function createCurvedPiece(id, w, h, r) {
  const arcTop = discretizeArc(w / 2, h / 2, r, 0, Math.PI, true, 0.02);
  const arcHole = discretizeArc(w / 2, h / 2, r / 2, 0, 2 * Math.PI, true, 0.02);
  
  const outer = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h / 2 },
    ...arcTop,
    { x: 0, y: h / 2 },
    { x: 0, y: 0 }
  ];

  return {
    pieceId: id,
    sourceFileName: 'Parts12.dxf',
    quantity: 1,
    area: w * (h / 2) + (Math.PI * r * r) / 2 - Math.PI * (r / 2) * (r / 2),
    outerContour: outer,
    holes: [arcHole],
    bounds: { minX: 0, minY: 0, maxX: w, maxY: h, width: w, height: h }
  };
}

// 12 piezas con diferentes geometrías y dimensiones
const batch12 = [
  createCurvedPiece('BRACKET-1', 250, 180, 40),
  createCurvedPiece('BRACKET-2', 250, 180, 40),
  createCurvedPiece('BRACKET-3', 250, 180, 40),
  createCurvedPiece('BRACKET-4', 250, 180, 40),
  createCurvedPiece('FLANGE-1', 180, 150, 30),
  createCurvedPiece('FLANGE-2', 180, 150, 30),
  createCurvedPiece('FLANGE-3', 180, 150, 30),
  createCurvedPiece('FLANGE-4', 180, 150, 30),
  createCurvedPiece('ARM-1', 320, 120, 35),
  createCurvedPiece('ARM-2', 320, 120, 35),
  createCurvedPiece('ARM-3', 320, 120, 35),
  createCurvedPiece('ARM-4', 320, 120, 35)
];

const totalVertices = batch12.reduce((acc, p) => acc + p.outerContour.length + p.holes[0].length, 0);
console.log(`Lote a procesar: ${batch12.length} piezas complejas con ${totalVertices} vértices totales.`);

const job = {
  sheet: { width: 1500, height: 1000, margin: 10 },
  settings: { spacing: 5, rotationStep: 15, holeNesting: true },
  items: batch12
};

let progressUpdates = 0;
const engine = new NestingEngine(job, {
  onProgress: (p) => {
    progressUpdates++;
    console.log(`  [Progreso] Pieza colocada ${p.placedCount}/${p.totalCount} (Planchas: ${p.sheetsUsed}, Desperdicio: ${p.wastePercent}%)`);
  }
});

const start = performance.now();
const result = await engine.run();
const elapsed = performance.now() - start;

console.log(`\n================================================================`);
console.log(`  RESULTADOS DEL BENCHMARK`);
console.log(`================================================================`);
console.log(`- Total piezas procesadas: ${result.totalPlaced} de ${result.totalCount}`);
console.log(`- Planchas utilizadas: ${result.sheets.length}`);
console.log(`- Desperdicio global: ${result.totalWaste}%`);
console.log(`- Actualizaciones de progreso enviadas a la UI: ${progressUpdates}`);
console.log(`- Tiempo total de ejecución: ${elapsed.toFixed(2)} ms (${(elapsed / 1000).toFixed(2)} s)`);

if (elapsed < 2000) {
  console.log(`\n✓ OBJETIVO CUMPLIDO: Las 12 piezas se anidaron en ${(elapsed / 1000).toFixed(2)} s (< 2.0 segundos).`);
} else {
  console.log(`\n✗ FALLO: El tiempo excedió los 2.0 segundos.`);
}
