using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>邪祟的程序化模型：每种一个网格（面朝 +Z，脚底在 y=0），整只怪一次绘制。</summary>
    public static class EnemyModels
    {
        static readonly Dictionary<string, Mesh> cache = new Dictionary<string, Mesh>();

        public static float Height(EnemyDef d)
        {
            switch (d.look)
            {
                case "imp": return 1.05f;
                case "paper": return 1.55f;
                case "ghost": return 1.8f;
                case "wu": return 2.5f;
                case "hou": return 2.3f;
                case "sorcerer": return 2.05f;
                default: return 1.9f;
            }
        }

        public static Mesh Get(EnemyDef d)
        {
            if (cache.TryGetValue(d.id, out var m)) return m;
            var b = new MeshB();
            Color skin = Col.H(d.skin), robe = Col.H(d.robe), trim = Col.H(d.trim);
            switch (d.look)
            {
                case "imp": Imp(b, skin, robe, trim); break;
                case "paper": Paper(b, skin, robe, trim); break;
                case "ghost": Ghost(b, skin, robe, trim); break;
                case "wu": Wu(b, skin, robe, trim, d.id == "wuWhite"); break;
                case "soldier": Soldier(b, skin, robe, trim); break;
                case "sorcerer": Sorcerer(b, skin, robe, trim); break;
                case "hou": Hou(b, skin, robe, trim); break;
                default: Jiangshi(b, d, skin, robe, trim); break;
            }
            m = b.Build(d.id);
            cache[d.id] = m;
            return m;
        }

        static void Face(MeshB b, float y, float z, float s, Color eye, bool fangs = false)
        {
            b.Box(new Vector3(-0.075f * s, y, z), new Vector3(0.055f, 0.03f, 0.02f) * s, eye);
            b.Box(new Vector3(0.075f * s, y, z), new Vector3(0.055f, 0.03f, 0.02f) * s, eye);
            b.Box(new Vector3(0, y - 0.12f * s, z), new Vector3(0.11f, 0.025f, 0.02f) * s, Col.H(0x200808));
            if (fangs)
            {
                b.Box(new Vector3(-0.04f * s, y - 0.15f * s, z), new Vector3(0.02f, 0.05f, 0.02f) * s, Col.H(0xf0f0e0));
                b.Box(new Vector3(0.04f * s, y - 0.15f * s, z), new Vector3(0.02f, 0.05f, 0.02f) * s, Col.H(0xf0f0e0));
            }
        }

        // 清朝官服僵尸：双臂平举，额贴黄符，顶戴花翎
        static void Jiangshi(MeshB b, EnemyDef d, Color skin, Color robe, Color trim)
        {
            Color dark = Col.Mul(robe, 0.6f);
            b.Cyl(new Vector3(0, 0, 0), 0.3f, 0.22f, 0.85f, robe, 8);                              // 下摆
            b.Box(new Vector3(0, 1.15f, 0), new Vector3(0.52f, 0.62f, 0.3f), robe);                // 躯干
            b.Box(new Vector3(0, 1.12f, 0.155f), new Vector3(0.26f, 0.3f, 0.02f), trim);           // 补子
            b.Box(new Vector3(0, 0.86f, 0), new Vector3(0.54f, 0.07f, 0.32f), dark);               // 腰带
            b.Box(new Vector3(-0.1f, 0.03f, 0.06f), new Vector3(0.14f, 0.07f, 0.3f), Col.H(0x101010));
            b.Box(new Vector3(0.1f, 0.03f, 0.06f), new Vector3(0.14f, 0.07f, 0.3f), Col.H(0x101010));
            for (int s = -1; s <= 1; s += 2)
            {
                b.Box(new Vector3(s * 0.31f, 1.34f, 0.26f), new Vector3(0.13f, 0.13f, 0.62f), robe);   // 平举的手臂
                b.Box(new Vector3(s * 0.31f, 1.34f, 0.6f), new Vector3(0.15f, 0.15f, 0.08f), trim);
                b.Box(new Vector3(s * 0.31f, 1.34f, 0.7f), new Vector3(0.1f, 0.05f, 0.16f), skin);     // 手
                for (int k = -1; k <= 1; k++) b.Box(new Vector3(s * 0.31f + k * 0.03f, 1.33f, 0.82f), new Vector3(0.015f, 0.015f, 0.09f), Col.H(0x1a1a1a));   // 指甲
            }
            b.Cyl(new Vector3(0, 1.44f, 0), 0.08f, 0.08f, 0.08f, skin, 6);                         // 颈
            b.Sphere(new Vector3(0, 1.64f, 0), new Vector3(0.17f, 0.2f, 0.18f), skin, 10, 7);      // 头
            Face(b, 1.66f, 0.175f, 1, Col.H(0xff3020, 0.9f), true);
            b.Cyl(new Vector3(0, 1.76f, 0), 0.27f, 0.2f, 0.05f, Col.H(0x101014), 12);              // 帽檐
            b.Cyl(new Vector3(0, 1.8f, 0), 0.19f, 0.12f, 0.13f, Col.H(0x15151a), 12);
            b.Sphere(new Vector3(0, 1.96f, 0), 0.045f, Col.H(0xd02020, 0.4f), 6, 4);               // 顶珠
            b.Box(new Vector3(0, 1.3f, -0.17f), new Vector3(0.05f, 0.7f, 0.05f), Col.H(0x0c0c0c)); // 辫子
            b.Box(new Vector3(0, 1.6f, 0.2f), new Vector3(0.1f, 0.3f, 0.012f), Col.H(0xf0d040, 0.55f));   // 镇尸符
            b.Box(new Vector3(0, 1.62f, 0.208f), new Vector3(0.03f, 0.2f, 0.012f), Col.H(0xb01010, 0.3f));
            if (d.id == "hairy" || d.id == "white" || d.id == "green")
            {
                var fur = d.id == "white" ? Col.H(0xf4f4ee) : d.id == "green" ? Col.H(0x3a7a3a) : Col.H(0x4a3a2a);
                var rnd = new System.Random(d.id.GetHashCode());
                for (int i = 0; i < 26; i++)
                {
                    float a = (float)rnd.NextDouble() * 6.283f, y = 0.5f + (float)rnd.NextDouble() * 1.0f;
                    b.Push(new Vector3(Mathf.Cos(a) * 0.27f, y, Mathf.Sin(a) * 0.17f), new Vector3((float)rnd.NextDouble() * 60 - 30, -a * Mathf.Rad2Deg + 90, 0));
                    b.Cyl(Vector3.zero, 0.035f, 0.0f, 0.16f, fur, 4, false);
                    b.Pop();
                }
            }
            if (d.id == "drought")
            {
                for (int i = 0; i < 6; i++) { float a = i / 6f * 6.283f; b.Box(new Vector3(Mathf.Cos(a) * 0.3f, 1.05f + (i % 2) * 0.3f, Mathf.Sin(a) * 0.2f), new Vector3(0.05f, 0.25f, 0.05f), Col.H(0xff7020, 1f)); }
                b.Sphere(new Vector3(0, 1.15f, 0.16f), 0.1f, Col.H(0xffa030, 1f), 8, 5);
            }
        }

        static void Imp(MeshB b, Color skin, Color robe, Color trim)
        {
            b.Sphere(new Vector3(0, 0.48f, 0), new Vector3(0.24f, 0.26f, 0.2f), skin, 8, 6);
            b.Box(new Vector3(0, 0.36f, 0), new Vector3(0.4f, 0.16f, 0.3f), robe);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Box(new Vector3(s * 0.11f, 0.12f, 0), new Vector3(0.1f, 0.26f, 0.12f), skin);
                b.Box(new Vector3(s * 0.11f, 0.02f, 0.06f), new Vector3(0.12f, 0.05f, 0.22f), skin);
                b.Push(new Vector3(s * 0.27f, 0.55f, 0.1f), new Vector3(-50, 0, s * -18));
                b.Box(new Vector3(0, -0.18f, 0), new Vector3(0.08f, 0.4f, 0.08f), skin);
                b.Box(new Vector3(0, -0.4f, 0.03f), new Vector3(0.11f, 0.08f, 0.13f), Col.Mul(skin, 0.7f));
                b.Pop();
                b.Push(new Vector3(s * 0.12f, 0.98f, 0), new Vector3(0, 0, s * -22));
                b.Cyl(Vector3.zero, 0.04f, 0f, 0.16f, Col.H(0xe8e0c0), 5, false);                  // 角
                b.Pop();
                b.Box(new Vector3(s * 0.23f, 0.84f, 0), new Vector3(0.05f, 0.16f, 0.1f), skin);    // 尖耳
            }
            b.Sphere(new Vector3(0, 0.82f, 0.03f), new Vector3(0.21f, 0.19f, 0.2f), skin, 9, 6);
            Face(b, 0.84f, 0.215f, 1.25f, Col.H(0xffe040, 1f), true);
        }

        static void Paper(MeshB b, Color skin, Color robe, Color trim)
        {
            // 纸扎童男童女：扁平、艳丽、胭脂腮红
            b.Box(new Vector3(0, 0.55f, 0), new Vector3(0.5f, 0.9f, 0.1f), robe);
            b.Box(new Vector3(0, 0.55f, 0.052f), new Vector3(0.12f, 0.9f, 0.01f), trim);
            b.Box(new Vector3(0, 0.12f, 0), new Vector3(0.56f, 0.06f, 0.11f), Col.H(0xf0d040));
            for (int s = -1; s <= 1; s += 2)
            {
                b.Push(new Vector3(s * 0.3f, 0.95f, 0), new Vector3(0, 0, s * 28));
                b.Box(new Vector3(0, -0.24f, 0), new Vector3(0.14f, 0.56f, 0.08f), robe);
                b.Box(new Vector3(0, -0.55f, 0), new Vector3(0.1f, 0.1f, 0.05f), skin);
                b.Pop();
                b.Sphere(new Vector3(s * 0.16f, 1.44f, -0.02f), 0.08f, Col.H(0x101010), 6, 4);     // 发髻
                b.Box(new Vector3(s * 0.1f, 1.21f, 0.105f), new Vector3(0.07f, 0.07f, 0.01f), Col.H(0xe03040));   // 腮红
            }
            b.Box(new Vector3(0, 1.26f, 0), new Vector3(0.36f, 0.4f, 0.2f), skin);
            b.Box(new Vector3(0, 1.44f, 0.0f), new Vector3(0.38f, 0.08f, 0.22f), Col.H(0x101010));
            b.Box(new Vector3(-0.08f, 1.3f, 0.105f), new Vector3(0.07f, 0.02f, 0.01f), Col.H(0x101010));
            b.Box(new Vector3(0.08f, 1.3f, 0.105f), new Vector3(0.07f, 0.02f, 0.01f), Col.H(0x101010));
            b.Box(new Vector3(0, 1.15f, 0.105f), new Vector3(0.05f, 0.035f, 0.01f), Col.H(0xc01020));
        }

        static void Ghost(MeshB b, Color skin, Color robe, Color trim)
        {
            b.Cyl(new Vector3(0, 0, 0), 0.42f, 0.2f, 1.25f, robe, 10, false);                      // 长裙（无脚）
            b.Box(new Vector3(0, 1.3f, 0), new Vector3(0.42f, 0.36f, 0.24f), robe);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Push(new Vector3(s * 0.25f, 1.42f, 0.02f), new Vector3(-65, 0, s * -8));
                b.Box(new Vector3(0, -0.3f, 0), new Vector3(0.12f, 0.62f, 0.12f), robe);
                b.Box(new Vector3(0, -0.66f, 0), new Vector3(0.07f, 0.16f, 0.05f), skin);
                b.Pop();
            }
            b.Sphere(new Vector3(0, 1.64f, 0), new Vector3(0.16f, 0.19f, 0.17f), skin, 9, 6);
            Face(b, 1.65f, 0.165f, 1, Col.H(0x101010));
            b.Box(new Vector3(0, 1.45f, -0.12f), new Vector3(0.38f, 0.75f, 0.1f), trim);           // 长发
            b.Box(new Vector3(-0.15f, 1.5f, 0.06f), new Vector3(0.07f, 0.5f, 0.1f), trim);
            b.Box(new Vector3(0.15f, 1.5f, 0.06f), new Vector3(0.07f, 0.5f, 0.1f), trim);
            b.Box(new Vector3(0, 1.82f, 0), new Vector3(0.36f, 0.08f, 0.36f), trim);
        }

        static void Wu(MeshB b, Color skin, Color robe, Color trim, bool white)
        {
            b.Cyl(new Vector3(0, 0, 0), 0.4f, 0.26f, 1.2f, robe, 10);
            b.Box(new Vector3(0, 1.42f, 0), new Vector3(0.56f, 0.5f, 0.3f), robe);
            b.Box(new Vector3(0, 1.1f, 0), new Vector3(0.58f, 0.08f, 0.32f), trim);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Push(new Vector3(s * 0.34f, 1.6f, 0), new Vector3(-25, 0, s * 12));
                b.Box(new Vector3(0, -0.36f, 0), new Vector3(0.16f, 0.74f, 0.2f), robe);
                b.Box(new Vector3(0, -0.78f, 0), new Vector3(0.09f, 0.14f, 0.07f), skin);
                b.Pop();
            }
            b.Sphere(new Vector3(0, 1.84f, 0), new Vector3(0.18f, 0.22f, 0.19f), skin, 10, 7);
            Face(b, 1.87f, 0.185f, 1.1f, white ? Col.H(0x101010) : Col.H(0xff4030, 1f));
            if (white) b.Box(new Vector3(0, 1.58f, 0.2f), new Vector3(0.07f, 0.4f, 0.02f), Col.H(0xd01828));   // 长舌
            b.Push(new Vector3(0, 2.02f, 0));
            b.Cyl(Vector3.zero, 0.2f, 0.13f, 0.62f, white ? Col.H(0xf4f2ec) : Col.H(0x14141a), 8);  // 高帽
            b.Box(new Vector3(0, 0.3f, 0.165f), new Vector3(0.08f, 0.44f, 0.01f), white ? Col.H(0x101010) : Col.H(0xf0e8d8));
            b.Pop();
            // 法器：白持哭丧棒，黑持锁链令牌
            b.Push(new Vector3(0.42f, 1.0f, 0.2f), new Vector3(20, 0, 0));
            if (white) { b.Cyl(Vector3.zero, 0.03f, 0.03f, 1.3f, Col.H(0xe8e8e0), 6); for (int i = 0; i < 6; i++) b.Box(new Vector3(0, 0.3f + i * 0.17f, 0), new Vector3(0.16f, 0.04f, 0.16f), Col.H(0xffffff)); }
            else { b.Box(new Vector3(0, 0.3f, 0), new Vector3(0.22f, 0.5f, 0.04f), Col.H(0x3a2a10)); b.Box(new Vector3(0, 0.3f, 0.025f), new Vector3(0.12f, 0.36f, 0.01f), Col.H(0xc02020, 0.4f)); }
            b.Pop();
        }

        static void Soldier(MeshB b, Color skin, Color robe, Color trim)
        {
            for (int s = -1; s <= 1; s += 2) b.Box(new Vector3(s * 0.14f, 0.42f, 0), new Vector3(0.2f, 0.84f, 0.24f), Col.Mul(robe, 0.8f));
            b.Box(new Vector3(0, 1.15f, 0), new Vector3(0.62f, 0.66f, 0.36f), robe);
            for (int i = 0; i < 3; i++) b.Box(new Vector3(0, 0.95f + i * 0.2f, 0.185f), new Vector3(0.5f, 0.14f, 0.02f), Col.Mul(trim, 0.7f));   // 甲片
            b.Box(new Vector3(-0.42f, 1.36f, 0), new Vector3(0.24f, 0.2f, 0.4f), trim); b.Box(new Vector3(0.42f, 1.36f, 0), new Vector3(0.24f, 0.2f, 0.4f), trim);
            b.Sphere(new Vector3(0, 1.66f, 0), new Vector3(0.17f, 0.19f, 0.17f), skin, 8, 6);
            Face(b, 1.66f, 0.165f, 1, Col.H(0x60c8ff, 1f));
            b.Cyl(new Vector3(0, 1.72f, 0), 0.24f, 0.1f, 0.2f, trim, 10);
            b.Cyl(new Vector3(0, 1.92f, 0), 0.02f, 0.02f, 0.2f, Col.H(0xc02020), 4);
            // 虎头盾（身前偏左）
            b.Box(new Vector3(-0.16f, 1.0f, 0.42f), new Vector3(0.72f, 1.15f, 0.07f), Col.H(0x3a2c18));
            b.Box(new Vector3(-0.16f, 1.0f, 0.46f), new Vector3(0.6f, 1.02f, 0.02f), Col.H(0x8a6a28));
            b.Sphere(new Vector3(-0.16f, 1.05f, 0.47f), new Vector3(0.2f, 0.2f, 0.06f), Col.H(0xd8a030), 8, 5);
            b.Box(new Vector3(-0.23f, 1.1f, 0.52f), new Vector3(0.05f, 0.04f, 0.02f), Col.H(0xff3020, 1f)); b.Box(new Vector3(-0.09f, 1.1f, 0.52f), new Vector3(0.05f, 0.04f, 0.02f), Col.H(0xff3020, 1f));
            // 长矛
            b.Push(new Vector3(0.42f, 0.2f, 0.25f), new Vector3(8, 0, 0));
            b.Cyl(Vector3.zero, 0.025f, 0.025f, 2.3f, Col.H(0x3a2a18), 5);
            b.Cyl(new Vector3(0, 2.3f, 0), 0.06f, 0f, 0.32f, Col.H(0xc8d0d8), 4);
            b.Pop();
        }

        static void Sorcerer(MeshB b, Color skin, Color robe, Color trim)
        {
            b.Cyl(new Vector3(0, 0, 0), 0.5f, 0.24f, 1.3f, robe, 10);
            b.Box(new Vector3(0, 1.42f, 0), new Vector3(0.54f, 0.5f, 0.3f), robe);
            b.Box(new Vector3(0, 1.3f, 0.155f), new Vector3(0.1f, 0.9f, 0.01f), trim);
            for (int s = -1; s <= 1; s += 2)
            {
                b.Push(new Vector3(s * 0.34f, 1.6f, 0), new Vector3(-40, 0, s * 30));
                b.Cyl(new Vector3(0, -0.75f, 0), 0.22f, 0.09f, 0.75f, robe, 8);                     // 广袖
                b.Box(new Vector3(0, -0.82f, 0), new Vector3(0.08f, 0.14f, 0.06f), skin);
                b.Pop();
                b.Box(new Vector3(s * 0.2f, 1.45f, 0.06f), new Vector3(0.06f, 0.75f, 0.08f), Col.H(0xecebe6));   // 白发垂鬓
            }
            b.Sphere(new Vector3(0, 1.82f, 0), new Vector3(0.17f, 0.21f, 0.18f), skin, 10, 7);
            Face(b, 1.84f, 0.175f, 1, Col.H(0xc060ff, 1f));
            b.Box(new Vector3(0, 1.55f, 0.17f), new Vector3(0.08f, 0.3f, 0.03f), Col.H(0xecebe6));  // 长须
            b.Sphere(new Vector3(0, 2.0f, -0.04f), new Vector3(0.19f, 0.1f, 0.19f), Col.H(0xecebe6), 8, 4);
            b.Box(new Vector3(0, 2.1f, 0), new Vector3(0.14f, 0.16f, 0.14f), Col.H(0x101014));      // 道冠
            b.Sphere(new Vector3(0, 2.16f, 0.08f), 0.035f, new Color(trim.r, trim.g, trim.b, 1f), 6, 4);
            b.Box(new Vector3(0, 1.5f, -0.2f), new Vector3(0.44f, 1.1f, 0.03f), Col.Mul(robe, 0.7f));
        }

        static void Hou(MeshB b, Color skin, Color robe, Color trim)
        {
            // 犼：筋肉虬结的直立巨兽，鬃毛如火
            for (int s = -1; s <= 1; s += 2)
            {
                b.Box(new Vector3(s * 0.26f, 0.45f, 0), new Vector3(0.3f, 0.9f, 0.36f), robe);
                b.Box(new Vector3(s * 0.26f, 0.05f, 0.12f), new Vector3(0.34f, 0.1f, 0.5f), Col.Mul(robe, 0.7f));
                b.Push(new Vector3(s * 0.62f, 1.6f, 0.05f), new Vector3(-28, 0, s * 14));
                b.Box(new Vector3(0, -0.4f, 0), new Vector3(0.3f, 0.9f, 0.32f), skin);
                b.Box(new Vector3(0, -0.95f, 0.05f), new Vector3(0.36f, 0.3f, 0.38f), robe);
                for (int k = -1; k <= 1; k++) b.Cyl(new Vector3(k * 0.1f, -1.3f, 0.12f), 0f, 0.04f, 0.22f, Col.H(0xe8e0c0), 4, false);   // 爪
                b.Pop();
            }
            b.Box(new Vector3(0, 1.35f, 0), new Vector3(0.95f, 0.95f, 0.55f), skin);
            b.Box(new Vector3(0, 1.4f, 0.28f), new Vector3(0.6f, 0.6f, 0.04f), Col.Mul(skin, 0.7f));
            b.Sphere(new Vector3(0, 2.05f, 0.1f), new Vector3(0.3f, 0.28f, 0.34f), skin, 10, 7);
            b.Box(new Vector3(0, 1.95f, 0.42f), new Vector3(0.26f, 0.18f, 0.2f), Col.Mul(skin, 0.8f));   // 吻
            Face(b, 2.1f, 0.42f, 1.5f, Col.H(0xffd040, 1f));
            for (int s = -1; s <= 1; s += 2)
            {
                b.Push(new Vector3(s * 0.2f, 2.26f, 0.05f), new Vector3(-20, 0, s * -30));
                b.Cyl(Vector3.zero, 0.07f, 0f, 0.42f, Col.H(0x1a1410), 5, false);                   // 角
                b.Pop();
                b.Cyl(new Vector3(s * 0.08f, 1.74f, 0.5f), 0f, 0.035f, 0.14f, Col.H(0xf0f0e0), 4, false);   // 獠牙
            }
            var rnd = new System.Random(11);
            for (int i = 0; i < 22; i++)
            {
                float u = (float)rnd.NextDouble() - 0.5f, y = 1.2f + (float)rnd.NextDouble() * 1.0f;
                b.Push(new Vector3(u * 0.8f, y, -0.26f - (float)rnd.NextDouble() * 0.1f), new Vector3(-110 - (float)rnd.NextDouble() * 30, u * 60, 0));
                b.Cyl(Vector3.zero, 0.07f, 0f, 0.4f + (float)rnd.NextDouble() * 0.25f, new Color(trim.r, trim.g, trim.b, 0.9f), 4, false);
                b.Pop();
            }
        }

        // ---------------- 兵器（握把在原点，枪口朝 +Z）
        static readonly Dictionary<string, Mesh> guns = new Dictionary<string, Mesh>();
        public static Mesh Gun(string id, out Vector3 muzzle)
        {
            muzzle = id == "mauser" ? new Vector3(0, 0.06f, 0.27f) : id == "shotgun" ? new Vector3(0, 0.05f, 0.62f) : id == "gatling" ? new Vector3(0, 0.02f, 0.72f) : id == "sword" ? new Vector3(0, 0.05f, 0.9f) : new Vector3(0, 0.055f, 0.52f);
            if (guns.TryGetValue(id, out var m)) return m;
            var b = new MeshB();
            Color steel = Col.H(0x2c2e34), wood = Col.H(0x5a3418), dark = Col.H(0x16171a);
            // 握把（都有）
            b.Push(new Vector3(0, -0.06f, -0.01f), new Vector3(14, 0, 0));
            b.Box(Vector3.zero, new Vector3(0.034f, 0.13f, 0.045f), id == "sword" ? Col.H(0x8a1c14) : wood);
            b.Pop();
            switch (id)
            {
                case "mauser":
                    b.Box(new Vector3(0, 0.045f, 0.03f), new Vector3(0.03f, 0.05f, 0.18f), steel);
                    b.Box(new Vector3(0, 0.02f, 0.07f), new Vector3(0.03f, 0.06f, 0.05f), dark);            // 弹仓
                    b.Push(new Vector3(0, 0.06f, 0.12f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.011f, 0.009f, 0.15f, steel, 6); b.Pop();
                    b.Box(new Vector3(0, 0.078f, -0.05f), new Vector3(0.012f, 0.02f, 0.02f), dark);
                    break;
                case "thompson":
                case "ak47":
                    b.Box(new Vector3(0, 0.05f, 0.08f), new Vector3(0.04f, 0.065f, 0.34f), steel);
                    b.Box(new Vector3(0, 0.035f, -0.2f), new Vector3(0.034f, 0.07f, 0.24f), wood);            // 枪托
                    b.Box(new Vector3(0, 0.035f, 0.3f), new Vector3(0.042f, 0.045f, 0.16f), wood);            // 护木
                    b.Push(new Vector3(0, 0.055f, 0.25f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.012f, 0.012f, 0.27f, dark, 6); b.Pop();
                    if (id == "thompson") { b.Push(new Vector3(0, -0.03f, 0.13f), new Vector3(0, 0, 90)); b.Cyl(new Vector3(0, -0.02f, 0), 0.07f, 0.07f, 0.04f, dark, 12); b.Pop(); }
                    else { b.Push(new Vector3(0, -0.05f, 0.14f), new Vector3(-18, 0, 0)); b.Box(Vector3.zero, new Vector3(0.028f, 0.16f, 0.05f), dark); b.Pop(); }
                    break;
                case "shotgun":
                    b.Box(new Vector3(0, 0.04f, 0.05f), new Vector3(0.045f, 0.06f, 0.22f), steel);
                    b.Box(new Vector3(0, 0.03f, -0.2f), new Vector3(0.036f, 0.075f, 0.26f), wood);
                    b.Box(new Vector3(0, 0.025f, 0.26f), new Vector3(0.05f, 0.04f, 0.2f), wood);
                    for (int s = -1; s <= 1; s += 2) { b.Push(new Vector3(s * 0.014f, 0.05f, 0.15f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.014f, 0.014f, 0.47f, dark, 6); b.Pop(); }
                    break;
                case "gatling":
                    b.Box(new Vector3(0, 0.02f, 0.02f), new Vector3(0.1f, 0.12f, 0.26f), steel);
                    b.Box(new Vector3(0, 0.11f, 0.02f), new Vector3(0.03f, 0.05f, 0.2f), dark);
                    for (int i = 0; i < 6; i++) { float a = i / 6f * 6.283f; b.Push(new Vector3(Mathf.Cos(a) * 0.03f, 0.02f + Mathf.Sin(a) * 0.03f, 0.15f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.011f, 0.011f, 0.57f, dark, 5); b.Pop(); }
                    b.Push(new Vector3(0, 0.02f, 0.5f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.05f, 0.05f, 0.03f, steel, 10); b.Pop();
                    b.Push(new Vector3(0, 0.02f, 0.7f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.05f, 0.05f, 0.02f, steel, 10); b.Pop();
                    b.Box(new Vector3(0, -0.1f, 0.06f), new Vector3(0.12f, 0.12f, 0.14f), Col.H(0x4a4030));
                    break;
                case "sword":
                    b.Box(new Vector3(0, 0.02f, 0.04f), new Vector3(0.14f, 0.03f, 0.03f), Col.H(0xc8a040));   // 护手
                    b.Box(new Vector3(0, 0.02f, 0.45f), new Vector3(0.05f, 0.016f, 0.8f), Col.H(0xa8643a));   // 桃木剑身
                    b.Box(new Vector3(0, 0.03f, 0.45f), new Vector3(0.012f, 0.004f, 0.7f), Col.H(0xd02020, 0.5f));   // 朱砂符线
                    b.Push(new Vector3(0, 0.02f, 0.85f), new Vector3(90, 0, 0)); b.Cyl(Vector3.zero, 0.026f, 0f, 0.09f, Col.H(0xa8643a), 4, false); b.Pop();
                    b.Box(new Vector3(0, -0.14f, -0.03f), new Vector3(0.02f, 0.08f, 0.02f), Col.H(0xd02020));   // 剑穗
                    break;
            }
            m = b.Build("gun_" + id);
            guns[id] = m;
            return m;
        }
    }
}
