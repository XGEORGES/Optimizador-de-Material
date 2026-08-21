/**
 * Test de Rendimiento y Benchmark para Piezas Complejas (Curvas, Arcos y Splines).
 * Valida que un lote de 9 piezas con curvas se resuelva en pocos milisegundos sin congelar el hilo.
 */

import { discretizeArc, discretizeSpline } from './src/geometry/math.js';
import { NestingEngine } from './src/nesting/nestingEngine.js';

console.log('================================================================');
console.log('  BENCHMARK DE RENDIMIENTO: PIEZAS CON CURVAS Y SPLINES');
console.log('================================================================\n');

// 1. Generar piezas sintéticas de alta densidad de vértices (arcos y splines)
function createCurvedBracketPiece(id) {
  const arcTop = discretizeArc(150, 150, 50, 0, Math.PI, true, 0.02);
  const arcHole = discretizeArc(150, 150, 20, 0, 2 * Math.PI, true, 0.02);
  
  const outer = [
    { x: 0, y: 0 },
    { x: 300, y: 0 },
    { x: 300, y: 100 },
    ...arcTop,
    { x: 0, y: 100 },
    { x: 0, y: 0 }
  ];

  return {
    pieceId: id,
    sourceFileName: 'CurvedBrackets.dxf',
    quantity: 1,
    area: 300 * 100 + (Math.PI * 50 * 50) / 2 - Math.PI * 20 * 20,
    outerContour: outer,
    holes: [arcHole],
    bounds: { minX: 0, minY: 0, maxX: 300, maxY: 200, width: 300, height: 200 }
  };
}

function createOvalPiece(id) {
  const oval = discretizeArc(100, 60, 60, 0, 2 * Math.PI, true, 0.02);
  const hole = discretizeArc(100, 60, 15, 0, 2 * Math.PI, true, 0.02);

  return {
    pieceId: id,
    sourceFileName: 'Ovals.dxf',
    quantity: 1,
    area: Math.PI * 60 * 60 - Math.PI * 15 * 15,
    outerContour: oval,
    holes: [hole],
    bounds: { minX: 40, minY: 0, maxX: 160, maxY: 120, width: 120, height: 120 }
  };
}

// Crear lote de 9 piezas con curvas (5 brackets + 4 óvalos)
const complexItems = [
  createCurvedBracketPiece('BRACKET-ARC-1'),
  createCurvedBracketPiece('BRACKET-ARC-2'),
  createCurvedBracketPiece('BRACKET-ARC-3'),
  createCurvedBracketPiece('BRACKET-ARC-4'),
  createCurvedBracketPiece('BRACKET-ARC-5'),
  createOvalPiece('OVAL-PART-1'),
  createOvalPiece('OVAL-PART-2'),
  createOvalPiece('OVAL-PART-3'),
  createOvalPiece('OVAL-PART-4')
];

const totalVertices = complexItems.reduce((acc, p) => acc + p.outerContour.length + p.holes[0].length, 0);
console.log(`Lote de prueba: ${complexItems.length} piezas complejas con ${totalVertices} vértices totales.`);

const job = {
  sheet: { width: 1500, height: 1000, margin: 10 },
  settings: { spacing: 5, rotationStep: 15, holeNesting: true },
  items: complexItems
};

const engine = new NestingEngine(job);
const start = performance.now();
const result = await engine.run();
const elapsed = performance.now() - start;

console.log(`\nResultados del Benchmark:`);
console.log(`- Piezas procesadas: ${result.totalPlaced} de ${result.totalCount}`);
console.log(`- Planchas utilizadas: ${result.sheets.length}`);
console.log(`- Desperdicio global: ${result.totalWaste}%`);
console.log(`- Tiempo total de cálculo del motor: ${elapsed.toFixed(2)} ms`);

if (elapsed < 2000) {
  console.log(`\n✓ EXCELENTE: El motor resolvió las 9 piezas en ${(elapsed / 1000).toFixed(2)} segundos (< 2s).`);
} else {
  console.log(`\n⚠ ATENCIÓN: El motor tardó ${(elapsed / 1000).toFixed(2)} segundos.`);
}
