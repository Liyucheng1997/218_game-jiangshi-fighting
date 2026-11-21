using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>材质与全局光照参数。所有东西都用自写着色器，不依赖 Unity 灯光。</summary>
    public static class Mats
    {
        static Shader lit, fx, sky, text;
        static Material sharedLit;
        static readonly Dictionary<int, Material> fxCache = new Dictionary<int, Material>();

        static Shader Load(string name)
        {
            var s = Resources.Load<Shader>("Shaders/" + name);
            if (s == null) Debug.LogError("[ZS] shader missing: " + name);
            return s;
        }

        public static void Init()
        {
            lit = Load("ZSLit"); fx = Load("ZSFx"); sky = Load("ZSSky"); text = Load("ZSText");
            sharedLit = new Material(lit) { enableInstancing = true };
        }

        /// <summary>静态物体共用的受光材质（颜色全在顶点色里）。</summary>
        public static Material Lit => sharedLit;
        /// <summary>需要单独闪白 / 描边的物体（敌人）各用一份。</summary>
        public static Material NewLit() => new Material(lit) { enableInstancing = true };
        public static Material Sky() => new Material(sky);

        /// <summary>特效材质。additive: 叠加发光；soft: 圆形柔光指数（0 = 整块）；onTop: 无视深度。</summary>
        public static Material Fx(bool additive = true, float soft = 0, bool onTop = false, int queue = 3000)
        {
            int key = (additive ? 1 : 0) | (onTop ? 2 : 0) | (Mathf.RoundToInt(soft * 10) << 2) | (queue << 12);
            if (fxCache.TryGetValue(key, out var m)) return m;
            m = new Material(fx);
            m.SetFloat("_Soft", soft);
            m.SetFloat("_Src", (float)UnityEngine.Rendering.BlendMode.SrcAlpha);
            m.SetFloat("_Dst", (float)(additive ? UnityEngine.Rendering.BlendMode.One : UnityEngine.Rendering.BlendMode.OneMinusSrcAlpha));
            m.SetFloat("_ZTest", (float)(onTop ? UnityEngine.Rendering.CompareFunction.Always : UnityEngine.Rendering.CompareFunction.LessEqual));
            m.renderQueue = queue;
            fxCache[key] = m;
            return m;
        }

        public static Material Text(Font font, bool onTop)
        {
            var m = new Material(text);
            m.mainTexture = font.material.mainTexture;
            m.SetFloat("_ZTest", (float)(onTop ? UnityEngine.Rendering.CompareFunction.Always : UnityEngine.Rendering.CompareFunction.LessEqual));
            m.renderQueue = onTop ? 4100 : 3100;
            return m;
        }

        static readonly int idMoonDir = Shader.PropertyToID("_ZSMoonDir"), idMoonCol = Shader.PropertyToID("_ZSMoonCol"), idSky = Shader.PropertyToID("_ZSSkyCol"),
            idGround = Shader.PropertyToID("_ZSGroundCol"), idFog = Shader.PropertyToID("_ZSFogCol"), idFogD = Shader.PropertyToID("_ZSFogDensity"),
            idTop = Shader.PropertyToID("_ZSSkyTop"), idHor = Shader.PropertyToID("_ZSSkyHorizon"), idDisc = Shader.PropertyToID("_ZSMoonDisc"), idCloud = Shader.PropertyToID("_ZSCloudCol"),
            idMoonSize = Shader.PropertyToID("_ZSMoonSize"), idEclipse = Shader.PropertyToID("_ZSEclipse"), idFlash = Shader.PropertyToID("_ZSFlash"), idTime = Shader.PropertyToID("_ZSTime");

        public static Vector3 MoonDir = new Vector3(-0.5f, 0.45f, 0.75f).normalized;

        public static void ApplyAmbience(Ambience a, float flash = 0)
        {
            Shader.SetGlobalVector(idMoonDir, MoonDir);
            Shader.SetGlobalColor(idMoonCol, a.moonLight * (a.moonIntensity * 0.62f + flash * 1.5f));
            Shader.SetGlobalColor(idSky, a.hemiSky * (a.hemi * 1.5f + flash));
            Shader.SetGlobalColor(idGround, a.hemiGround * (a.hemi * 1.5f + flash * 0.5f));
            Shader.SetGlobalColor(idFog, Color.Lerp(a.fog, new Color(0.6f, 0.65f, 0.85f), flash * 0.4f));
            Shader.SetGlobalFloat(idFogD, a.fogDensity);
            Shader.SetGlobalColor(idTop, a.skyTop);
            Shader.SetGlobalColor(idHor, a.skyHorizon);
            Shader.SetGlobalColor(idDisc, a.moonColor);
            Shader.SetGlobalColor(idCloud, a.cloud);
            Shader.SetGlobalFloat(idMoonSize, a.moonSize);
            Shader.SetGlobalFloat(idEclipse, a.eclipse);
            Shader.SetGlobalFloat(idFlash, flash);
            Shader.SetGlobalFloat(idTime, Time.time);
        }
    }

    public static class Col
    {
        /// <summary>十六进制颜色；e = 自发光比例（写进顶点色 alpha）。</summary>
        public static Color H(int hex, float e = 0) => new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f, e);
        public static Color A(int hex, float a) => new Color(((hex >> 16) & 255) / 255f, ((hex >> 8) & 255) / 255f, (hex & 255) / 255f, a);
        public static Color Mul(Color c, float k) => new Color(c.r * k, c.g * k, c.b * k, c.a);
    }

    /// <summary>程序化网格拼装：盒 / 柱 / 球 / 锥 / 面片，带变换栈，颜色写进顶点色。</summary>
    public class MeshB
    {
        readonly List<Vector3> v = new List<Vector3>(), n = new List<Vector3>();
        readonly List<Color> c = new List<Color>();
        readonly List<Vector2> uv = new List<Vector2>();
        readonly List<int> t = new List<int>();
        public Matrix4x4 M = Matrix4x4.identity;
        readonly Stack<Matrix4x4> stack = new Stack<Matrix4x4>();

        public MeshB Push(Vector3 pos, Vector3 euler = default, Vector3? scale = null)
        {
            stack.Push(M);
            M = M * Matrix4x4.TRS(pos, Quaternion.Euler(euler), scale ?? Vector3.one);
            return this;
        }
        public MeshB Pop() { M = stack.Pop(); return this; }
        public int VertexCount => v.Count;

        int Add(Vector3 p, Vector3 nor, Color col, Vector2 u)
        {
            v.Add(M.MultiplyPoint3x4(p)); n.Add(M.MultiplyVector(nor).normalized); c.Add(col); uv.Add(u);
            return v.Count - 1;
        }

        public MeshB Quad(Vector3 a, Vector3 b, Vector3 cc, Vector3 d, Color col, bool twoSided = false)
        {
            var nor = Vector3.Cross(b - a, d - a).normalized;
            int i = Add(a, nor, col, new Vector2(0, 0)); Add(b, nor, col, new Vector2(1, 0)); Add(cc, nor, col, new Vector2(1, 1)); Add(d, nor, col, new Vector2(0, 1));
            t.Add(i); t.Add(i + 1); t.Add(i + 2); t.Add(i); t.Add(i + 2); t.Add(i + 3);
            if (twoSided) Quad(d, cc, b, a, col);
            return this;
        }

        public MeshB Box(Vector3 center, Vector3 size, Color col, Color? top = null)
        {
            Vector3 h = size * 0.5f, o = center;
            Vector3 P(float x, float y, float z) => o + new Vector3(x * h.x, y * h.y, z * h.z);
            Quad(P(-1, -1, 1), P(1, -1, 1), P(1, 1, 1), P(-1, 1, 1), col);        // +z
            Quad(P(1, -1, -1), P(-1, -1, -1), P(-1, 1, -1), P(1, 1, -1), col);    // -z
            Quad(P(1, -1, 1), P(1, -1, -1), P(1, 1, -1), P(1, 1, 1), col);        // +x
            Quad(P(-1, -1, -1), P(-1, -1, 1), P(-1, 1, 1), P(-1, 1, -1), col);    // -x
            Quad(P(-1, 1, 1), P(1, 1, 1), P(1, 1, -1), P(-1, 1, -1), top ?? col); // +y
            Quad(P(-1, -1, -1), P(1, -1, -1), P(1, -1, 1), P(-1, -1, 1), col);    // -y
            return this;
        }

        /// <summary>沿 Y 轴的圆台，底面中心在 basePos。</summary>
        public MeshB Cyl(Vector3 basePos, float rBottom, float rTop, float height, Color col, int seg = 10, bool caps = true)
        {
            int start = v.Count;
            float slope = (rBottom - rTop) / Mathf.Max(0.0001f, height);
            for (int i = 0; i <= seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f, cs = Mathf.Cos(a), sn = Mathf.Sin(a);
                var nor = new Vector3(cs, slope, sn).normalized;
                Add(basePos + new Vector3(cs * rBottom, 0, sn * rBottom), nor, col, new Vector2(i / (float)seg, 0));
                Add(basePos + new Vector3(cs * rTop, height, sn * rTop), nor, col, new Vector2(i / (float)seg, 1));
            }
            for (int i = 0; i < seg; i++)
            {
                int a = start + i * 2;
                t.Add(a); t.Add(a + 1); t.Add(a + 3); t.Add(a); t.Add(a + 3); t.Add(a + 2);
            }
            if (caps)
            {
                if (rTop > 0.0001f) Disc(basePos + new Vector3(0, height, 0), rTop, col, seg, true);
                if (rBottom > 0.0001f) Disc(basePos, rBottom, col, seg, false);
            }
            return this;
        }

        public MeshB Disc(Vector3 center, float r, Color col, int seg = 12, bool up = true)
        {
            var nor = up ? Vector3.up : Vector3.down;
            int ci = Add(center, nor, col, new Vector2(0.5f, 0.5f));
            for (int i = 0; i <= seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                Add(center + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r), nor, col, new Vector2(Mathf.Cos(a) * 0.5f + 0.5f, Mathf.Sin(a) * 0.5f + 0.5f));
            }
            for (int i = 0; i < seg; i++)
            {
                if (up) { t.Add(ci); t.Add(ci + i + 2); t.Add(ci + i + 1); }
                else { t.Add(ci); t.Add(ci + i + 1); t.Add(ci + i + 2); }
            }
            return this;
        }

        public MeshB Sphere(Vector3 center, Vector3 radii, Color col, int seg = 10, int rings = 6)
        {
            int start = v.Count;
            for (int y = 0; y <= rings; y++)
            {
                float th = y / (float)rings * Mathf.PI;
                for (int x = 0; x <= seg; x++)
                {
                    float ph = x / (float)seg * Mathf.PI * 2f;
                    var d = new Vector3(Mathf.Sin(th) * Mathf.Cos(ph), Mathf.Cos(th), Mathf.Sin(th) * Mathf.Sin(ph));
                    var nor = new Vector3(d.x / radii.x, d.y / radii.y, d.z / radii.z).normalized;
                    Add(center + Vector3.Scale(d, radii), nor, col, new Vector2(x / (float)seg, 1 - y / (float)rings));
                }
            }
            for (int y = 0; y < rings; y++)
                for (int x = 0; x < seg; x++)
                {
                    int a = start + y * (seg + 1) + x, b = a + seg + 1;
                    t.Add(a); t.Add(a + 1); t.Add(b + 1); t.Add(a); t.Add(b + 1); t.Add(b);
                }
            return this;
        }
        public MeshB Sphere(Vector3 center, float r, Color col, int seg = 10, int rings = 6) => Sphere(center, new Vector3(r, r, r), col, seg, rings);

        /// <summary>四坡 / 悬山屋顶：底边 w×d，屋脊长 ridge（0 = 攒尖），高 h。</summary>
        public MeshB Roof(Vector3 basePos, float w, float d, float h, float ridge, Color col)
        {
            float hw = w / 2, hd = d / 2, hr = ridge / 2;
            Vector3 a = basePos + new Vector3(-hw, 0, -hd), b = basePos + new Vector3(hw, 0, -hd), cc = basePos + new Vector3(hw, 0, hd), dd = basePos + new Vector3(-hw, 0, hd);
            Vector3 r0 = basePos + new Vector3(-hr, h, 0), r1 = basePos + new Vector3(hr, h, 0);
            Quad(b, a, r0, r1, col); Quad(dd, cc, r1, r0, col);
            Tri(a, dd, r0, col); Tri(cc, b, r1, col);
            Quad(a, b, cc, dd, Col.Mul(col, 0.5f));
            return this;
        }

        public MeshB Tri(Vector3 a, Vector3 b, Vector3 cc, Color col)
        {
            var nor = Vector3.Cross(b - a, cc - a).normalized;
            int i = Add(a, nor, col, Vector2.zero); Add(b, nor, col, Vector2.right); Add(cc, nor, col, Vector2.up);
            t.Add(i); t.Add(i + 1); t.Add(i + 2);
            return this;
        }

        public Mesh Build(string name = "mesh")
        {
            var m = new Mesh { name = name };
            if (v.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            m.SetVertices(v); m.SetNormals(n); m.SetColors(c); m.SetUVs(0, uv); m.SetTriangles(t, 0);
            m.RecalculateBounds();
            return m;
        }

        public GameObject Spawn(string name, Transform parent = null, Material mat = null)
        {
            var go = new GameObject(name);
            if (parent != null) go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = Build(name);
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat ?? Mats.Lit;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            r.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.Off;
            r.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
            return go;
        }
    }

    public static class Prim
    {
        static Mesh quad;
        /// <summary>单位面片（XY 平面，中心在原点，朝 -Z 和 +Z 都可见由材质决定）。</summary>
        public static Mesh Quad
        {
            get
            {
                if (quad != null) return quad;
                quad = new Mesh { name = "quad" };
                quad.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f, 0), new Vector3(0.5f, -0.5f, 0), new Vector3(0.5f, 0.5f, 0), new Vector3(-0.5f, 0.5f, 0) });
                quad.SetNormals(new List<Vector3> { Vector3.back, Vector3.back, Vector3.back, Vector3.back });
                quad.SetColors(new List<Color> { Color.white, Color.white, Color.white, Color.white });
                quad.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1) });
                quad.SetTriangles(new[] { 0, 2, 1, 0, 3, 2 }, 0);
                quad.RecalculateBounds();
                return quad;
            }
        }

        public static GameObject QuadObj(string name, Transform parent, Material mat, Color color, out MaterialPropertyBlock block)
        {
            var go = new GameObject(name);
            if (parent != null) go.transform.SetParent(parent, false);
            go.AddComponent<MeshFilter>().sharedMesh = Quad;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            block = new MaterialPropertyBlock();
            block.SetColor("_Color", color);
            r.SetPropertyBlock(block);
            return go;
        }
    }
}
