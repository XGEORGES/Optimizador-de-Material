# Walkthrough - MÓDULO 5: Exportador DXF Multicapa y Configuración PWA Offline

El **MÓDULO 5** y los ajustes de limpieza visual en el Canvas han sido implementados y validados con éxito.

---

## 1. Ajuste Visual de Limpieza Total del Canvas
- Se eliminaron por completo todos los textos, IDs, grados y etiquetas dentro de las piezas en el Canvas de la **Vista de Anidado**.
- Los contornos de corte exterior y los agujeros se muestran 100% limpios y nítidos.
- Toda la información técnica de la pieza (*ID, coordenadas $X,Y$, ángulo $\theta$, dimensiones $W \times H$, área neta y estado de hole nesting*) se mantiene accesible mediante el **tooltip flotante interactivo** al pasar el cursor por encima (hover).

---

## 2. Motor de Exportación DXF CAM (`src/export/dxfExporter.js`)
- **Estándar Universal:** Compatible con CypCut, FastCam, SheetCAM, RDWorks y AutoCAD (Release 2000 / AC1015, $INSUNITS = 4 mm).
- **Capa `CORTE` (Color 1 - Rojo):** Contornos de piezas y agujeros exportados estrictamente como `LWPOLYLINE` cerrada (`flag 70 = 1`), sin textos ni cotas parásitas.
- **Capa `PLANCHA_BRUTA` (Color 2 - Amarillo):** Rectángulo de la chapa como polilínea cerrada.
- **Soporte Multi-Plancha:** Todas las planchas empaquetadas en un único archivo DXF alineadas horizontalmente con un espacio de separación de $150\text{ mm}$ a lo largo del eje X.
- **Nomenclatura Automática:** `Nesting_[FechaHora]_[N]planchas.dxf`.
- **Botón en Header:** Botón **"💾 Descargar DXF de Corte"** integrado en el panel superior, activo al terminar la optimización.

---

## 3. PWA y Soporte Offline (`manifest.json` y `sw.js`)
- **Web App Manifest (`manifest.json`):** Configurado con modo `standalone`, color de tema `#0f172a` e icono vectorial (`icon.svg`).
- **Service Worker (`sw.js`):** Estrategia *Cache-First* para almacenar todo el código estático, CSS, Web Workers y librerías, permitiendo la instalación en Windows/Chrome/Edge y su uso 100% desconectado de internet.

---

## 4. Verificación Automatizada

La suite [test-module5.mjs](file:///c:/Users/XGEORGE/Documents/Mis%20Apps/Optimizador%20de%20Material/test-module5.mjs) pasó todas las pruebas:

```text
================================================================
  VERIFICACIÓN RIGUROSA DE EXPORTACIÓN DXF & PWA (MÓDULO 5)
================================================================

1. Verificación de Encabezado y Unidades DXF:
   - Versión AC1015 (AutoCAD 2000 CAM Standard): ✓ CORRECTO
   - Unidades en Milímetros ($INSUNITS = 4): ✓ CORRECTO

2. Verificación de Capas de Corte y Plancha:
   - Capa CORTE definida con Color 1 (Rojo): ✓ CORRECTO
   - Capa PLANCHA_BRUTA definida con Color 2 (Amarillo): ✓ CORRECTO

3. Verificación de Entidades y Polilíneas Cerradas (LWPOLYLINE):
   - Cantidad total de entidades LWPOLYLINE: 6 (Esperadas: 6) -> ✓ CORRECTO
   - Cero entidades de texto parásito (TEXT / MTEXT): ✓ CORRECTO

4. Verificación de Multi-Plancha con Offset Horizontal (150 mm):
   - Origen Plancha 2 con offset de 2550 mm: ✓ CORRECTO
   - Vértice Pieza C desplazada a X = 2600 mm: ✓ CORRECTO

5. Verificación de Nomenclatura Automática:
   - Nombre de archivo generado: "Nesting_20260820_2255_2planchas.dxf" -> ✓ CORRECTO
```
