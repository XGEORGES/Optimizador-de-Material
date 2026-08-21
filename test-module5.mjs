/**
 * Suite de Pruebas Automatizadas para el MÓDULO 5 (Exportador DXF Multicapa & PWA).
 * Verifica:
 * 1. Estructura estándar del archivo DXF (HEADER AC1015, INSUNITS 4 = mm).
 * 2. Capas obligatorias: CORTE (Color 1) y PLANCHA_BRUTA (Color 2).
 * 3. Exportación de polilíneas cerradas (LWPOLYLINE con flag 70 = 1).
 * 4. Inclusión de agujeros interiores en capa CORTE y ausencia de textos parásitos.
 * 5. Multi-plancha con offset horizontal de 150 mm.
 */

import { DxfExporter } from './src/export/dxfExporter.js';

console.log('================================================================');
console.log('  VERIFICACIÓN RIGUROSA DE EXPORTACIÓN DXF & PWA (MÓDULO 5)');
console.log('================================================================\n');

// Objeto de prueba con 2 planchas, piezas y agujeros
const sampleNestingResult = {
  totalPlaced: 3,
  totalCount: 3,
  totalWaste: 25.5,
  executionTime: 45,
  sheets: [
    {
      sheetIndex: 0,
      width: 2400,
      height: 1200,
      placedPieces: [
        {
          pieceId: 'PIECE-A',
          x: 100,
          y: 100,
          rotation: 0,
          polygon: [
            { x: 100, y: 100 }, { x: 600, y: 100 }, { x: 600, y: 400 }, { x: 100, y: 400 }
          ],
          deflatedHoles: [
            [ { x: 200, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 300 }, { x: 200, y: 300 } ]
          ]
        },
        {
          pieceId: 'PIECE-B',
          x: 700,
          y: 100,
          rotation: 45,
          polygon: [
            { x: 700, y: 100 }, { x: 1100, y: 100 }, { x: 1100, y: 500 }, { x: 700, y: 500 }
          ],
          deflatedHoles: []
        }
      ]
    },
    {
      sheetIndex: 1,
      width: 2400,
      height: 1200,
      placedPieces: [
        {
          pieceId: 'PIECE-C',
          x: 50,
          y: 50,
          rotation: 90,
          polygon: [
            { x: 50, y: 50 }, { x: 450, y: 50 }, { x: 450, y: 450 }, { x: 50, y: 450 }
          ],
          deflatedHoles: []
        }
      ]
    }
  ]
};

// 1. Generación de DXF
const dxfText = DxfExporter.exportToDxf(sampleNestingResult, 150);

console.log('1. Verificación de Encabezado y Unidades DXF:');
console.log('   - Versión AC1015 (AutoCAD 2000 CAM Standard):', dxfText.includes('AC1015') ? '✓ CORRECTO' : '✗ ERROR');
console.log('   - Unidades en Milímetros ($INSUNITS = 4):', dxfText.includes('$INSUNITS\r\n70\r\n4') ? '✓ CORRECTO' : '✗ ERROR');

console.log('\n2. Verificación de Capas de Corte y Plancha:');
console.log('   - Capa CORTE definida con Color 1 (Rojo):', dxfText.includes('CORTE\r\n70\r\n0\r\n62\r\n1') ? '✓ CORRECTO' : '✗ ERROR');
console.log('   - Capa PLANCHA_BRUTA definida con Color 2 (Amarillo):', dxfText.includes('PLANCHA_BRUTA\r\n70\r\n0\r\n62\r\n2') ? '✓ CORRECTO' : '✗ ERROR');

console.log('\n3. Verificación de Entidades y Polilíneas Cerradas (LWPOLYLINE):');
const lwPolyCount = (dxfText.match(/LWPOLYLINE/g) || []).length;
// 2 planchas brutas + 3 contornos exteriores + 1 agujero interior = 6 LWPOLYLINE
console.log(`   - Cantidad total de entidades LWPOLYLINE: ${lwPolyCount} (Esperadas: 6) ->`, lwPolyCount === 6 ? '✓ CORRECTO' : '✗ ERROR');
console.log('   - Cero entidades de texto parásito (TEXT / MTEXT):', (!dxfText.includes('\r\nTEXT\r\n') && !dxfText.includes('\r\nMTEXT\r\n')) ? '✓ CORRECTO' : '✗ ERROR');

console.log('\n4. Verificación de Multi-Plancha con Offset Horizontal (150 mm):');
// Plancha 1: X = 0..2400
// Plancha 2: X = 2400 + 150 = 2550..4950
// Pieza C en Plancha 2: X = 2550 + 50 = 2600
console.log('   - Origen Plancha 2 con offset de 2550 mm:', dxfText.includes('\r\n10\r\n2550\r\n20\r\n0') ? '✓ CORRECTO' : '✗ ERROR');
console.log('   - Vértice Pieza C desplazada a X = 2600 mm:', dxfText.includes('\r\n10\r\n2600\r\n20\r\n50') ? '✓ CORRECTO' : '✗ ERROR');

console.log('\n5. Verificación de Nomenclatura Automática:');
const fileName = DxfExporter.generateDefaultFileName(sampleNestingResult);
console.log(`   - Nombre de archivo generado: "${fileName}" ->`, (fileName.startsWith('Nesting_') && fileName.endsWith('_2planchas.dxf')) ? '✓ CORRECTO' : '✗ ERROR');

console.log('\n=== MUESTRA DEL ENCABEZADO Y PRIMERAS ENTIDADES DXF ===');
console.log(dxfText.split('\r\n').slice(0, 48).join('\n'));
