using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>
    /// 特效：所有粒子 / 光束 / 光环每帧拼进两张动态网格（叠加发光一张、半透明一张），各一次绘制。
    /// </summary>
    public class Fx : MonoBehaviour
    {
        struct P { public Vector3 pos, vel; public float size, sizeEnd, life, max, gravity, stretch; public Color col; public bool add; }
        struct Beam { public Vector3 a, b; public float width, life, max; public Color col; }
        struct Ring { public Vector3 pos; public float r0, r1, life, max, width; public Color col; }

        readonly List<P> ps = new List<P>(2048);
        readonly List<Beam> beams = new List<Beam>(64);
        readonly List<Ring> rings = new List<Ring>(32);

        class Batch
        {
            public Mesh mesh; public readonly List<Vector3> v = new List<Vector3>(8192); public readonly List<Color> c = new List<Color>(8192);
            public readonly List<Vector2> uv = new List<Vector2>(8192); public readonly List<int> t = new List<int>(12288);
            public void Clear() { v.Clear(); c.Clear(); uv.Clear(); t.Clear(); }
            public void Quad(Vector3 a, Vector3 b, Vector3 cc, Vector3 d, Color col, bool soft = true)
            {
                int i = v.Count;
                v.Add(a); v.Add(b); v.Add(cc); v.Add(d);
                c.Add(col); c.Add(col); c.Add(col); c.Add(col);
                if (soft) { uv.Add(new Vector2(0, 0)); uv.Add(new Vector2(1, 0)); uv.Add(new Vector2(1, 1)); uv.Add(new Vector2(0, 1)); }
                else { var h = new Vector2(0.5f, 0.5f); uv.Add(h); uv.Add(h); uv.Add(h); uv.Add(h); }
                t.Add(i); t.Add(i + 1); t.Add(i + 2); t.Add(i); t.Add(i + 2); t.Add(i + 3);
            }
            public void Apply()
            {
                mesh.Clear();
                mesh.SetVertices(v); mesh.SetColors(c); mesh.SetUVs(0, uv); mesh.SetTriangles(t, 0, false);
                mesh.bounds = new Bounds(Vector3.zero, Vector3.one * 10000f);
            }
        }
        Batch add, alpha;
        Transform cam;
        Vector3 camR, camU, camPos;

        public static Fx Create(Transform camera)
        {
            var go = new GameObject("Fx");
            var f = go.AddComponent<Fx>();
            f.cam = camera;
            f.add = f.MakeBatch("FxAdd", Mats.Fx(true, 1.6f));
            f.alpha = f.MakeBatch("FxAlpha", Mats.Fx(false, 1.2f, false, 2990));
            return f;
        }

        Batch MakeBatch(string name, Material mat)
        {
            var go = new GameObject(name);
            go.transform.SetParent(transform, false);
            var b = new Batch { mesh = new Mesh { name = name } };
            b.mesh.MarkDynamic();
            b.mesh.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
            go.AddComponent<MeshFilter>().sharedMesh = b.mesh;
            var r = go.AddComponent<MeshRenderer>();
            r.sharedMaterial = mat;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            r.receiveShadows = false;
            return b;
        }

        // ------------------------------------------------------------ 发射
        public void Emit(Vector3 pos, Vector3 vel, float size, float sizeEnd, float life, Color col, float gravity = 0, bool additive = true, float stretch = 0)
        {
            if (ps.Count > 2600) return;
            ps.Add(new P { pos = pos, vel = vel, size = size, sizeEnd = sizeEnd, life = life, max = life, col = col, gravity = gravity, add = additive, stretch = stretch });
        }

        public void AddBeam(Vector3 a, Vector3 b, float width, Color col, float life = 0.08f) { beams.Add(new Beam { a = a, b = b, width = width, col = col, life = life, max = life }); }
        public void AddRing(Vector3 pos, float r0, float r1, Color col, float life = 0.5f, float width = 0.35f) { rings.Add(new Ring { pos = pos, r0 = r0, r1 = r1, col = col, life = life, max = life, width = width }); }

        static Vector3 Rnd(float k) => new Vector3(Random.value - 0.5f, Random.value - 0.5f, Random.value - 0.5f) * (2f * k);

        public void Sparks(Vector3 p, int n, Color col, float speed = 5f)
        {
            for (int i = 0; i < n; i++) Emit(p, Rnd(speed) + Vector3.up * speed * 0.3f, 0.07f, 0.01f, 0.25f + Random.value * 0.25f, col, 9f, true, 0.06f);
        }
        public void Blood(Vector3 p, Vector3 dir, int n, Color col)
        {
            for (int i = 0; i < n; i++) Emit(p, dir * (1.5f + Random.value * 2.5f) + Rnd(1.6f), 0.11f, 0.03f, 0.35f + Random.value * 0.3f, col, 11f, false);
        }
        public void Puff(Vector3 p, Color col, int n = 8, float size = 0.5f)
        {
            for (int i = 0; i < n; i++) Emit(p + Rnd(0.3f), Rnd(1.2f) + Vector3.up * 0.6f, size * 0.5f, size * 1.6f, 0.5f + Random.value * 0.5f, new Color(col.r, col.g, col.b, 0.45f), -0.5f, false);
        }
        public void Fire(Vector3 p, float radius, int n = 24)
        {
            for (int i = 0; i < n; i++)
            {
                var o = Rnd(radius * 0.5f); o.y = Mathf.Abs(o.y) * 0.5f;
                Emit(p + o, new Vector3(o.x, 2f + Random.value * 3f, o.z), 0.55f, 0.1f, 0.4f + Random.value * 0.5f, new Color(1f, 0.5f + Random.value * 0.3f, 0.12f, 0.85f), -1f);
            }
            AddRing(p + Vector3.up * 0.05f, 0.3f, radius, new Color(1f, 0.6f, 0.2f, 0.9f), 0.35f, 0.5f);
        }
        public void Explosion(Vector3 p, float radius, Color col)
        {
            Fire(p, radius, 36);
            Sparks(p + Vector3.up * 0.5f, 26, col, 9f);
            Emit(p + Vector3.up * 0.8f, Vector3.zero, radius * 2.2f, radius * 0.5f, 0.18f, new Color(col.r, col.g, col.b, 0.9f));
        }
        public void Bolt(Vector3 from, Vector3 to, Color col, float width = 0.14f, float life = 0.22f)
        {
            // 折线闪电
            Vector3 prev = from;
            int seg = 7;
            for (int i = 1; i <= seg; i++)
            {
                var p = Vector3.Lerp(from, to, i / (float)seg);
                if (i < seg) p += Rnd(0.7f);
                AddBeam(prev, p, width, col, life);
                prev = p;
            }
            Emit(to, Vector3.zero, 2.4f, 0.6f, 0.2f, col);
        }
        public void LevelUp(Vector3 feet)
        {
            AddRing(feet + Vector3.up * 0.05f, 0.4f, 4f, new Color(1f, 0.85f, 0.4f, 0.9f), 0.7f);
            for (int i = 0; i < 26; i++) { float a = i / 26f * 6.283f; Emit(feet + new Vector3(Mathf.Cos(a) * 0.7f, 0.1f, Mathf.Sin(a) * 0.7f), Vector3.up * (2f + Random.value * 2f), 0.12f, 0.02f, 0.8f, new Color(1f, 0.85f, 0.4f, 0.9f)); }
        }

        // ------------------------------------------------------------ 即时绘制（只活一帧，每帧自己调用）
        readonly List<(Vector3, float, Color)> imm = new List<(Vector3, float, Color)>(256);
        readonly List<(Vector3, float, Color, float)> immDisc = new List<(Vector3, float, Color, float)>(32);
        public void Billboard(Vector3 pos, float size, Color col) { imm.Add((pos, size, col)); }
        /// <summary>地面圆（预警 / 法阵）：fill 0..1 为内圈填充进度。</summary>
        public void GroundDisc(Vector3 pos, float radius, Color col, float fill = 1f) { immDisc.Add((pos, radius, col, fill)); }

        // ------------------------------------------------------------ 每帧
        void LateUpdate()
        {
            float dt = Time.deltaTime;
            camPos = cam.position; camR = cam.right; camU = cam.up;
            add.Clear(); alpha.Clear();

            for (int i = ps.Count - 1; i >= 0; i--)
            {
                var p = ps[i];
                p.life -= dt;
                if (p.life <= 0) { ps[i] = ps[ps.Count - 1]; ps.RemoveAt(ps.Count - 1); continue; }
                p.vel.y -= p.gravity * dt;
                p.pos += p.vel * dt;
                if (p.pos.y < 0.02f && p.gravity > 0) { p.pos.y = 0.02f; p.vel = Vector3.zero; }
                ps[i] = p;
                float k = p.life / p.max;
                float s = Mathf.Lerp(p.sizeEnd, p.size, k) * 0.5f;
                var col = p.col; col.a *= Mathf.Min(1f, k * 2.2f);
                var bt = p.add ? add : alpha;
                if (p.stretch > 0 && p.vel.sqrMagnitude > 0.01f)
                {
                    var dir = p.vel * p.stretch;
                    var side = Vector3.Cross(dir, camPos - p.pos).normalized * s;
                    bt.Quad(p.pos - dir - side, p.pos - dir + side, p.pos + dir + side, p.pos + dir - side, col, false);
                }
                else bt.Quad(p.pos - camR * s - camU * s, p.pos + camR * s - camU * s, p.pos + camR * s + camU * s, p.pos - camR * s + camU * s, col);
            }

            for (int i = imm.Count - 1; i >= 0; i--)
            {
                var (pos, size, col) = imm[i];
                float s = size * 0.5f;
                add.Quad(pos - camR * s - camU * s, pos + camR * s - camU * s, pos + camR * s + camU * s, pos - camR * s + camU * s, col);
            }
            imm.Clear();

            for (int i = beams.Count - 1; i >= 0; i--)
            {
                var b = beams[i];
                b.life -= dt;
                if (b.life <= 0) { beams[i] = beams[beams.Count - 1]; beams.RemoveAt(beams.Count - 1); continue; }
                beams[i] = b;
                var col = b.col; col.a *= b.life / b.max;
                var mid = (b.a + b.b) * 0.5f;
                var side = Vector3.Cross(b.b - b.a, camPos - mid).normalized * (b.width * 0.5f);
                add.Quad(b.a - side, b.a + side, b.b + side, b.b - side, col, false);
            }

            for (int i = rings.Count - 1; i >= 0; i--)
            {
                var r = rings[i];
                r.life -= dt;
                if (r.life <= 0) { rings[i] = rings[rings.Count - 1]; rings.RemoveAt(rings.Count - 1); continue; }
                rings[i] = r;
                float k = 1f - r.life / r.max;
                float rad = Mathf.Lerp(r.r0, r.r1, 1f - (1f - k) * (1f - k));
                var col = r.col; col.a *= 1f - k;
                Annulus(add, r.pos, Mathf.Max(0, rad - r.width), rad, col, new Color(col.r, col.g, col.b, 0));
            }

            for (int i = 0; i < immDisc.Count; i++)
            {
                var (pos, radius, col, fill) = immDisc[i];
                var edge = col; edge.a = Mathf.Min(1f, col.a * 2.2f);
                Annulus(alpha, pos, radius * 0.94f, radius, edge, edge);
                var inner = col; inner.a *= 0.55f;
                if (fill > 0.01f) Annulus(alpha, pos, 0, radius * Mathf.Clamp01(fill), inner, inner);
            }
            immDisc.Clear();

            add.Apply(); alpha.Apply();
        }

        static void Annulus(Batch bt, Vector3 c, float r0, float r1, Color cOuter, Color cInner)
        {
            const int seg = 28;
            Vector3 prevI = c + new Vector3(r0, 0, 0), prevO = c + new Vector3(r1, 0, 0);
            for (int i = 1; i <= seg; i++)
            {
                float a = i / (float)seg * Mathf.PI * 2f;
                float cs = Mathf.Cos(a), sn = Mathf.Sin(a);
                Vector3 pi = c + new Vector3(cs * r0, 0, sn * r0), po = c + new Vector3(cs * r1, 0, sn * r1);
                int k = bt.v.Count;
                bt.v.Add(prevI); bt.v.Add(prevO); bt.v.Add(po); bt.v.Add(pi);
                bt.c.Add(cInner); bt.c.Add(cOuter); bt.c.Add(cOuter); bt.c.Add(cInner);
                var h = new Vector2(0.5f, 0.5f); bt.uv.Add(h); bt.uv.Add(h); bt.uv.Add(h); bt.uv.Add(h);
                bt.t.Add(k); bt.t.Add(k + 1); bt.t.Add(k + 2); bt.t.Add(k); bt.t.Add(k + 2); bt.t.Add(k + 3);
                prevI = pi; prevO = po;
            }
        }

        public void Clear() { ps.Clear(); beams.Clear(); rings.Clear(); }
    }
}
