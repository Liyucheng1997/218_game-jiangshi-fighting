using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>
    /// 场景：义庄院落。全部程序生成，静态部分烘成一两个大网格（一次绘制）。
    /// 坐标：+Z 为北（正堂），玩家开局在南侧面朝正堂。
    /// </summary>
    public class World
    {
        public readonly List<Bounds> obstacles = new List<Bounds>();
        public readonly List<Vector3> spawnPoints = new List<Vector3>();
        public Transform root;
        public Ambience amb;
        public float flash;                 // 闪电
        Transform sky, gateSet, emberSet, rainSet;
        readonly List<Transform> lanterns = new List<Transform>();
        readonly List<Vector3> lanternBase = new List<Vector3>();
        readonly List<Vector3> ghostFires = new List<Vector3>();
        float t;

        const float H = Data.ArenaHalf;

        public World()
        {
            root = new GameObject("World").transform;
            BuildSky();
            BuildStatic();
            BuildSets();
        }

        // ------------------------------------------------------------ 构建
        void BuildSky()
        {
            var b = new MeshB();
            b.Sphere(Vector3.zero, 300f, Color.white, 24, 12);
            var go = b.Spawn("Sky", root, Mats.Sky());
            go.GetComponent<MeshFilter>().sharedMesh.bounds = new Bounds(Vector3.zero, Vector3.one * 100000f);
            sky = go.transform;
        }

        void Obstacle(float x, float z, float w, float d, float h = 3f)
        {
            obstacles.Add(new Bounds(new Vector3(x, h / 2, z), new Vector3(w, h, d)));
        }

        void BuildStatic()
        {
            var b = new MeshB();
            var rnd = new System.Random(7);
            float R() => (float)rnd.NextDouble();

            // 石板地面：2 米一格，明暗略有参差
            for (int ix = -19; ix < 19; ix++)
                for (int iz = -19; iz < 19; iz++)
                {
                    float x = ix * 2f, z = iz * 2f;
                    float k = 0.80f + R() * 0.28f;
                    bool path = Mathf.Abs(x + 1f) < 3f;                         // 中轴甬道略亮
                    var c = Col.Mul(Col.H(path ? 0x6c6a66 : 0x55565a), k);
                    b.Quad(new Vector3(x + 0.03f, 0, z + 0.03f), new Vector3(x + 0.03f, 0, z + 1.97f), new Vector3(x + 1.97f, 0, z + 1.97f), new Vector3(x + 1.97f, 0, z + 0.03f), c);
                }
            // 砖缝底色 + 院外荒地
            b.Quad(new Vector3(-38, -0.02f, -38), new Vector3(-38, -0.02f, 38), new Vector3(38, -0.02f, 38), new Vector3(38, -0.02f, -38), Col.H(0x2c2d30));
            b.Quad(new Vector3(-160, -0.05f, -160), new Vector3(-160, -0.05f, 160), new Vector3(160, -0.05f, 160), new Vector3(160, -0.05f, -160), Col.H(0x1c2018));

            // 院墙（四面，南面留门）
            Color wall = Col.H(0x8a8478), cap = Col.H(0x2a2c30);
            void Wall(float x0, float z0, float x1, float z1)
            {
                float cx = (x0 + x1) / 2, cz = (z0 + z1) / 2, w = Mathf.Abs(x1 - x0) + 0.8f, d = Mathf.Abs(z1 - z0) + 0.8f;
                b.Box(new Vector3(cx, 1.6f, cz), new Vector3(w, 3.2f, d), wall);
                b.Box(new Vector3(cx, 3.35f, cz), new Vector3(w + 0.5f, 0.3f, d + 0.5f), cap);
            }
            Wall(-H, H, H, H); Wall(-H, -H, -5, -H); Wall(5, -H, H, -H); Wall(-H, -H, -H, H); Wall(H, -H, H, H);

            // 南门楼
            b.Box(new Vector3(-5.2f, 2.6f, -H), new Vector3(1.2f, 5.2f, 1.6f), Col.H(0x5a1c14));
            b.Box(new Vector3(5.2f, 2.6f, -H), new Vector3(1.2f, 5.2f, 1.6f), Col.H(0x5a1c14));
            b.Roof(new Vector3(0, 5.2f, -H), 14f, 4.4f, 1.8f, 9f, cap);
            Obstacle(-5.2f, -H, 1.4f, 1.8f, 5); Obstacle(5.2f, -H, 1.4f, 1.8f, 5);

            // 正堂（北）
            Hall(b, 0, 29, 20, 9, 5.2f, "义庄");
            // 东西厢房
            Hall(b, -29, 12, 8, 12, 3.6f, null, true);
            Hall(b, 29, 14, 8, 12, 3.6f, null, true);
            Hall(b, -29, -12, 8, 10, 3.4f, null, true);

            // 香炉（院心）
            b.Cyl(new Vector3(0, 0, 10), 1.1f, 0.9f, 0.5f, Col.H(0x4a4a50), 10);
            b.Cyl(new Vector3(0, 0.5f, 10), 0.75f, 1.0f, 0.9f, Col.H(0x6a5a30), 10);
            b.Cyl(new Vector3(0, 1.4f, 10), 0.9f, 0.9f, 0.08f, Col.H(0xff8a30, 0.8f), 10);
            Obstacle(0, 10, 2.2f, 2.2f, 1.6f);

            // 停尸棺材（院中两列）
            for (int i = 0; i < 6; i++)
            {
                float x = (i % 2 == 0 ? -1 : 1) * (9f + (i / 2) * 0.4f), z = -6f + (i / 2) * 7.5f;
                float ry = (R() - 0.5f) * 24f;
                b.Push(new Vector3(x, 0, z), new Vector3(0, ry, 0));
                b.Box(new Vector3(0, 0.3f, 0), new Vector3(1.0f, 0.12f, 0.5f), Col.H(0x3a2a1c)).Box(new Vector3(0, 0.3f, 1.2f), new Vector3(1.0f, 0.12f, 0.5f), Col.H(0x3a2a1c));
                b.Box(new Vector3(0, 0.72f, 0.6f), new Vector3(0.85f, 0.7f, 2.2f), Col.H(0x2a1408));
                b.Box(new Vector3(0, 1.12f, 0.6f), new Vector3(0.95f, 0.12f, 2.35f), Col.H(0x3c1c0c));
                b.Box(new Vector3(0, 0.85f, -0.52f), new Vector3(0.5f, 0.3f, 0.03f), Col.H(0xe8d8a0, 0.35f));   // 棺头符
                b.Pop();
                Obstacle(x, z + 0.6f, 1.5f, 2.6f, 1.2f);
            }

            // 石灯（发光）与灯笼杆
            foreach (var p in new[] { new Vector3(-6, 0, -20), new Vector3(6, 0, -20), new Vector3(-6, 0, 18), new Vector3(6, 0, 18), new Vector3(-20, 0, 0), new Vector3(20, 0, 0) })
            {
                b.Box(p + new Vector3(0, 0.25f, 0), new Vector3(0.7f, 0.5f, 0.7f), Col.H(0x5a5a5e));
                b.Cyl(p + new Vector3(0, 0.5f, 0), 0.16f, 0.16f, 1.0f, Col.H(0x66666a), 6);
                b.Box(p + new Vector3(0, 1.72f, 0), new Vector3(0.5f, 0.44f, 0.5f), Col.H(0xffb060, 0.95f));
                b.Roof(p + new Vector3(0, 1.94f, 0), 0.9f, 0.9f, 0.4f, 0, Col.H(0x4a4a4e));
                Obstacle(p.x, p.z, 0.8f, 0.8f, 2.2f);
            }

            // 水缸、石碑、枯树（院内零散掩体）
            foreach (var p in new[] { new Vector3(-16, 0, 22), new Vector3(17, 0, -8), new Vector3(-22, 0, -24) })
            {
                b.Cyl(p, 0.7f, 0.95f, 1.1f, Col.H(0x4a3c30), 10);
                b.Disc(p + new Vector3(0, 1.0f, 0), 0.85f, Col.H(0x101820), 10);
                Obstacle(p.x, p.z, 1.9f, 1.9f, 1.1f);
            }
            foreach (var p in new[] { new Vector3(14, 0, 24), new Vector3(-14, 0, -16), new Vector3(24, 0, -22) })
            {
                b.Box(p + new Vector3(0, 0.15f, 0), new Vector3(1.3f, 0.3f, 0.6f), Col.H(0x55565a));
                b.Box(p + new Vector3(0, 1.15f, 0), new Vector3(0.9f, 1.8f, 0.22f), Col.H(0x6a6c70));
                Obstacle(p.x, p.z, 1.3f, 0.7f, 2f);
            }
            foreach (var p in new[] { new Vector3(-24, 0, 26), new Vector3(23, 0, 27), new Vector3(-12, 0, 2), new Vector3(15, 0, 6) })
            {
                Tree(b, p, 4.5f + R() * 1.5f, true, rnd);
                Obstacle(p.x, p.z, 0.8f, 0.8f, 3f);
            }

            // 纸钱（散落地面）
            for (int i = 0; i < 160; i++)
            {
                float x = (R() - 0.5f) * 66f, z = (R() - 0.5f) * 66f, a = R() * 180f;
                b.Push(new Vector3(x, 0.012f, z), new Vector3(0, a, 0));
                b.Quad(new Vector3(-0.09f, 0, -0.09f), new Vector3(-0.09f, 0, 0.09f), new Vector3(0.09f, 0, 0.09f), new Vector3(0.09f, 0, -0.09f), Col.H(0xd8ccaa));
                b.Pop();
            }

            // 院外：坟包、松林、远山
            for (int i = 0; i < 46; i++)
            {
                float a = R() * Mathf.PI * 2, r = 44f + R() * 30f;
                var p = new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r);
                if (R() < 0.35f)
                {
                    b.Sphere(p, new Vector3(1.4f, 0.8f, 1.4f), Col.H(0x24281e), 8, 4);
                    b.Box(p + new Vector3(0, 0.6f, -1.3f), new Vector3(0.5f, 1.0f, 0.12f), Col.H(0x55565a));
                }
                else Tree(b, p, 7f + R() * 6f, false, rnd);
            }
            for (int i = 0; i < 18; i++)
            {
                float a = i / 18f * Mathf.PI * 2 + R() * 0.2f, r = 120f + R() * 30f;
                float w = 50f + R() * 40f, h = 18f + R() * 22f;
                b.Push(new Vector3(Mathf.Cos(a) * r, -2, Mathf.Sin(a) * r), new Vector3(0, -a * Mathf.Rad2Deg + 90, 0));
                b.Roof(Vector3.zero, w, 30f, h, w * 0.15f, Col.H(0x0c1016));
                b.Pop();
            }

            b.Spawn("Static", root);

            // 刷怪点：院墙内四周 + 棺材旁
            foreach (var p in new[] {
                new Vector3(-30, 0, 30), new Vector3(30, 0, 30), new Vector3(-30, 0, -30), new Vector3(30, 0, -30),
                new Vector3(0, 0, -32), new Vector3(-32, 0, 0), new Vector3(32, 0, 0), new Vector3(-18, 0, 30), new Vector3(18, 0, 30),
                new Vector3(-12, 0, -30), new Vector3(12, 0, -30), new Vector3(-20, 0, -4), new Vector3(20, 0, 22) })
                spawnPoints.Add(p);

            // 灯笼（会晃，单独的物体）
            LanternAt(new Vector3(-7.5f, 4.3f, 23.8f)); LanternAt(new Vector3(7.5f, 4.3f, 23.8f)); LanternAt(new Vector3(-2.5f, 4.3f, 23.8f), true); LanternAt(new Vector3(2.5f, 4.3f, 23.8f), true);
            LanternAt(new Vector3(-4.2f, 4.0f, -H + 1.2f)); LanternAt(new Vector3(4.2f, 4.0f, -H + 1.2f));
            LanternAt(new Vector3(-24.6f, 3.0f, 12)); LanternAt(new Vector3(24.6f, 3.0f, 14)); LanternAt(new Vector3(-24.6f, 3.0f, -12));

            // 鬼火位置（每帧由特效系统画）
            for (int i = 0; i < 12; i++) ghostFires.Add(new Vector3((R() - 0.5f) * 60f, 0.8f + R() * 1.6f, (R() - 0.5f) * 60f));
        }

        void Hall(MeshB b, float x, float z, float w, float d, float h, string sign, bool side = false)
        {
            Color red = Col.H(0x6a1c14), wood = Col.H(0x3a2416), plaster = Col.H(0x9a9486), tile = Col.H(0x22252a);
            b.Box(new Vector3(x, 0.25f, z), new Vector3(w + 2.4f, 0.5f, d + 2.4f), Col.H(0x5c5c60));
            b.Box(new Vector3(x, 0.5f + h / 2, z), new Vector3(w, h, d), plaster);
            // 朝院心的一面：柱、门、窗（发暖光）
            float fx = side ? Mathf.Sign(-x) : 0, fz = side ? 0 : -1;
            Vector3 face = new Vector3(x + fx * (w / 2 + 0.02f), 0, z + fz * (d / 2 + 0.02f));
            float span = side ? d : w;
            int cols = Mathf.Max(2, Mathf.RoundToInt(span / 4f));
            for (int i = 0; i <= cols; i++)
            {
                float u = (i / (float)cols - 0.5f) * span;
                var p = face + (side ? new Vector3(fx * 0.5f, 0, u) : new Vector3(u, 0, fz * 0.5f));
                b.Cyl(new Vector3(p.x, 0.5f, p.z), 0.22f, 0.2f, h, red, 8);
            }
            for (int i = 0; i < cols; i++)
            {
                float u = ((i + 0.5f) / cols - 0.5f) * span;
                bool door = i == cols / 2;
                var size = side ? new Vector3(0.08f, door ? h * 0.72f : h * 0.38f, span / cols * 0.62f) : new Vector3(span / cols * 0.62f, door ? h * 0.72f : h * 0.38f, 0.08f);
                var p = face + (side ? new Vector3(0, 0, u) : new Vector3(u, 0, 0));
                p.y = door ? 0.5f + size.y / 2 : 0.5f + h * 0.52f;
                b.Box(p, size, door ? Col.H(0x1a0c06) : Col.H(0xffa850, 0.85f));
                if (!door) b.Box(p, size + (side ? new Vector3(0.02f, 0.14f, 0.14f) : new Vector3(0.14f, 0.14f, 0.02f)), wood);
            }
            // 屋顶：出檐 + 屋脊
            b.Roof(new Vector3(x, 0.5f + h, z), w + 3.2f, d + 3.2f, h * 0.55f, side ? 0.01f : w * 0.55f, tile);
            if (side)
            {
                // 厢房屋脊沿 Z：再盖一层旋转 90° 的
                b.Push(new Vector3(x, 0.5f + h, z), new Vector3(0, 90, 0));
                b.Roof(Vector3.zero, d + 3.2f, w + 3.2f, h * 0.6f, d * 0.55f, tile);
                b.Pop();
            }
            if (sign != null) b.Box(new Vector3(x, 0.5f + h - 0.5f, z - d / 2 - 0.6f), new Vector3(3.2f, 0.9f, 0.12f), Col.H(0x1c0e06));
            Obstacle(x, z, w + 1.2f, d + 1.2f, h + 2);
        }

        void Tree(MeshB b, Vector3 p, float h, bool dead, System.Random rnd)
        {
            b.Cyl(p, 0.28f, 0.12f, h * (dead ? 1f : 0.45f), Col.H(0x2a2018), 6);
            if (dead)
            {
                for (int i = 0; i < 5; i++)
                {
                    float a = (float)rnd.NextDouble() * 360f, tilt = 35f + (float)rnd.NextDouble() * 35f;
                    b.Push(p + new Vector3(0, h * (0.45f + i * 0.1f), 0), new Vector3(tilt, a, 0));
                    b.Cyl(Vector3.zero, 0.09f, 0.03f, h * 0.4f, Col.H(0x241a12), 5, false);
                    b.Pop();
                }
            }
            else
            {
                for (int i = 0; i < 3; i++)
                    b.Cyl(p + new Vector3(0, h * (0.25f + i * 0.22f), 0), h * (0.24f - i * 0.055f), 0.02f, h * 0.42f, Col.H(i == 0 ? 0x0e1a14 : 0x122018), 7, false);
            }
        }

        void LanternAt(Vector3 p, bool white = false)
        {
            var b = new MeshB();
            Color body = white ? Col.H(0xfff0d8, 0.9f) : Col.H(0xff4a22, 0.9f), dark = Col.H(0x1a0e08);
            b.Cyl(new Vector3(0, -0.02f, 0), 0.01f, 0.01f, 0.5f, dark, 4, false);
            b.Sphere(new Vector3(0, -0.3f, 0), new Vector3(0.3f, 0.34f, 0.3f), body, 10, 6);
            b.Cyl(new Vector3(0, -0.02f, 0), 0.13f, 0.13f, 0.06f, dark, 8);
            b.Cyl(new Vector3(0, -0.66f, 0), 0.13f, 0.13f, 0.06f, dark, 8);
            b.Cyl(new Vector3(0, -0.98f, 0), 0.02f, 0.07f, 0.32f, Col.H(0xd8b030), 6, false);
            var go = b.Spawn("Lantern", root);
            go.transform.position = p;
            lanterns.Add(go.transform); lanternBase.Add(new Vector3(Random.value * 10f, Random.value * 10f, 0));
        }

        void BuildSets()
        {
            // 鬼门（第三、四章）：北墙外的巨大石门 + 门内旋涡
            var b = new MeshB();
            Color stone = Col.H(0x241418);
            b.Box(new Vector3(-9, 9, 0), new Vector3(3, 18, 3), stone).Box(new Vector3(9, 9, 0), new Vector3(3, 18, 3), stone).Box(new Vector3(0, 19, 0), new Vector3(24, 3, 3.4f), stone);
            b.Roof(new Vector3(0, 20.5f, 0), 28, 6, 3, 18, Col.H(0x140a0e));
            b.Box(new Vector3(0, 9, 0.4f), new Vector3(15, 17.5f, 0.2f), Col.H(0xb030ff, 1f));
            b.Box(new Vector3(0, 9, 0.3f), new Vector3(11, 14f, 0.2f), Col.H(0x400a70, 1f));
            var g = b.Spawn("GateSet", root);
            g.transform.position = new Vector3(0, 0, H + 14);
            gateSet = g.transform;
            // 地裂（发红光的裂缝）
            var cb = new MeshB();
            var rnd = new System.Random(3);
            for (int i = 0; i < 26; i++)
            {
                float x = ((float)rnd.NextDouble() - 0.5f) * 60f, z = ((float)rnd.NextDouble() - 0.5f) * 60f, a = (float)rnd.NextDouble() * 180f, len = 2f + (float)rnd.NextDouble() * 5f;
                cb.Push(new Vector3(x, 0.02f, z), new Vector3(0, a, 0));
                cb.Quad(new Vector3(-len / 2, 0, -0.06f), new Vector3(-len / 2, 0, 0.06f), new Vector3(len / 2, 0, 0.1f), new Vector3(len / 2, 0, -0.1f), Col.H(0xff5020, 1f));
                cb.Pop();
            }
            emberSet = cb.Spawn("Cracks", root).transform;
        }

        // ------------------------------------------------------------ 氛围 / 每帧
        public void SetAmbience(Ambience a)
        {
            amb = a;
            gateSet.gameObject.SetActive(a.gate);
            emberSet.gameObject.SetActive(a.embers);
        }

        public void Lightning(float k = 1f) { flash = Mathf.Max(flash, k); }

        public void Update(float dt, Vector3 camPos, Fx fx)
        {
            t += dt;
            flash = Mathf.Max(0, flash - dt * 2.2f);
            float fl = flash > 0 ? flash * (0.6f + 0.4f * Mathf.Sin(t * 60f)) : 0;
            Mats.ApplyAmbience(amb, fl);
            sky.position = camPos;
            for (int i = 0; i < lanterns.Count; i++)
            {
                var s = lanternBase[i];
                lanterns[i].localRotation = Quaternion.Euler(Mathf.Sin(t * 0.9f + s.x) * 4f, 0, Mathf.Sin(t * 1.3f + s.y) * 5f);
            }
            // 鬼火：幽幽漂浮的光点
            var gf = amb.ghostFire;
            for (int i = 0; i < ghostFires.Count; i++)
            {
                var p = ghostFires[i];
                p.y += Mathf.Sin(t * 0.7f + i * 1.7f) * 0.25f; p.x += Mathf.Sin(t * 0.31f + i) * 0.8f;
                fx.Billboard(p, 0.5f + Mathf.Sin(t * 3f + i) * 0.08f, new Color(gf.r, gf.g, gf.b, 0.55f));
            }
            // 雨 / 余烬：围着玩家的环境粒子
            if (amb.rain) for (int i = 0; i < 3; i++)
            {
                var p = camPos + new Vector3((Random.value - 0.5f) * 24f, 6f + Random.value * 3f, (Random.value - 0.5f) * 24f);
                fx.Emit(p, new Vector3(0.6f, -22f, 0), 0.05f, 0.05f, 0.45f, new Color(0.6f, 0.7f, 0.85f, 0.35f), 0, true, 0.5f);
            }
            if (amb.embers && Random.value < dt * 30f)
            {
                var p = new Vector3(camPos.x + (Random.value - 0.5f) * 30f, 0.1f, camPos.z + (Random.value - 0.5f) * 30f);
                fx.Emit(p, new Vector3((Random.value - 0.5f) * 0.6f, 0.8f + Random.value * 1.2f, (Random.value - 0.5f) * 0.6f), 0.07f, 0.02f, 2.5f + Random.value * 2f, new Color(1f, 0.45f, 0.15f, 0.9f), -0.1f);
            }
            // 飘飞的纸钱
            if (Random.value < dt * 6f)
            {
                var p = new Vector3(camPos.x + (Random.value - 0.5f) * 30f, 4f + Random.value * 4f, camPos.z + (Random.value - 0.5f) * 30f);
                fx.Emit(p, new Vector3(0.8f + Random.value, -0.7f, (Random.value - 0.5f) * 0.8f), 0.11f, 0.11f, 6f, new Color(0.85f, 0.8f, 0.66f, 0.8f), 0, false);
            }
        }

        // ------------------------------------------------------------ 碰撞 / 射线
        /// <summary>把圆（位置 p、半径 r）推出障碍物与院墙。</summary>
        public Vector3 Collide(Vector3 p, float r, float feetY = 0f)
        {
            float lim = H - 0.9f - r;
            p.x = Mathf.Clamp(p.x, -lim, lim); p.z = Mathf.Clamp(p.z, -lim, lim);
            for (int i = 0; i < obstacles.Count; i++)
            {
                var o = obstacles[i];
                if (feetY > o.max.y - 0.05f) continue;
                float minX = o.min.x - r, maxX = o.max.x + r, minZ = o.min.z - r, maxZ = o.max.z + r;
                if (p.x <= minX || p.x >= maxX || p.z <= minZ || p.z >= maxZ) continue;
                float dl = p.x - minX, dr = maxX - p.x, db = p.z - minZ, df = maxZ - p.z;
                float m = Mathf.Min(Mathf.Min(dl, dr), Mathf.Min(db, df));
                if (m == dl) p.x = minX; else if (m == dr) p.x = maxX; else if (m == db) p.z = minZ; else p.z = maxZ;
            }
            return p;
        }

        public bool Blocked(Vector3 p, float r = 0.3f)
        {
            if (Mathf.Abs(p.x) > H - 1.2f || Mathf.Abs(p.z) > H - 1.2f) return true;
            for (int i = 0; i < obstacles.Count; i++)
            {
                var o = obstacles[i];
                if (p.x > o.min.x - r && p.x < o.max.x + r && p.z > o.min.z - r && p.z < o.max.z + r) return true;
            }
            return false;
        }

        /// <summary>射线打到地面 / 障碍 / 院墙的距离；没打到返回 -1。</summary>
        public float Raycast(Vector3 o, Vector3 d, float range)
        {
            float best = -1;
            if (d.y < -0.0001f) { float tt = -o.y / d.y; if (tt > 0 && tt < range) best = tt; }
            var ray = new Ray(o, d);
            for (int i = 0; i < obstacles.Count; i++)
                if (obstacles[i].IntersectRay(ray, out float dist) && dist > 0 && dist < range && (best < 0 || dist < best)) best = dist;
            // 院墙
            float wl = H - 0.4f;
            if (Mathf.Abs(d.x) > 1e-5f) { float tt = ((d.x > 0 ? wl : -wl) - o.x) / d.x; if (tt > 0 && tt < range && o.y + d.y * tt < 3.4f && (best < 0 || tt < best)) best = tt; }
            if (Mathf.Abs(d.z) > 1e-5f) { float tt = ((d.z > 0 ? wl : -wl) - o.z) / d.z; if (tt > 0 && tt < range && o.y + d.y * tt < 3.4f && (best < 0 || tt < best)) best = tt; }
            return best;
        }
    }
}
