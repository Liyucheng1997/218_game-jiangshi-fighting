// 特效 / 界面用的无光照透明着色器：顶点色 × 材质色。
// _Soft > 0 时按 UV 生成圆形柔光（不需要贴图）；_Mode 0 = 叠加发光，1 = 普通半透明。
Shader "ZS/Fx"
{
    Properties
    {
        _Color ("Color", Color) = (1,1,1,1)
        _Soft ("Soft", Float) = 0
        [Enum(UnityEngine.Rendering.BlendMode)] _Src ("Src", Float) = 5
        [Enum(UnityEngine.Rendering.BlendMode)] _Dst ("Dst", Float) = 1
        [Enum(UnityEngine.Rendering.CompareFunction)] _ZTest ("ZTest", Float) = 4
    }
    SubShader
    {
        Tags { "RenderType"="Transparent" "Queue"="Transparent" "IgnoreProjector"="True" }
        Pass
        {
            Cull Off
            ZWrite Off
            ZTest [_ZTest]
            Blend [_Src] [_Dst]
            CGPROGRAM
            #pragma vertex vert
            #pragma fragment frag
            #pragma multi_compile_instancing
            #include "UnityCG.cginc"

            fixed4 _Color;
            float _Soft;

            struct appdata { float4 vertex : POSITION; fixed4 color : COLOR; float2 uv : TEXCOORD0; UNITY_VERTEX_INPUT_INSTANCE_ID };
            struct v2f { float4 pos : SV_POSITION; fixed4 col : COLOR0; float2 uv : TEXCOORD0; UNITY_VERTEX_OUTPUT_STEREO };

            v2f vert (appdata v)
            {
                v2f o;
                UNITY_SETUP_INSTANCE_ID(v);
                UNITY_INITIALIZE_OUTPUT(v2f, o);
                UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(o);
                o.pos = UnityObjectToClipPos(v.vertex);
                o.col = v.color * _Color;
                o.uv = v.uv;
                return o;
            }

            fixed4 frag (v2f i) : SV_Target
            {
                fixed4 c = i.col;
                if (_Soft > 0.0)
                {
                    float r = saturate(1.0 - length(i.uv - 0.5) * 2.0);
                    c.a *= pow(r, _Soft);
                }
                return c;
            }
            ENDCG
        }
    }
}
