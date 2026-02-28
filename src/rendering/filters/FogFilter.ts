import { Filter, GlProgram } from 'pixi.js';

import vertex from './default.vert';
import fragment from '../shaders/fog.frag';

/**
 * Atmospheric fog / mist filter.
 *
 * Renders distance-based fog that drifts and swirls over time, blending
 * the scene with a configurable fog colour.
 */
export class FogFilter extends Filter {
  constructor() {
    const glProgram = GlProgram.from({ vertex, fragment });

    super({
      glProgram,
      resources: {
        filterUniforms: {
          uTime: { value: 0, type: 'f32' },
          uDensity: { value: 0.5, type: 'f32' },
          uFogColor: { value: [0.6, 0.65, 0.7], type: 'vec3<f32>' },
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

  get density(): number {
    return this.resources.filterUniforms.uniforms.uDensity;
  }

  set density(v: number) {
    this.resources.filterUniforms.uniforms.uDensity = v;
  }

  get fogColor(): Float32Array {
    return this.resources.filterUniforms.uniforms.uFogColor;
  }

  set fogColor(v: [number, number, number]) {
    this.resources.filterUniforms.uniforms.uFogColor = v;
  }

  get textureResolution(): Float32Array {
    return this.resources.filterUniforms.uniforms.uResolution;
  }

  set textureResolution(v: [number, number]) {
    this.resources.filterUniforms.uniforms.uResolution = v;
  }
}
