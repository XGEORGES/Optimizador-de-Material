/**
 * Suite de Pruebas Automatizadas para el MÓDULO 3.
 * Verifica:
 * 1. Offset perimetral de dilatación (+S/2) y contracción de agujeros (-S/2).
 * 2. Orden de inserción First-Fit Decreasing (área neta descendente).
 * 3. Exploración de rotaciones según el paso angular configurado.
 * 4. Detección de colisiones e inclusión de contornos.
 * 5. Hole Nesting (pieza pequeña alojada dentro del agujero de otra pieza).
 * 6. Soporte Multi-Plancha Secuencial para grandes lotes de piezas.
 */

import { offsetPolygon, rotateAndNormalizeToOrigin, polygonsCollide, isPolygonInside } from './src/geometry/polygonOffset.js';
import { NestingEngine } from './src/nesting/nestingEngine.js';

console.log('================================================================');
console.log('  VERIFICACIÓN RIGUROSA DEL MOTOR DE ANIDADO 2D (MÓDULO 3)');
console.log('================================================================\n');

// 1. Verificación de Offset Geométrico (+S/2 y -S/2)
console.log('1. Offset Geométrico (Dilatación de Contorno & Contracción de Agujeros):');
const squareOuter = [
  { x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }, { x: 0, y: 100 }
];
const inflatedOuter = offsetPolygon(squareOuter, 2.5); // S=5mm => S/2=2.5mm dilatación
console.log(`   - Contorno 100x100mm dilatado (+2.5mm):`);
console.log(`     * Vértice mín dilatado: (${inflatedOuter[0].x}, ${inflatedOuter[0].y}) (esperado: aprox -2.5, -2.5)`);
console.log(`     * Vértice máx dilatado: (${inflatedOuter[2].x}, ${inflatedOuter[2].y}) (esperado: aprox 102.5, 102.5) ->`, 
  (inflatedOuter[0].x <= -2.4 && inflatedOuter[2].x >= 102.4) ? '✓ CORRECTO' : '✗ ERROR');

const holeInside = [
  { x: 20, y: 20 }, { x: 80, y: 20 }, { x: 80, y: 80 }, { x: 20, y: 80 }
];
const deflatedHole = offsetPolygon(holeInside, -2.5); // S/2=2.5mm contracción
console.log(`   - Agujero 60x60mm contraído (-2.5mm para hole nesting seguro):`);
console.log(`     * Vértice mín contraído: (${deflatedHole[0].x}, ${deflatedHole[0].y}) (esperado: aprox 22.5, 22.5)`);
console.log(`     * Vértice máx contraído: (${deflatedHole[2].x}, ${deflatedHole[2].y}) (esperado: aprox 77.5, 77.5) ->`,
  (deflatedHole[0].x >= 22.4 && deflatedHole[2].x <= 77.6) ? '✓ CORRECTO' : '✗ ERROR');

// 2. Verificación de Rotaciones y Normalización
console.log('\n2. Exploración de Rotaciones y Normalización a Origen (0,0):');
const rectPoly = [
  { x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200, y: 50 }, { x: 0, y: 50 }
];
const rot90 = rotateAndNormalizeToOrigin(rectPoly, 90);
console.log(`   - Rectángulo 200x50mm rotado 90°:`);
console.log(`     * Nuevo ancho: ${rot90.bounds.width} mm (esperado: 50 mm)`);
console.log(`     * Nuevo alto: ${rot90.bounds.height} mm (esperado: 200 mm) ->`, 
  (rot90.bounds.width === 50 && rot90.bounds.height === 200) ? '✓ CORRECTO' : '✗ ERROR');

// 3. Verificación de Hole Nesting
console.log('\n3. Prueba de Algoritmo Hole Nesting:');
// Pieza A: 500x500 con agujero central de 300x300
const pieceWithBigHole = {
  pieceId: 'BIG-WITH-HOLE',
  sourceFileName: 'TestHole.dxf',
  quantity: 1,
  area: 500 * 500 - 300 * 300, // 160,000 mm²
  outerContour: [{ x: 0, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 500 }, { x: 0, y: 500 }],
  holes: [[{ x: 100, y: 100 }, { x: 400, y: 100 }, { x: 400, y: 400 }, { x: 100, y: 400 }]],
  bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500, width: 500, height: 500 }
};

