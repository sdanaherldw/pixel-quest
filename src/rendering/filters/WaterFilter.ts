import { Filter, GlProgram } from 'pixi.js';

import vertex from './default.vert';
import fragment from '../shaders/water.frag';

/**
 * Animated water surface filter.
 *
 * Applies multi-frequency wave distortion, caustic light patterns,
 * specular highlights, and foam effects.
 */
export class WaterFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({ vertex, fragment });

    super({
      glProgram,
      resources: {
        filterUniforms: {
          uTime: { value: 0, type: 'f32' },
          uResolution: { value: [1280, 720], type: 'vec2<f32>' },
        },
      },
    });
  }

  get time(): number {
    return this.resources.filterUniforms.uniforms.uTime;
  }

  set time(v: number) {
    this.resources.filterUniforms.uniforms.uTime = v;
  }

  get textureResolution(): Float32Array {
    return this.resources.filterUniforms.uniforms.uResolution;
  }

  set textureResolution(v: [number, number]) {
    this.resources.filterUniforms.uniforms.uResolution = v;
  }
}
