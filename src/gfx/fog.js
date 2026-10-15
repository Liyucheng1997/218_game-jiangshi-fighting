import * as THREE from 'three';

// =====================================================================
//  体积感高度雾：贴地翻涌的夜雾 + 距离雾 + 朝月方向的散射
//  —— 替换 three 的雾着色器片段，对所有启用 fog 的材质全局生效。
//  借用 Fog 的两个 uniform：near = 密度，far = 时间（驱动雾气流动）。
// =====================================================================

const MOON_DIR = new THREE.Vector3(-0.5, 0.45, -0.75).normalize();

export class HeightFog extends THREE.Fog {
  constructor(color = 0x0c1018, density = 0.016) {
    super(color, density, 0);
    this.isHeightFog = true;
  }
  get density() { return this.near; }
  set density(v) { this.near = v; }
  get time() { return this.far; }
  set time(v) { this.far = v; }
}

let installed = false;
export function installHeightFog() {
  if (installed) return;
  installed = true;
  const md = MOON_DIR;
  THREE.ShaderChunk.fog_pars_vertex = /* glsl */`
#ifdef USE_FOG
  varying float vFogDepth;
  varying vec3 vFogWorld;
#endif`;
  THREE.ShaderChunk.fog_vertex = /* glsl */`
#ifdef USE_FOG
  vFogDepth = - mvPosition.z;
  vFogWorld = ( mvPosition.xyz - viewMatrix[ 3 ].xyz ) * mat3( viewMatrix );
#endif`;
  THREE.ShaderChunk.fog_pars_fragment = /* glsl */`
#ifdef USE_FOG
  uniform vec3 fogColor;
  varying float vFogDepth;
  varying vec3 vFogWorld;
  #ifdef FOG_EXP2
    uniform float fogDensity;
  #else
    uniform float fogNear;
    uniform float fogFar;
  #endif
  float hfHash( vec2 p ) { return fract( sin( dot( p, vec2( 127.1, 311.7 ) ) ) * 43758.5453 ); }
  float hfNoise( vec2 p ) {
    vec2 i = floor( p ), f = fract( p );
    vec2 u = f * f * ( 3.0 - 2.0 * f );
    return mix( mix( hfHash( i ), hfHash( i + vec2( 1.0, 0.0 ) ), u.x ), mix( hfHash( i + vec2( 0.0, 1.0 ) ), hfHash( i + vec2( 1.0, 1.0 ) ), u.x ), u.y );
  }
#endif`;
  // HDR 钳制：近镜面的积水在掠射角下，GGX 高光峰值可达数千（极端时超过半浮点上限变成 Inf），
  // 经 Bloom 会糊成一大团光斑。所有内置光照材质在输出前钳一次：高光依旧够亮，但不再"爆"。
  THREE.ShaderChunk.opaque_fragment = THREE.ShaderChunk.opaque_fragment.replace(
    'gl_FragColor = vec4( outgoingLight, diffuseColor.a );',
    'gl_FragColor = vec4( min( outgoingLight, vec3( 20.0 ) ), diffuseColor.a );',
  );
  THREE.ShaderChunk.fog_fragment = /* glsl */`
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, fogColor, fogFactor );
  #else
    vec3 hfRay = vFogWorld - cameraPosition;
    float hfDist = length( hfRay );
    float hfDen = fogNear;
    float hfT = fogFar;
    float hfOd = hfDen * hfDen * hfDist * hfDist * 0.5;
    float hfK = 0.6;
    float hfE0 = exp( - hfK * max( cameraPosition.y, -1.0 ) );
    float hfDy = hfRay.y;
    float hfAvg = abs( hfDy ) > 0.02 ? ( hfE0 - exp( - hfK * max( vFogWorld.y, -1.0 ) ) ) / ( hfK * hfDy ) : hfE0;
    float hfN = hfNoise( vFogWorld.xz * 0.09 + vec2( hfT * 0.045, hfT * 0.018 ) ) * 0.6
              + hfNoise( vFogWorld.xz * 0.31 - vec2( hfT * 0.07, hfT * 0.03 ) ) * 0.4;
    hfOd += hfAvg * hfDist * hfDen * 3.2 * ( 0.3 + 1.4 * hfN );
    float fogFactor = 1.0 - exp( - hfOd );
    vec3 hfDir = hfRay / max( hfDist, 1e-3 );
    float hfSun = pow( max( dot( hfDir, vec3( ${md.x.toFixed(4)}, ${md.y.toFixed(4)}, ${md.z.toFixed(4)} ) ), 0.0 ), 6.0 );
    vec3 hfCol = fogColor * ( 1.0 + hfSun * 1.4 );
    gl_FragColor.rgb = mix( gl_FragColor.rgb, hfCol, fogFactor );
  #endif
#endif`;
}

export { MOON_DIR };
