/**
 * Script de prueba unitaria en Node.js para verificar el funcionamiento
 * del motor de geometría y topología del Módulo 1 sin depender del navegador.
 */

import { discretizeArc, discretizeBulge, signedPolygonArea, polygonArea, pointInPolygon, computeBounds } from './src/geometry/math.js';
import { stitchSegmentsIntoClosedLoops, buildPiecesFromLoops } from './src/geometry/topology.js';
import { DxfGeometryExtractor } from './src/geometry/dxfExtractor.js';

console.log('=== INICIANDO SUITE DE PRUEBAS DE GEOMETRÍA (MÓDULO 1) ===\n');

// 1. Prueba de Cálculo de Área y Orientación
const squarePoints = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 50 },
  { x: 0, y: 50 },
  { x: 0, y: 0 }
];
const area = polygonArea(squarePoints);
const bounds = computeBounds(squarePoints);
console.log('1. Rectángulo 100x50 mm:');
console.log(`   - Área calculada: ${area} mm² (Esperada: 5000 mm²) ->`, area === 5000 ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Bounding Box: ${bounds.width}x${bounds.height} mm ->`, (bounds.width === 100 && bounds.height === 50) ? '✓ CORRECTO' : '✗ ERROR');

// 2. Prueba de Point-in-Polygon
const insidePoint = { x: 50, y: 25 };
const outsidePoint = { x: 150, y: 25 };
console.log('\n2. Algoritmo Point-In-Polygon:');
console.log(`   - Punto (50,25) dentro de rectángulo:`, pointInPolygon(insidePoint, squarePoints) === true ? '✓ CORRECTO' : '✗ ERROR');
console.log(`   - Punto (150,25) fuera de rectángulo:`, pointInPolygon(outsidePoint, squarePoints) === false ? '✓ CORRECTO' : '✗ ERROR');

// 3. Prueba de Discretización de Bulge (Arco en LWPolyline) con tolerancia <= 0.05mm
const arcSegments = discretizeBulge({ x: 0, y: 0 }, { x: 10, y: 0 }, 1, 0.05);
console.log('\n3. Discretización de Semicírculo (Bulge = 1):');
console.log(`   - Segmentos generados con flecha <= 0.05 mm: ${arcSegments.length} puntos ->`, arcSegments.length > 5 ? '✓ CORRECTO' : '✗ ERROR');

// 4. Prueba del Extractor con DXF AST Simulado (Pieza exterior + Agujero interior)
const fakeDxfAst = {
  entities: [
    // Contorno exterior 120x80
    {
      type: 'LWPOLYLINE',
      closed: true,
      vertices: [
        { x: 10, y: 10 },
        { x: 130, y: 10 },
        { x: 130, y: 90 },
        { x: 10, y: 90 }
      ]
    },
    // Agujero circular interior en (40,50) radio 15
    {
      type: 'CIRCLE',
      center: { x: 40, y: 50 },
      radius: 15
    },
    // Otra pieza independiente en el mismo plano (Soporte)
    {
      type: 'LWPOLYLINE',
      closed: true,
      vertices: [
        { x: 200, y: 10 },
        { x: 280, y: 10 },
        { x: 240, y: 90 }
      ]
    }
  ]
};

const extractor = new DxfGeometryExtractor({ tolerance: 0.05 });
const pieces = extractor.extractPieces(fakeDxfAst, 'test_sheet.dxf');

console.log('\n4. Extractor de Piezas y Agujeros:');
console.log(`   - Total de piezas detectadas: ${pieces.length} (Esperadas: 2) ->`, pieces.length === 2 ? '✓ CORRECTO' : '✗ ERROR');

const pieceWithHole = pieces.find(p => p.holes && p.holes.length > 0);
console.log(`   - Pieza 1 con agujero detectada:`, pieceWithHole ? '✓ CORRECTO' : '✗ ERROR');
if (pieceWithHole) {
  console.log(`     * ID: ${pieceWithHole.id}`);
  console.log(`     * Agujeros: ${pieceWithHole.holes.length} (Esperado: 1)`);
  console.log(`     * Área Neta: ${pieceWithHole.area} mm² (Gross: ${pieceWithHole.grossArea} mm²)`);
  console.log(`     * Bounds:`, pieceWithHole.bounds);
}

console.log('\n=== ESTRUCTURA JSON DE SALIDA OBTENIDA ===');
console.log(JSON.stringify(pieces, null, 2));
