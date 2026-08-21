/**
 * Exportador de DXF R12 Multi-Plancha.
 * Genera un solo archivo con todas las planchas alineadas horizontalmente.
 */

export class DxfExporter {
  static generateDXF(sheetsArray) {
    let dxf = '';

    // 1. Encabezado estricto R12
    dxf += '0\nSECTION\n2\nHEADER\n9\n$ACADVER\n1\nAC1009\n0\nENDSEC\n';
    dxf += '0\nSECTION\n2\nENTITIES\n';

    // Función de dibujo con Offset en el eje X para separar las planchas
    const addPolyline = (points, layer = '0', color = 7, offsetX = 0) => {
      if (!points || points.length < 2) return;

      dxf += '0\nPOLYLINE\n';
      dxf += `8\n${layer}\n`;
      dxf += `62\n${color}\n`;
      dxf += '66\n1\n';
      dxf += '70\n1\n'; // Contorno cerrado
      dxf += '10\n0.0\n20\n0.0\n30\n0.0\n'; // Base R12

      for (let i = 0; i < points.length; i++) {
        dxf += '0\nVERTEX\n';
        dxf += `8\n${layer}\n`;
        dxf += `10\n${Number(points[i].x + offsetX).toFixed(4)}\n`; // Desplazamiento X
        dxf += `20\n${Number(points[i].y).toFixed(4)}\n`;
        dxf += '30\n0.0\n';
      }
      dxf += '0\nSEQEND\n';
    };

    let currentOffsetX = 0;
    const GAP_BETWEEN_SHEETS = 200; // 200 mm de separación visual

    // Procesar cada plancha secuencialmente
    sheetsArray.forEach((sheet, index) => {
      const w = sheet.width || 0;
      const h = sheet.height || 0;

      // A. Marco de la plancha (Capa PLANCHA, Color 3 Verde)
      if (w > 0 && h > 0) {
        addPolyline([
          { x: 0, y: 0 }, { x: w, y: 0 }, { x: w, y: h }, { x: 0, y: h }
        ], `PLANCHA_${index + 1}`, 3, currentOffsetX);
      }

      // B. Piezas y agujeros de esta plancha
      const pieces = sheet.placedPieces || [];
      for (const piece of pieces) {
        addPolyline(piece.polygon, 'CORTES', 7, currentOffsetX);

        const holes = piece.holes || piece.deflatedHoles || [];
        for (const hole of holes) {
          if (hole && hole.length >= 3) {
            addPolyline(hole, 'AGUJEROS', 1, currentOffsetX);
          }
        }
      }

      // Sumar el ancho de la plancha actual más el margen para la siguiente
      currentOffsetX += w + GAP_BETWEEN_SHEETS;
    });

    dxf += '0\nENDSEC\n0\nEOF\n';
    return dxf;
  }

  static downloadDxf(data) {
    let sheetsToExport = [];

    // Detectar la estructura de datos entrante
    if (Array.isArray(data)) {
      sheetsToExport = data;
    } else if (data && Array.isArray(data.sheets)) {
      sheetsToExport = data.sheets;
    } else if (data && data.placedPieces) {
      sheetsToExport = [data];
    }

    if (sheetsToExport.length === 0) {
      console.error("DXF Exporter: No se encontraron planchas válidas.");
      return;
    }

    // Generar un solo string DXF masivo
    const dxfData = this.generateDXF(sheetsToExport);
    const blob = new Blob([dxfData], { type: 'application/dxf' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = `Anidado_Maestro_${sheetsToExport.length}_Planchas.dxf`;

    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  static exportSheet(sheet) { return this.downloadDxf(sheet); }
  static exportDXF(sheet) { return this.generateDXF([sheet]); }
}

export const DXFExporter = DxfExporter;
export default DxfExporter;