// La cámara de GRISÚ (GDD §3): perspectiva de foco largo (28° de alto), 9° hacia abajo y SIEMPRE con la misma
// orientación (girarla haría titilar cada borde del pixel art). Se mueve solo en su plano: la posición se ancla a la
// grilla de píxeles del plano de juego (z = 0) y la fracción que sobra se corre al ampliar (pixel.ts → frac), así el
// desplazamiento es suave sin que los píxeles bailen (t3ssel8r).
import * as THREE from 'three';

export const FOV = 28, PITCH = 9;

export class CamRig {
  cam = new THREE.PerspectiveCamera(FOV, 16 / 9, 0.5, 600);
  view = 13;                          // alto visible del plano de juego, en metros
  target = new THREE.Vector3();       // punto del plano de juego en el centro de la vista
  snap = true;
  private right = new THREE.Vector3(); private up = new THREE.Vector3(); private fwd = new THREE.Vector3();

  constructor() {
    this.cam.rotation.set(-PITCH * Math.PI / 180, 0, 0, 'YXZ');
    this.cam.updateMatrixWorld();
    this.cam.layers.enable(0);
  }
  get dist() { return this.view / 2 / Math.tan(FOV * Math.PI / 360); }

  // ubica la cámara; H = alto interno en píxeles. Devuelve la fracción de píxel (x, y) que corre la ampliación
  // (el lienzo interno tiene 1 px de margen por lado: el campo visual se abre para cubrirlo con el mismo tamaño de píxel)
  update(H: number, rh: number, frac: THREE.Vector2) {
    const c = this.cam;
    const d0 = this.dist, ps0 = this.view / H;
    c.fov = 2 * Math.atan(ps0 * rh / 2 / d0) * 180 / Math.PI;
    c.rotation.set(-PITCH * Math.PI / 180, 0, 0, 'YXZ');
    c.updateMatrixWorld();
    this.right.setFromMatrixColumn(c.matrixWorld, 0);
    this.up.setFromMatrixColumn(c.matrixWorld, 1);
    this.fwd.setFromMatrixColumn(c.matrixWorld, 2).negate();
    const d = this.dist;
    const p = this.target.clone().addScaledVector(this.fwd, -d);
    frac.set(0, 0);
    if (this.snap) {
      const ps = this.view / H;   // metros por píxel en el plano de juego
      const cx = p.dot(this.right), cy = p.dot(this.up);
      const sx = Math.round(cx / ps) * ps, sy = Math.round(cy / ps) * ps;
      p.addScaledVector(this.right, sx - cx).addScaledVector(this.up, sy - cy);
      frac.set((cx - sx) / ps, (cy - sy) / ps);
    }
    c.position.copy(p);
    c.updateMatrixWorld();
  }
}
