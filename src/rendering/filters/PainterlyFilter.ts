import { Filter, GlProgram } from 'pixi.js';

import vertex from './default.vert';
import fragment from '../shaders/painterly.frag';

/**
 * Post-processing filter that applies a painterly / oil-painting aesthetic.
 *
 * Combines Sobel edge darkening, brush-stroke UV displacement, colour
 * quantisation, paper-texture overlay, and vignette grading.
 */
export class PainterlyFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({ vertex, fragment });

    super({
      glProgram,
      resources: {
        filterUniforms: {
          uTime: { value: 0, type: 'f32' },
          uIntensity: { value: 0.3, type: 'f32' },
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

  get intensity(): number {
    return this.resources.filterUniforms.uniforms.uIntensity;
  }

  set intensity(v: number) {
    this.resources.filterUniforms.uniforms.uIntensity = v;
  }

  get textureResolution(): Float32Array {
    return this.resources.filterUniforms.uniforms.uResolution;
  }

  set textureResolution(v: [number, number]) {
    this.resources.filterUniforms.uniforms.uResolution = v;
  }
}
