import { Filter, GlProgram } from 'pixi.js';

import vertex from './default.vert';
import fragment from '../shaders/dissolve.frag';

/**
 * Dissolve / disintegration filter.
 *
 * Dissolves a sprite using noise-based masking with glowing edge particles.
 * Animate `progress` from 0 (fully visible) to 1 (fully dissolved).
 */
export class DissolveFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({ vertex, fragment });

    super({
      glProgram,
      resources: {
        filterUniforms: {
          uProgress: { value: 0, type: 'f32' },
          uTime: { value: 0, type: 'f32' },
        },
      },
    });
  }

  get progress(): number {
    return this.resources.filterUniforms.uniforms.uProgress;
  }

  set progress(v: number) {
    this.resources.filterUniforms.uniforms.uProgress = v;
  }

  get time(): number {
    return this.resources.filterUniforms.uniforms.uTime;
  }

  set time(v: number) {
    this.resources.filterUniforms.uniforms.uTime = v;
  }
}
