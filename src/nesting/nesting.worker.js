/**
 * Web Worker dedicado para la ejecución multihilo del motor de anidado 2D.
 * Mantiene la UI principal fluida a 60 FPS durante cálculos intensivos de geometría y colisiones.
 */

import { NestingEngine } from './nestingEngine.js';

let currentEngine = null;

self.addEventListener('message', async (e) => {
  const { type, payload } = e.data;

  switch (type) {
    case 'START_NESTING': {
      if (currentEngine) {
        currentEngine.stop();
      }

      currentEngine = new NestingEngine(payload, {
        onProgress: (progressData) => {
          self.postMessage({
            type: 'NESTING_PROGRESS',
            data: progressData
          });
        }
      });

      try {
        const result = await currentEngine.run();
        self.postMessage({
          type: 'NESTING_COMPLETE',
          data: result
        });
      } catch (err) {
        self.postMessage({
          type: 'NESTING_ERROR',
          error: err.message
        });
      } finally {
        currentEngine = null;
      }
      break;
    }

    case 'STOP_NESTING': {
      if (currentEngine) {
        currentEngine.stop();
        currentEngine = null;
      }
      break;
    }

    default:
      console.warn('Mensaje desconocido recibido en nesting.worker:', type);
  }
});
