#version 300 es
precision highp float;

in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uResolution;
uniform float uTime;
uniform float uIntensity; // 0-1

// ============================================================
// Noise functions (Simplex-like via hashing)
// ============================================================

vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x * 34.0) + 10.0) * x); }

// 2D simplex noise
float snoise(vec2 v) {
    const vec4 C = vec4(
        0.211324865405187,   // (3.0 - sqrt(3.0)) / 6.0
        0.366025403784439,   // 0.5 * (sqrt(3.0) - 1.0)
       -0.577350269189626,   // -1.0 + 2.0 * C.x
        0.024390243902439    // 1.0 / 41.0
    );

    vec2 i  = floor(v + dot(v, C.yy));
    vec2 x0 = v - i + dot(i, C.xx);

    vec2 i1;
    i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);

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

// Fractional Brownian motion
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
// Pass 1: Sobel Edge Detection
// ============================================================

float sobelEdge(vec2 uv) {
    vec2 texel = 1.0 / uResolution;

    // Sample 3x3 neighbourhood luminance
    float tl = dot(texture(uTexture, uv + vec2(-texel.x,  texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tm = dot(texture(uTexture, uv + vec2(     0.0,  texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float tr = dot(texture(uTexture, uv + vec2( texel.x,  texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float ml = dot(texture(uTexture, uv + vec2(-texel.x,      0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float mr = dot(texture(uTexture, uv + vec2( texel.x,      0.0)).rgb, vec3(0.299, 0.587, 0.114));
    float bl = dot(texture(uTexture, uv + vec2(-texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float bm = dot(texture(uTexture, uv + vec2(     0.0, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));
    float br = dot(texture(uTexture, uv + vec2( texel.x, -texel.y)).rgb, vec3(0.299, 0.587, 0.114));

    float gx = -tl - 2.0*ml - bl + tr + 2.0*mr + br;
    float gy = -tl - 2.0*tm - tr + bl + 2.0*bm + br;

    return sqrt(gx * gx + gy * gy);
}

// ============================================================
// Pass 2: Brush Stroke UV Displacement
// ============================================================

vec2 brushDisplace(vec2 uv) {
    float scale = 8.0;
    float strength = 0.003 * uIntensity;
    float t = uTime * 0.05;

    // Noise-driven direction field
    float nx = snoise(uv * scale + vec2(t, 0.0));
    float ny = snoise(uv * scale + vec2(0.0, t + 43.0));

    return uv + vec2(nx, ny) * strength;
}

// ============================================================
// Pass 3: Color Palette Quantization with Dithering
// ============================================================

vec3 quantizeColor(vec3 col) {
    // Number of colour levels per channel (32-64 effective levels)
    float levels = mix(64.0, 32.0, uIntensity);

    // Ordered dithering matrix (Bayer 4x4 approximation)
    vec2 coord = gl_FragCoord.xy;
    float dither = fract(dot(floor(mod(coord, 4.0)), vec2(1.0 / 17.0, 4.0 / 17.0)));
    dither = (dither - 0.5) * (1.0 / levels);

    vec3 q = floor((col + dither) * levels + 0.5) / levels;
    return clamp(q, 0.0, 1.0);
}

// Warm forest tone shift
vec3 warmShift(vec3 col) {
    // Gently push toward warm forest tones
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 warm = vec3(
        col.r * 1.05 + 0.02,
        col.g * 1.02,
        col.b * 0.92 - 0.01
    );
    return mix(col, warm, uIntensity * 0.5);
}

// ============================================================
// Pass 4: Paper/Canvas Texture Overlay
// ============================================================

float paperNoise(vec2 uv) {
    // Fine grain canvas texture
    float n1 = snoise(uv * 200.0);
    float n2 = snoise(uv * 400.0 + 17.3);
    return (n1 * 0.6 + n2 * 0.4);
}

// ============================================================
// Pass 5: Vignette + Atmospheric Color Grading
// ============================================================

vec3 vignette(vec3 col, vec2 uv) {
    vec2 center = uv - 0.5;
    float dist = length(center);
    float vig = smoothstep(0.7, 0.3, dist);
    return col * mix(1.0, vig, 0.4 * uIntensity);
}

vec3 atmosphericGrade(vec3 col) {
    // Subtle blue shadows, warm highlights
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    vec3 shadowTint = vec3(0.05, 0.05, 0.12);
    vec3 highlightTint = vec3(0.08, 0.06, 0.02);
    col += mix(shadowTint, highlightTint, luma) * uIntensity * 0.3;
    return clamp(col, 0.0, 1.0);
}

// ============================================================
// Main
// ============================================================

void main() {
    vec2 uv = vTextureCoord;

    // Pass 2: Brush stroke displacement
    vec2 displaced = brushDisplace(uv);

    // Sample with displaced UVs
    vec4 baseColor = texture(uTexture, displaced);
    vec3 col = baseColor.rgb;

    // Pass 1: Edge detection (subtle darkening along edges)
    float edge = sobelEdge(uv);
    float edgeDarken = 1.0 - smoothstep(0.1, 0.5, edge) * 0.15 * uIntensity;
    col *= edgeDarken;

    // Pass 3: Warm tone shift + quantization
    col = warmShift(col);
    col = mix(baseColor.rgb, quantizeColor(col), uIntensity * 0.7);

    // Pass 4: Paper texture
    float paper = paperNoise(uv);
    col += paper * 0.025 * uIntensity;

    // Pass 5: Vignette + atmosphere
    col = vignette(col, uv);
    col = atmosphericGrade(col);

    // Slight saturation boost for painterly feel
    float gray = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(gray), col, 1.0 + 0.15 * uIntensity);

    finalColor = vec4(clamp(col, 0.0, 1.0), baseColor.a);
}
