#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;

// ============================================================
// Hash / noise helpers
// ============================================================

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f); // smoothstep

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 4; i++) {
        val += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return val;
}

// ============================================================
// Multi-frequency sine wave distortion
// ============================================================

vec2 waveDistort(vec2 uv) {
    float t = uTime;

    // Layer 1: broad waves
    float wave1x = sin(uv.y * 12.0 + t * 1.2) * 0.004;
    float wave1y = cos(uv.x * 10.0 + t * 0.9) * 0.003;

    // Layer 2: medium ripples
    float wave2x = sin(uv.y * 25.0 + t * 2.5 + 1.7) * 0.002;
    float wave2y = cos(uv.x * 22.0 + t * 2.0 + 0.8) * 0.0015;

    // Layer 3: fine shimmer
    float wave3x = sin(uv.y * 50.0 + t * 4.0 + 3.2) * 0.001;
    float wave3y = cos(uv.x * 48.0 + t * 3.5 + 2.1) * 0.0008;

    return uv + vec2(
        wave1x + wave2x + wave3x,
        wave1y + wave2y + wave3y
    );
}

// ============================================================
// Caustic light pattern
// ============================================================

float caustics(vec2 uv) {
    float t = uTime * 0.6;
    vec2 p = uv * 8.0;

    // Two rotating noise layers for caustic intersection pattern
    float c1 = noise(p + vec2(t * 0.7, t * 0.3));
    float c2 = noise(p * 1.4 + vec2(-t * 0.5, t * 0.8));

    // Caustics form at intersection of wave crests
    float caustic = pow(c1 * c2, 1.5) * 4.0;
    return clamp(caustic, 0.0, 1.0);
}

// ============================================================
// Specular highlight
// ============================================================

float specular(vec2 uv) {
    float t = uTime;

    // Simulate sun reflection
    float n1 = noise(uv * 15.0 + vec2(t * 0.8, t * 0.4));
    float n2 = noise(uv * 20.0 + vec2(-t * 0.6, t * 1.1));

    float spec = pow(n1 * n2, 3.0) * 6.0;
    return clamp(spec, 0.0, 1.0);
}

// ============================================================
// Foam at edges
// ============================================================

float foamPattern(vec2 uv) {
    float t = uTime * 0.4;
    float n = fbm(uv * 12.0 + vec2(t, t * 0.3));

    // Create foam where alpha would be low (edge of water tiles)
    // Use a noise threshold for organic foam shapes
    float foam = smoothstep(0.55, 0.7, n);

    // Animate foam bubbling
    foam *= (0.7 + 0.3 * sin(uTime * 3.0 + uv.x * 20.0));

    return foam;
}

// ============================================================
// Main
// ============================================================

void main() {
    vec2 uv = vTextureCoord;

    // Wave distortion
    vec2 distorted = waveDistort(uv);

    // Sample base texture with distorted UVs
    vec4 baseColor = texture(uTexture, distorted);

    // --- Water color modulation ---
    // Deeper blue toward centre, lighter at edges
    vec2 center = uv - 0.5;
    float distFromCenter = length(center);
    float depthFactor = smoothstep(0.0, 0.6, distFromCenter);

    // Base water tint
    vec3 deepColor  = vec3(0.05, 0.12, 0.35);
    vec3 shallowColor = vec3(0.15, 0.35, 0.50);
    vec3 waterTint = mix(deepColor, shallowColor, depthFactor);

    // Blend tint with base texture
    vec3 col = mix(baseColor.rgb, waterTint, 0.45);

    // --- Caustic patterns (stronger in shallow areas) ---
    float caust = caustics(uv);
    float caustStrength = mix(0.15, 0.35, depthFactor);
    col += vec3(0.6, 0.8, 1.0) * caust * caustStrength;

    // --- Specular highlights ---
    float spec = specular(uv);
    col += vec3(1.0, 0.95, 0.85) * spec * 0.35;

    // --- Foam at edges ---
    float foam = foamPattern(uv);
    // Foam is more prominent at edges
    float edgeFoamMask = smoothstep(0.35, 0.5, distFromCenter);
    col = mix(col, vec3(0.85, 0.9, 0.95), foam * edgeFoamMask * 0.6);

    // --- Slight colour oscillation for shimmer ---
    float shimmer = sin(uTime * 2.0 + uv.x * 30.0 + uv.y * 20.0) * 0.02;
    col.b += shimmer;
    col.g += shimmer * 0.5;

    finalColor = vec4(clamp(col, 0.0, 1.0), baseColor.a);
}
