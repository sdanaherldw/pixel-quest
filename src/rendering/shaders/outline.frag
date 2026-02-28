#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform vec4 uOutlineColor;  // RGBA outline colour
uniform float uThickness;    // 1-4 pixels

// ============================================================
// Outline detection via alpha sampling
// ============================================================

// Sample the alpha channel at an offset in pixel units
float sampleAlpha(vec2 uv, vec2 offsetPx) {
    vec2 texel = 1.0 / uResolution;
    return texture(uTexture, uv + offsetPx * texel).a;
}

// Check if any neighbouring pixel (within thickness) is transparent
// while the current pixel (or vice versa) is not, indicating an edge.
float outlineMask(vec2 uv) {
    float centerAlpha = texture(uTexture, uv).a;

    // For pixels outside the sprite, check if any neighbour is inside
    // For pixels inside the sprite, the outline is drawn outside

    float maxNeighbourAlpha = 0.0;

    // Sample in a ring at the specified thickness
    int steps = int(uThickness);

    for (int x = -steps; x <= steps; x++) {
        for (int y = -steps; y <= steps; y++) {
            if (x == 0 && y == 0) continue;

            // Circular radius check
            float dist = length(vec2(float(x), float(y)));
            if (dist > uThickness + 0.5) continue;

            float a = sampleAlpha(uv, vec2(float(x), float(y)));
            maxNeighbourAlpha = max(maxNeighbourAlpha, a);
        }
    }

    // Outline pixel: this pixel is transparent but a neighbour is opaque
    float outlineEdge = step(0.1, maxNeighbourAlpha) * step(centerAlpha, 0.1);

    return outlineEdge;
}

// ============================================================
// Subtle pulse animation for selected entities
// ============================================================

float pulseAlpha() {
    // uOutlineColor.a encodes base opacity; we modulate with a gentle pulse
    // The pulse uses a sine wave — since we don't have a dedicated uTime
    // uniform, we can still provide a static outline. If the host passes
    // a varying alpha in uOutlineColor.a the same effect is achieved.
    return uOutlineColor.a;
}

// ============================================================
// Main
// ============================================================

void main() {
    vec2 uv = vTextureCoord;

    vec4 baseColor = texture(uTexture, uv);

    // Compute outline mask
    float outline = outlineMask(uv);

    if (outline > 0.0) {
        // Draw outline pixel
        float alpha = pulseAlpha();
        finalColor = vec4(uOutlineColor.rgb, alpha);
    } else {
        // Pass through original pixel
        finalColor = baseColor;
    }
}
