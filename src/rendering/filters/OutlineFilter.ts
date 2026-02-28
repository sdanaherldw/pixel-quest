import { Filter, GlProgram } from 'pixi.js';

import vertex from './default.vert';
import fragment from '../shaders/outline.frag';

/**
 * Sprite outline / selection highlight filter.
 *
 * Draws a coloured outline around opaque sprite pixels by sampling
 * neighbouring alpha values.
 */
export class OutlineFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({ vertex, fragment });

    super({
      glProgram,
      resources: {
        filterUniforms: {
          uOutlineColor: { value: [1.0, 1.0, 0.0, 1.0], type: 'vec4<f32>' },
          uThickness: { value: 2, type: 'f32' },
          uResolution: { value: [1280, 720], type: 'vec2<f32>' },
        },
      },
    });
  }

  get outlineColor(): Float32Array {
    return this.resources.filterUniforms.uniforms.uOutlineColor;
  }

  set outlineColor(v: [number, number, number, number]) {
    this.resources.filterUniforms.uniforms.uOutlineColor = v;
  }

  get thickness(): number {
    return this.resources.filterUniforms.uniforms.uThickness;
  }

  set thickness(v: number) {
    this.resources.filterUniforms.uniforms.uThickness = v;
  }

  get textureResolution(): Float32Array {
    return this.resources.filterUniforms.uniforms.uResolution;
  }

  set textureResolution(v: [number, number]) {
    this.resources.filterUniforms.uniforms.uResolution = v;
  }
}
