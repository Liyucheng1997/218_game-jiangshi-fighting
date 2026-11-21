// 顶点光照：顶点色 × 材质色，半球环境光 + 一盏月光，指数雾。
// 顶点色 alpha = 自发光比例（1 = 完全不受光，灯笼 / 鬼火 / 符纸）。
// 不依赖 Unity 的灯光系统：光照参数由脚本写进全局变量（内置管线 / URP 都能用，头显上最便宜）。
Shader "ZS/Lit"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _Flash ("Flash", Color) = (0,0,0,0)
        _Rim ("Rim", Color) = (0,0,0,0)
    }
    SubShader
    {
        Tags { "RenderType"="Opaque" "Queue"="Geometry" }
        Pass
        {
            Cull Back
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            fixed4 _Color, _Flash, _Rim;
            float4 _ZSMoonDir, _ZSMoonCol, _ZSSkyCol, _ZSGroundCol, _ZSFogCol;
            float _ZSFogDensity;

            struct appdata { float4 vertex : POSITION; float3 normal : NORMAL; fixed4 color : COLOR; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct v2f { float4 pos : SV_POSITION; fixed4 col : COLOR0; fixed fog : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };

            v2f vert (appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(v2f, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                float3 wp = mul(unity_ObjectToWorld, v.vertex).xyz;
                float3 n = UnityObjectToWorldNormal(v.normal);
                float3 base = v.color.rgb * _Color.rgb;
                float3 amb = lerp(_ZSGroundCol.rgb, _ZSSkyCol.rgb, n.y * 0.5 + 0.5);
                float ndl = saturate(dot(n, _ZSMoonDir.xyz) * 0.75 + 0.25);
                float3 lit = base * (amb + _ZSMoonCol.rgb * ndl);
                float3 view = normalize(_WorldSpaceCameraPos - wp);
                float rim = pow(1.0 - saturate(dot(n, view)), 3.0);
                lit += _Rim.rgb * rim;
                float3 c = lerp(lit, base * 1.6, v.color.a) + _Flash.rgb;
                float d = distance(_WorldSpaceCameraPos, wp);
                float hf = saturate(1.0 - wp.y * 0.045);               // 贴地更浓
                o.fog = saturate(1.0 - exp(-d * _ZSFogDensity * (0.55 + hf)));
                o.fog *= 1.0 - v.color.a * 0.6;                          // 自发光物体穿雾
                o.col = fixed4(c, 1);
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                return fixed4(lerp(i.col.rgb, _ZSFogCol.rgb, i.fog), 1);
            }
            ENDCG
        }
    }
}
