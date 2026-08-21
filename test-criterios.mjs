/**
 * Suite de Pruebas Automatizadas para los 4 criterios de aceptación del Módulo 1.
 */

import { signedPolygonArea, polygonArea, pointInPolygon, enforceWindingOrder } from './src/geometry/math.js';
import { sanitizeRawPaths, stitchSegments, buildPiecesAndTopology } from './src/geometry/topology.js';
import { DxfGeometryExtractor } from './src/geometry/dxfExtractor.js';

console.log('================================================================');
console.log('  VERIFICACIÓN RIGUROSA DE CRITERIOS DE ACEPTACIÓN (MÓDULO 1)');
console.log('================================================================\n');

// 1. Verificación de Winding Order (CCW para piezas, CW para agujeros)
console.log('1. Sentido de Giro (Winding Order):');
const cwContour = [
  { x: 0, y: 0 }, { x: 0, y: 50 }, { x: 100, y: 50 }, { x: 100, y: 0 }, { x: 0, y: 0 }
];
const forcedCCW = enforceWindingOrder(cwContour, true);
const forcedCW = enforceWindingOrder(forcedCCW, false);

console.log(`   - Contorno exterior forzado a CCW: área con signo = ${signedPolygonArea(forcedCCW)} (>0) ->`, signedPolygonArea(forcedCCW) > 0 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Agujero interior forzado a CW: área con signo = ${signedPolygonArea(forcedCW)} (<0) ->`, signedPolygonArea(forcedCW) < 0 ? '✓ CORRECTO' : '✗ ERROR');

// 2. Verificación de Limpieza de Micro-segmentos y Duplicados (< 0.001 mm)
console.log('\n2. Limpieza de Micro-segmentos y Entidades Parásitas:');
const noisyPaths = [
  // Línea normal 1
  [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  // Línea duplicada idéntica (SolidWorks export glitch)
  [{ x: 0, y: 0 }, { x: 100, y: 0 }],
  // Micro-segmento parásito de longitud 0.0002 mm
  [{ x: 100, y: 0 }, { x: 100.0002, y: 0.0001 }],
  // Línea normal 2
  [{ x: 100, y: 0 }, { x: 100, y: 50 }]
];
const sanitized = sanitizeRawPaths(noisyPaths);
console.log(`   - Rutas originales con ruido: ${noisyPaths.length}`);
console.log(`   - Rutas tras filtrado de micro-segmentos y duplicados: ${sanitized.length} ->`, sanitized.length === 2 ? '✓ CORRECTO' : '✗ ERROR');

// 3. Verificación de Manejo de Contornos Abiertos (Open Loops)
console.log('\n3. Detección y Aislamiento de Contornos Abiertos:');
const openPathTest = [
  [{ x: 0, y: 0 }, { x: 50, y: 0 }],
  [{ x: 50, y: 0 }, { x: 50, y: 50 }],
  [{ x: 50, y: 50 }, { x: 20, y: 50 }] // No cierra
];
const { closedLoops, unclosedLoops } = stitchSegments(openPathTest, 0.05);
console.log(`   - Bucles cerrados detectados: ${closedLoops.length} (Esperado: 0) ->`, closedLoops.length === 0 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Bucles abiertos identificados: ${unclosedLoops.length} (Esperado: 1) ->`, unclosedLoops.length === 1 ? '✓ CORRECTO' : '✗ ERROR');

// 4. Verificación de Coordenadas Locales Normalizadas a (0,0)
console.log('\n4. Normalización a Coordenadas Locales (0,0) en PieceModel:');
const fakeDxf = {
  entities: [
    // Placa en coordenadas globales offseteada (x: 200..300, y: 500..550)
    {
      type: 'LWPOLYLINE',
      closed: true,
      vertices: [
        { x: 200, y: 500 }, { x: 300, y: 500 }, { x: 300, y: 550 }, { x: 200, y: 550 }
      ]
    },
    // Agujero en (250, 525) con radio 10
    {
      type: 'CIRCLE',
      center: { x: 250, y: 525 },
      radius: 10
    }
  ]
};
const extractor = new DxfGeometryExtractor();
const result = extractor.extractPieces(fakeDxf, 'piece_offset.dxf');
const piece = result.pieces[0];

console.log(`   - Coordenada mínima original: (${piece.bounds.minX}, ${piece.bounds.minY})`);
console.log(`   - Coordenada mínima local: (${piece.localBounds.minX}, ${piece.localBounds.minY}) ->`, (piece.localBounds.minX === 0 && piece.localBounds.minY === 0) ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Primer vértice original: (${piece.outerContour[0].x}, ${piece.outerContour[0].y})`);
console.log(`   - Primer vértice local: (${piece.localOuterContour[0].x}, ${piece.localOuterContour[0].y}) ->`, (piece.localOuterContour[0].x === 0 && piece.localOuterContour[0].y === 0) ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Centro del agujero normalizado: (${piece.localHoles[0][0].x}, ${piece.localHoles[0][0].y}) (esperado x ~ 60 mm relativo)`);

console.log('\n================================================================');
console.log('  ESTRUCTURA DE DATOS FINAL NORMALIZADA');
console.log('================================================================');
console.log(JSON.stringify(piece, null, 2));
