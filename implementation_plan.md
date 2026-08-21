# Implementation Plan - MÓDULO 4: Visualizador Gráfico de Planchas, Renderizado de Anidado y Métricas de Resultados

Implementar el renderizado 2D de alta fidelidad para los resultados del motor de anidado sobre Canvas, selector de vista (Ingesta vs Anidado), navegador/pestañas multi-plancha (individual o tira horizontal continua), panel de métricas post-optimización y tooltip interactivo con hover/clic.

## User Review Required
- El canvas cambiará fluidamente entre la vista de ingesta CAD y la vista optimizada de corte.
- Si hay múltiples planchas generadas, se podrá navegar entre pestañas individuales `[Plancha 1 (XX%)]` `[Plancha 2 (XX%)]` o elegir la vista en tira continua `"Ver Todas"`.

## Proposed Changes

### UI & Renderizado CAD/Nesting (`src/ui/`)
#### [NEW] `src/ui/nestingRenderer.js`
- Módulo especializado en renderizar planchas optimizadas en el contexto 2D de Canvas:
  - Renderizado de planchas con marco exterior, dimensiones en mm y línea punteada de margen perimetral $M$.
  - Renderizado de cada pieza colocada (`placedPieces`) con su matriz de transformación ($x, y, \theta$).
  - Color distintivo con trazo sólido y relleno translúcido profesional.
  - Perforación de agujeros interiores (*holes*) con el color de fondo de plancha/canvas.
  - Etiqueta central sutil con el ID de la pieza / número de instancia.
  - Resaltado especial para piezas anidadas dentro de agujeros (*Hole Nesting*).
  - Resaltado de selección/hover de pieza con bounding box interactivo.
  - Soporte de renderizado individual de plancha o tira horizontal continua con separación entre planchas.

#### [MODIFY] `src/ui/canvasViewer.js`
- Integrar soporte para dos modos de vista: `viewMode: 'ingest' | 'nesting'`.
- Añadir control de plancha activa actual (`activeSheetIndex: 0` o `'all'`).
- Soporte para eventos de ratón `mousemove` y `click` sobre el Canvas para detectar la pieza bajo el cursor (Ray-casting / point-in-polygon) y disparar tooltips/selección interactiva.

### Barra de Métricas y Controles (`index.html`, `src/ui/styles.css`, `src/app.js`)
#### [MODIFY] `index.html`
- Añadir selector de modo en la barra superior del canvas:
  - `[📄 Vista Ingesta]` `[⚡ Vista Anidado (Corte)]`
- Añadir barra de navegación de planchas en la parte superior del canvas:
  - Selector de planchas `[Plancha 1]` `[Plancha 2]` `[Ver Todas]`
- Elemento flotante de Tooltip para hover/clic en Canvas con detalles de la pieza (Posición X, Y, Rotación, Dimensiones, Estado de Hole Nesting).

#### [MODIFY] `src/ui/styles.css`
- Estilos para los botones de modo de vista, pestañas de planchas multi-sheet y tooltip flotante con glassmorphism.

#### [MODIFY] `src/app.js`
- Conectar cambio automático de modo al recibir `NESTING_PROGRESS` o `NESTING_COMPLETE`.
- Conectar la barra de métricas superiores para mostrar métricas reales post-optimización:
  - Planchas Usadas, Eficiencia de Material (% Utilizado vs % Merma), Piezas Colocadas (X / Y), Área Neta vs Área de Chapa Utilizada.
- Vincular eventos de selección de plancha y modo de vista.

## Verification Plan
1. Ejecutar pruebas unitarias de regresión en Node (`node test-module1.mjs`, `node test-module2.mjs`, `node test-module3.mjs`).
2. Validar que la interfaz cambie a vista de anidado al iniciar la optimización y dibuje todas las piezas rotadas y trasladadas dentro de los límites de plancha.
3. Probar carga de lotes de piezas que requieran múltiples planchas para validar la navegación entre pestañas y vista en tira horizontal.
4. Probar hover sobre piezas anidadas para comprobar que el tooltip muestre correctamente las coordenadas, rotación y dimensiones.
