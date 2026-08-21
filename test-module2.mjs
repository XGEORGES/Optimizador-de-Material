/**
 * Suite de Pruebas Automatizadas para el MÓDULO 2.
 * Verifica la reactividad del estado, cálculo de métricas de plancha,
 * multiplicadores de cantidad y compilación del objeto NestingJob.
 */

import { nestingStore } from './src/state/nestingStore.js';

console.log('================================================================');
console.log('  VERIFICACIÓN RIGUROSA DE ESTADO Y MÉTRICAS (MÓDULO 2)');
console.log('================================================================\n');

// 1. Prueba de Configuración de Plancha y Margen
console.log('1. Configuración de Formatos de Plancha:');
nestingStore.setSheetPreset('1200x2400');
nestingStore.setSheetMargin(10);
let state = nestingStore.getState();

console.log(`   - Plancha 1200x2400 con M=10mm:`);
console.log(`     * Ancho: ${state.sheet.width} mm, Alto: ${state.sheet.height} mm`);
console.log(`     * Área útil calculada: ${state.metrics.sheetUsableAreaM2} m² (Esperada: 2.808 m²) ->`, 
  state.metrics.sheetUsableAreaM2 === 2.808 ? '✓ CORRECTO' : '✗ ERROR');

// 2. Prueba de Parámetros de Corte
console.log('\n2. Parámetros de Corte y Tolerancias:');
nestingStore.setSpacing(6.5);
nestingStore.setRotationStep(45);
nestingStore.setHoleNesting(false);
state = nestingStore.getState();

console.log(`   - Sangría (S): ${state.settings.spacing} mm ->`, state.settings.spacing === 6.5 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Rotación: ${state.settings.rotationStep}° ->`, state.settings.rotationStep === 45 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Hole Nesting: ${state.settings.holeNesting} ->`, state.settings.holeNesting === false ? '✓ CORRECTO' : '✗ ERROR');

// 3. Prueba de Inventario, Cantidades y Multiplicador por Archivo
console.log('\n3. Inventario de Piezas y Multiplicadores:');
nestingStore.clearAll();

const fakePiece1 = {
  id: 'P-101',
  sourceFileName: 'ChapaLaser_A.dxf',
  quantity: 2,
  area: 500000, // 0.5 m²
  outerContour: [{x:0, y:0}, {x:1000, y:0}, {x:1000, y:500}, {x:0, y:500}],
  holes: [],
  bounds: { minX: 0, minY: 0, maxX: 1000, maxY: 500, width: 1000, height: 500 }
};

const fakePiece2 = {
  id: 'P-102',
  sourceFileName: 'ChapaLaser_A.dxf',
  quantity: 4,
  area: 250000, // 0.25 m²
  outerContour: [{x:0, y:0}, {x:500, y:0}, {x:500, y:500}, {x:0, y:500}],
  holes: [],
  bounds: { minX: 0, minY: 0, maxX: 500, maxY: 500, width: 500, height: 500 }
};

nestingStore.addPieces([fakePiece1, fakePiece2]);

// Multiplicar todo el archivo 'ChapaLaser_A.dxf' por 3
nestingStore.multiplyFileQuantity('ChapaLaser_A.dxf', 3);
state = nestingStore.getState();

const piece1After = state.pieces.find(p => p.id === 'P-101');
const piece2After = state.pieces.find(p => p.id === 'P-102');

console.log(`   - Cantidad P-101 tras factor x3: ${piece1After.quantity} (Esperada: 6) ->`, piece1After.quantity === 6 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Cantidad P-102 tras factor x3: ${piece2After.quantity} (Esperada: 12) ->`, piece2After.quantity === 12 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Total de piezas a cortar acumuladas: ${state.metrics.totalPiecesCount} (Esperadas: 18) ->`, state.metrics.totalPiecesCount === 18 ? '✓ CORRECTO' : '✗ ERROR');

// 4. Prueba de Métricas y Estimación Teórica de Planchas
console.log('\n4. Métricas de Área y Estimación de Planchas:');
// Área total = (6 * 0.5) + (12 * 0.25) = 3.0 + 3.0 = 6.0 m²
console.log(`   - Área Total Neta: ${state.metrics.totalPiecesAreaM2} m² (Esperada: 6.000 m²) ->`, state.metrics.totalPiecesAreaM2 === 6 ? '✓ CORRECTO' : '✗ ERROR');
// Plancha útil = 2.808 m² => Planchas requeridas = ceil(6.0 / 2.808) = 3 planchas
console.log(`   - Planchas mínimas teóricas: ${state.metrics.minEstimatedSheets} (Esperadas: 3) ->`, state.metrics.minEstimatedSheets === 3 ? '✓ CORRECTO' : '✗ ERROR');

// 5. Prueba de Compilación de 'NestingJob'
console.log('\n5. Compilación del Objeto Estándar NestingJob:');
const job = state.nestingJob;
console.log('   - Estructura compilada verificada con keys:', Object.keys(job));
console.log(`   - Total items compilados en job: ${job.items.length}`);

console.log('\n=== OBJETO NESTINGJOB FINAL ===');
console.log(JSON.stringify(job, null, 2));
