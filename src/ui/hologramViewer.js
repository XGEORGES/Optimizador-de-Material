/**
 * Controlador de Cubo 3D Holográfico Sci-Fi (Three.js).
 * Renderiza un BoxGeometry tipo esqueleto de líneas brillantes en rotación continua.
 */

export class HologramCube {
  constructor(containerId) {
    this.container = typeof containerId === 'string' ? document.getElementById(containerId) : containerId;
    this.animId = null;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.cube = null;
    this.innerCube = null;

    if (this.container && window.THREE) {
      this.init();
    }
  }

  init() {
    // Si ya existe un renderer, destruirlo previamente
    this.destroy();

    const width = this.container.clientWidth || 240;
    const height = this.container.clientHeight || 200;

    // 1. Escena Three.js
    this.scene = new THREE.Scene();

    // 2. Cámara de perspectiva
    this.camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 1000);
    this.camera.position.z = 4.2;

    // 3. Renderizador WebGL con alpha transparente
    this.renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.margin = '0 auto';

    this.container.appendChild(this.renderer.domElement);

    // 4. Geometría Externa (Cubo Cian Neón)
    const geometry = new THREE.BoxGeometry(1.6, 1.6, 1.6);
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x00f3ff,
      linewidth: 2,
      transparent: true,
      opacity: 0.85
    });
    this.cube = new THREE.LineSegments(edges, lineMaterial);
    this.scene.add(this.cube);

    // 5. Geometría Interna (Cubo Rosa Neón concéntrico más pequeño)
    const innerGeo = new THREE.BoxGeometry(0.9, 0.9, 0.9);
    const innerEdges = new THREE.EdgesGeometry(innerGeo);
    const innerMaterial = new THREE.LineBasicMaterial({
      color: 0xff007f,
      linewidth: 1.5,
      transparent: true,
      opacity: 0.7
    });
    this.innerCube = new THREE.LineSegments(innerEdges, innerMaterial);
    this.scene.add(this.innerCube);

    // 6. Bucle de animación (requestAnimationFrame)
    const animate = () => {
      this.animId = requestAnimationFrame(animate);

      if (this.cube) {
        this.cube.rotation.x += 0.008;
        this.cube.rotation.y += 0.012;
      }

      if (this.innerCube) {
        this.innerCube.rotation.x -= 0.012;
        this.innerCube.rotation.y -= 0.016;
        this.innerCube.rotation.z += 0.005;
      }

      if (this.renderer && this.scene && this.camera) {
        this.renderer.render(this.scene, this.camera);
      }
    };

    animate();
  }

  destroy() {
    if (this.animId) {
      cancelAnimationFrame(this.animId);
      this.animId = null;
    }
    if (this.renderer && this.renderer.domElement && this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
    if (this.scene) {
      while (this.scene.children.length > 0) {
        const obj = this.scene.children[0];
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) obj.material.dispose();
        this.scene.remove(obj);
      }
    }
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.cube = null;
    this.innerCube = null;
  }
}
