// El catálogo de modelos del escaparate
import type { ModelDef } from '../anim.ts';
import { esgrimista } from './esgrimista.ts';
import { estibador } from './estibador.ts';
import { topo } from './topo.ts';
import { capataz } from './capataz.ts';

export const MODELS: Record<string, { name: string, sub: string, make: () => ModelDef }> = {
  esgrimista: { name: 'EL ESGRIMISTA', sub: '«Don Válvula» · sable de pistón', make: esgrimista },
  estibador: { name: 'EL ESTIBADOR', sub: '«Ancla» · martillo-ancla', make: estibador },
  topo: { name: 'TOPO-BARRENA', sub: 'autómata de latón · cuerpo a cuerpo', make: topo },
  capataz: { name: 'CAPATAZ AUTÓMATA', sub: 'escudo de hierro · bloquea de frente', make: capataz },
};