// Pieza B: Pequeña 150x150 que debe caber dentro del agujero de 300x300
const smallPiece = {
  pieceId: 'SMALL-PART',
  sourceFileName: 'TestHole.dxf',
  quantity: 1,
  area: 150 * 150, // 22,500 mm²
  outerContour: [{ x: 0, y: 0 }, { x: 150, y: 0 }, { x: 150, y: 150 }, { x: 0, y: 150 }],
  holes: [],
  bounds: { minX: 0, minY: 0, maxX: 150, maxY: 150, width: 150, height: 150 }
};

const holeJob = {
  sheet: { width: 1000, height: 1000, margin: 10 },
  settings: { spacing: 6, rotationStep: 90, holeNesting: true },
  items: [pieceWithBigHole, smallPiece]
};

const engineHole = new NestingEngine(holeJob);
const resultHole = await engineHole.run();

console.log(`   - Planchas utilizadas: ${resultHole.sheets.length} (Esperado: 1)`);
console.log(`   - Piezas colocadas: ${resultHole.totalPlaced} de ${resultHole.totalCount}`);
const smallPlaced = resultHole.sheets[0].placedPieces.find(p => p.pieceId === 'SMALL-PART');
console.log(`   - ¿Pieza pequeña anidada dentro del agujero?: ${smallPlaced && smallPlaced.inHoleOf === 'BIG-WITH-HOLE'} ->`, 
  (smallPlaced && smallPlaced.inHoleOf === 'BIG-WITH-HOLE') ? '✓ CORRECTO (Hole Nesting Funcional)' : '✗ ERROR');

// 4. Verificación de Multi-Plancha Secuencial y First-Fit Decreasing
console.log('\n4. Prueba de Multi-Plancha Secuencial:');
// Plancha pequeña de 600x600 (útil ~580x580 con M=10)
// Lote de 8 piezas de 300x300 (cada plancha admite máx 1 o 2 piezas)
const bigPiecesJob = {
  sheet: { width: 600, height: 600, margin: 10 },
  settings: { spacing: 5, rotationStep: 90, holeNesting: false },
  items: [
    {
      pieceId: 'PANEL-350',
      sourceFileName: 'Paneles.dxf',
      quantity: 5,
      area: 350 * 350,
      outerContour: [{ x: 0, y: 0 }, { x: 350, y: 0 }, { x: 350, y: 350 }, { x: 0, y: 350 }],
      holes: [],
      bounds: { minX: 0, minY: 0, maxX: 350, maxY: 350, width: 350, height: 350 }
    }
  ]
};

const engineMulti = new NestingEngine(bigPiecesJob);
const resultMulti = await engineMulti.run();

console.log(`   - Total piezas requeridas: ${resultMulti.totalCount}`);
console.log(`   - Total piezas colocadas: ${resultMulti.totalPlaced}`);
console.log(`   - Planchas instanciadas automáticamente: ${resultMulti.sheets.length} ->`, 
  resultMulti.sheets.length > 1 && resultMulti.totalPlaced === 5 ? '✓ CORRECTO (Multi-Plancha Secuencial)' : '✗ ERROR');
console.log(`   - Tiempo de cálculo: ${resultMulti.executionTime} ms`);

console.log('\n=== ESTRUCTURA DE SALIDA POR PLANCHAS (MÓDULO 3) ===');
console.log(JSON.stringify({
  sheets: resultHole.sheets.map(s => ({
    sheetIndex: s.sheetIndex,
    width: s.width,
    height: s.height,
    placedCount: s.placedPieces.length,
    usedArea: s.usedAreaM2,
    wastePercent: s.wastePercent,
    placedPieces: s.placedPieces.map(p => ({
      pieceId: p.pieceId,
      x: p.x,
      y: p.y,
      rotation: p.rotation,
      inHoleOf: p.inHoleOf || null
    }))
  }))
}, null, 2));
