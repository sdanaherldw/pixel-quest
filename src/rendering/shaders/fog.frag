#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uDensity;    // 0.0 = no fog, 1.0 = fully opaque
uniform vec3 uFogColor;    // e.g. (0.6, 0.65, 0.7)

// ============================================================
// Noise functions
// ============================================================

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 10.0) * x); }

float snoise(vec2 v) {
    const vec4 C = vec4(
        0.211324865405187,
        0.366025403784439,
       -0.577350269189626,
        0.024390243902439
    );

    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);

    vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

    vec4 x12 = x0.xyxy + C.xxzz;
    x12.xy -= i1;

    i = mod289(i);
    vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0))
                             + i.x + vec3(0.0, i1.x, 1.0));

    vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy),
                             dot(x12.zw, x12.zw)), 0.0);
    m = m * m;
    m = m * m;

    vec3 x  = 2.0 * fract(p * C.www) - 1.0;
    vec3 h  = abs(x) - 0.5;
    vec3 ox = floor(x + 0.5);
    vec3 a0 = x - ox;

    m *= 1.79284291400159 - 0.85373472095314 * (a0 * a0 + h * h);

    vec3 g;
    g.x = a0.x * x0.x + h.x * x0.y;
    g.yz = a0.yz * x12.xz + h.yz * x12.yw;

    return 130.0 * dot(m, g);
}

// Fractional Brownian motion with 5 octaves for rich fog detail
float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    float freq = 1.0;
    for (int i = 0; i < 5; i++) {
        val += amp * snoise(p * freq);
        freq *= 2.0;
        amp *= 0.5;
    }
    return val;
}

// ============================================================
// Distance-based fog mask
// ============================================================

float distanceFog(vec2 uv) {
    // Thicker at edges of viewport, clear in centre
    vec2 center = uv - 0.5;
    float dist = length(center) * 2.0; // 0 at centre, ~1.4 at corners
    return smoothstep(0.2, 1.2, dist);
}

// ============================================================
// Animated drift fog
// ============================================================

float driftFog(vec2 uv) {
    float t = uTime * 0.08;

    // Two drifting noise layers at different scales and speeds
    vec2 drift1 = vec2(t * 1.0, t * 0.3);
    vec2 drift2 = vec2(-t * 0.7, t * 0.5);

    float n1 = fbm(uv * 3.0 + drift1);
    float n2 = fbm(uv * 5.0 + drift2 + 42.0);

    // Combine with swirl
    float swirl = snoise(uv * 2.0 + vec2(n1, n2) * 0.5 + vec2(t * 0.2));

    return (n1 * 0.5 + n2 * 0.3 + swirl * 0.2) * 0.5 + 0.5;
}

// ============================================================
// Main
// ============================================================

void main() {
    vec2 uv = vTextureCoord;

    // Base scene colour
    vec4 scene = texture(uTexture, uv);

    // Distance-based mask (thicker at viewport edges)
    float distMask = distanceFog(uv);

    // Animated drift pattern
    float drift = driftFog(uv);

    // Combined fog factor
    float fogAmount = distMask * drift * uDensity;
    fogAmount = clamp(fogAmount, 0.0, 1.0);

    // Smoothly blend scene with fog colour
    vec3 col = mix(scene.rgb, uFogColor, fogAmount);

    // Slight luminance variation in the fog itself for depth
    float fogLuma = 1.0 + snoise(uv * 6.0 + uTime * 0.1) * 0.04 * uDensity;
    col *= fogLuma;

    finalColor = vec4(clamp(col, 0.0, 1.0), scene.a);
}
