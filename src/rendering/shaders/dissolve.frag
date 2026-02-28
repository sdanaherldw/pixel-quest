#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uProgress;   // 0 = fully visible, 1 = fully dissolved
uniform float uTime;

// ============================================================
// Noise functions
// ============================================================

float hash(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    f = f * f * (3.0 - 2.0 * f);

    float a = hash(i);
    float b = hash(i + vec2(1.0, 0.0));
    float c = hash(i + vec2(0.0, 1.0));
    float d = hash(i + vec2(1.0, 1.0));

    return mix(mix(a, b, f.x), mix(c, d, f.x), f.y);
}

float fbm(vec2 p) {
    float val = 0.0;
    float amp = 0.5;
    for (int i = 0; i < 5; i++) {
        val += amp * noise(p);
        p *= 2.0;
        amp *= 0.5;
    }
    return val;
}

// ============================================================
// Dissolve edge glow colours
// ============================================================

// Element emission colours (selected via noise for variety)
vec3 fireGlow   = vec3(1.0, 0.4, 0.05);
vec3 iceGlow    = vec3(0.2, 0.6, 1.0);
vec3 holyGlow   = vec3(1.0, 0.9, 0.4);
vec3 shadowGlow = vec3(0.5, 0.1, 0.8);

vec3 getGlowColor(vec2 uv) {
    // Use positional noise to vary the glow colour
    float selector = noise(uv * 3.0 + 100.0);
    if (selector < 0.25) return fireGlow;
    if (selector < 0.50) return iceGlow;
    if (selector < 0.75) return holyGlow;
    return shadowGlow;
}

// ============================================================
// Main
// ============================================================

void main() {
    vec2 uv = vTextureCoord;

    // Base colour
    vec4 baseColor = texture(uTexture, uv);

    // If fully visible, pass through
    if (uProgress <= 0.0) {
        finalColor = baseColor;
        return;
    }

    // If fully dissolved, output transparent
    if (uProgress >= 1.0) {
        finalColor = vec4(0.0);
        return;
    }

    // --- Noise-based dissolve pattern ---
    // Multi-scale noise creates an organic dissolution boundary
    float dissolveNoise = fbm(uv * 8.0 + uTime * 0.3);

    // Bias dissolution from edges inward
    vec2 center = uv - 0.5;
    float edgeDist = 1.0 - length(center) * 1.5;
    edgeDist = clamp(edgeDist, 0.0, 1.0);

    // Combine noise with edge bias
    float dissolveMask = dissolveNoise * 0.6 + edgeDist * 0.4;

    // Threshold based on progress
    float threshold = uProgress;

    // Fully dissolved pixels
    if (dissolveMask < threshold) {
        // Particle scatter effect — sparse pixels remain briefly
        float scatter = hash(uv * 100.0 + uTime);
        float scatterMask = step(0.97, scatter) * step(threshold - 0.08, dissolveMask);

        if (scatterMask > 0.0) {
            // Scattered glow particle
            vec3 glow = getGlowColor(uv);
            float particleAlpha = (1.0 - uProgress) * 0.8;
            finalColor = vec4(glow * 2.0, particleAlpha);
        } else {
            finalColor = vec4(0.0);
        }
        return;
    }

    // --- Glowing edge at dissolve boundary ---
    float edgeWidth = 0.06;
    float edgeFactor = smoothstep(threshold, threshold + edgeWidth, dissolveMask);
    float glowIntensity = 1.0 - edgeFactor;

    // Glow colour based on element
    vec3 glowColor = getGlowColor(uv);

    // Emission at the dissolve edge
    vec3 col = baseColor.rgb;
    col = mix(col, glowColor * 2.5, glowIntensity * glowIntensity);

    // Fade alpha near the dissolve boundary
    float alphaFade = smoothstep(threshold, threshold + edgeWidth * 0.5, dissolveMask);

    finalColor = vec4(col, baseColor.a * alphaFade);
}
