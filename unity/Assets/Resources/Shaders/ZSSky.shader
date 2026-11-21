// 天空穹顶：竖向渐变 + 月亮（可血月日冕）+ 稀疏星点 + 一层便宜的流云。跟着相机走，永远画在最远处。
Shader "ZS/Sky"
{
    Properties { }
    SubShader
    {
        Tags { "RenderType"="Background" "Queue"="Background" }
        Pass
        {
            Cull Front
            ZWrite Off
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            float4 _ZSSkyTop, _ZSSkyHorizon, _ZSMoonDir, _ZSMoonDisc, _ZSCloudCol;
            float _ZSMoonSize, _ZSEclipse, _ZSFlash, _ZSTime;

            struct appdata { float4 vertex : POSITION; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct v2f { float4 pos : SV_POSITION; float3 dir : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };

            v2f vert (appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(v2f, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.dir = v.vertex.xyz;
                return o;
            }

            float hash (float2 p) { return frac(sin(dot(p, float2(127.1, 311.7))) * 43758.5453); }
            float noise (float2 p)
            {
                float2 i = floor(p), f = frac(p); float2 u = f * f * (3.0 - 2.0 * f);
                return lerp(lerp(hash(i), hash(i + float2(1, 0)), u.x), lerp(hash(i + float2(0, 1)), hash(i + float2(1, 1)), u.x), u.y);
            }

            fixed4 frag (v2f i) : SV_Target
            {
                float3 d = normalize(i.dir);
                float h = saturate(d.y);
                float3 col = lerp(_ZSSkyHorizon.rgb, _ZSSkyTop.rgb, pow(h, 0.55));
                float2 sp = d.xz / (d.y + 1.2) * 150.0;
                col += step(0.996, hash(floor(sp))) * smoothstep(0.05, 0.3, d.y) * float3(0.7, 0.75, 0.9);
                float md = dot(d, _ZSMoonDir.xyz);
                float disk = smoothstep(cos(_ZSMoonSize * 1.05), cos(_ZSMoonSize * 0.95), md);
                float3 moonCol = lerp(_ZSMoonDisc.rgb, _ZSMoonDisc.rgb * 0.05, _ZSEclipse);
                col += _ZSMoonDisc.rgb * (pow(saturate(md), 60.0) * 0.14 + pow(saturate(md), 600.0) * 0.5) * (1.0 + _ZSEclipse);
                col = lerp(col, moonCol, disk);
                float2 cp = d.xz / max(d.y + 0.15, 0.05) * 1.5 + float2(_ZSTime * 0.01, _ZSTime * 0.004);
                float c = smoothstep(0.5, 0.9, noise(cp) * 0.65 + noise(cp * 2.3 + 5.0) * 0.35);
                col = lerp(col, _ZSCloudCol.rgb + _ZSMoonDisc.rgb * pow(saturate(md), 6.0) * 0.3, c * 0.7 * smoothstep(0.0, 0.25, d.y) * (1.0 - disk));
                col += float3(0.5, 0.55, 0.75) * _ZSFlash * (0.3 + c) * smoothstep(-0.05, 0.3, d.y);
                return fixed4(col, 1);
            }
            ENDCG
        }
    }
}
