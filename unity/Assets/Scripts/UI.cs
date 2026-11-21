using System;
using System.Collections.Generic;
using System.Text;
using UnityEngine;

namespace ZS
{
    /// <summary>文字：系统中文字体 + TextMesh。</summary>
    public static class Txt
    {
        public static Font font;
        static Material matTop, matWorld;
        const int FontPx = 48;

        public static void Init()
        {
            string pick = null;
            var names = Font.GetOSInstalledFontNames();
            string[] prefer = { "NotoSansCJK", "Noto Sans CJK", "NotoSerifCJK", "SourceHan", "DroidSansFallback", "Droid Sans Fallback", "Microsoft YaHei", "SimHei", "PingFang", "CJK", "Hei", "Song" };
            foreach (var want in prefer)
            {
                foreach (var n in names) if (n.IndexOf(want, StringComparison.OrdinalIgnoreCase) >= 0) { pick = n; break; }
                if (pick != null) break;
            }
            Debug.Log("[ZS] fonts: " + names.Length + " pick=" + (pick ?? "(default)"));
            font = pick != null ? Font.CreateDynamicFontFromOSFont(pick, FontPx) : Font.CreateDynamicFontFromOSFont(new[] { "sans-serif", "Arial" }, FontPx);
            matTop = Mats.Text(font, true);
            matWorld = Mats.Text(font, false);
            Font.textureRebuilt += f =>
            {
                if (f != font) return;
                matTop.mainTexture = font.material.mainTexture;
                matWorld.mainTexture = font.material.mainTexture;
            };
        }

        /// <param name="h">字高（米）</param>
        public static TextMesh Make(Transform parent, string text, float h, Color color, TextAnchor anchor = TextAnchor.MiddleCenter, bool onTop = true)
        {
            var go = new GameObject("txt");
            go.transform.SetParent(parent, false);
            var tm = go.AddComponent<TextMesh>();
            tm.font = font; tm.fontSize = FontPx; tm.characterSize = h * 10f / FontPx;
            tm.anchor = anchor; tm.alignment = anchor == TextAnchor.MiddleLeft || anchor == TextAnchor.UpperLeft ? TextAlignment.Left : anchor == TextAnchor.MiddleRight || anchor == TextAnchor.UpperRight ? TextAlignment.Right : TextAlignment.Center;
            tm.color = color; tm.text = text; tm.richText = false;
            go.GetComponent<MeshRenderer>().sharedMaterial = onTop ? matTop : matWorld;
            return tm;
        }

        /// <summary>按宽度折行：汉字算 1，西文算 0.55。</summary>
        public static string Wrap(string s, float maxUnits, int maxLines = 99)
        {
            var sb = new StringBuilder();
            float w = 0; int lines = 1;
            foreach (char ch in s)
            {
                if (ch == '\n') { if (++lines > maxLines) break; sb.Append('\n'); w = 0; continue; }
                float cw = ch < 0x2000 ? 0.55f : 1f;
                if (w + cw > maxUnits) { if (++lines > maxLines) break; sb.Append('\n'); w = 0; }
                sb.Append(ch); w += cw;
            }
            return sb.ToString();
        }
    }

    public class UIButton
    {
        public Rect rect; public Action onClick; public bool enabled = true;
        public MeshRenderer bg; public MaterialPropertyBlock mpb = new MaterialPropertyBlock();
        public Color baseCol;
    }

    /// <summary>悬在面前的面板：背景 + 文字 + 可用手柄射线点选的按钮。坐标单位是米，原点在面板中心。</summary>
    public class Panel
    {
        public Transform root, content;
        public float w, h;
        readonly List<UIButton> buttons = new List<UIButton>();
        public bool visible;
        static Material bgMat, btnMat;
        readonly int[] hover = { -1, -1 };

        public Panel()
        {
            root = new GameObject("Panel").transform;
            bgMat = bgMat ?? Mats.Fx(false, 0, true, 4000);
            btnMat = btnMat ?? Mats.Fx(false, 0, true, 4010);
            root.gameObject.SetActive(false);
        }

        public void Begin(float width, float height)
        {
            if (content != null) UnityEngine.Object.Destroy(content.gameObject);
            content = new GameObject("content").transform;
            content.SetParent(root, false);
            buttons.Clear(); hover[0] = hover[1] = -1;
            w = width; h = height;
            Quad(0, 0, w + 0.03f, h + 0.03f, new Color(0.91f, 0.76f, 0.42f, 0.8f), bgMat, 0.004f);
            Quad(0, 0, w, h, new Color(0.065f, 0.045f, 0.03f, 0.94f), bgMat, 0.002f);
        }

        MeshRenderer Quad(float x, float y, float qw, float qh, Color col, Material mat, float z = 0)
        {
            var go = Prim.QuadObj("q", content, mat, col, out _);
            go.transform.localPosition = new Vector3(x, y, z);
            go.transform.localScale = new Vector3(qw, qh, 1);
            return go.GetComponent<MeshRenderer>();
        }

        public void Rect(float x, float y, float rw, float rh, Color col) { Quad(x, y, rw, rh, col, btnMat, -0.001f); }

        public TextMesh Label(string text, float x, float y, float size, Color col, TextAnchor anchor = TextAnchor.MiddleCenter, float wrapUnits = 0, int maxLines = 99)
        {
            var tm = Txt.Make(content, wrapUnits > 0 ? Txt.Wrap(text, wrapUnits, maxLines) : text, size, col, anchor);
            tm.transform.localPosition = new Vector3(x, y, -0.004f);
            return tm;
        }

        public UIButton Button(string label, float x, float y, float bw, float bh, Action onClick, bool enabled = true, float textSize = 0.05f)
        {
            var b = new UIButton { rect = new Rect(x - bw / 2, y - bh / 2, bw, bh), onClick = onClick, enabled = enabled };
            Quad(x, y, bw + 0.012f, bh + 0.012f, enabled ? new Color(0.91f, 0.76f, 0.42f, 0.75f) : new Color(0.4f, 0.37f, 0.3f, 0.5f), btnMat, -0.001f);
            b.baseCol = enabled ? new Color(0.27f, 0.19f, 0.1f, 0.97f) : new Color(0.2f, 0.18f, 0.15f, 0.8f);
            b.bg = Quad(x, y, bw, bh, b.baseCol, btnMat, -0.002f);
            if (!string.IsNullOrEmpty(label)) Label(label, x, y, textSize, enabled ? new Color(0.96f, 0.89f, 0.69f) : new Color(0.5f, 0.46f, 0.4f));
            buttons.Add(b);
            return b;
        }

        public void Show(bool v) { visible = v; root.gameObject.SetActive(v); }

        /// <summary>放到玩家正前方。</summary>
        public void Place(Rig rig, float dist = 1.9f)
        {
            var f = rig.FlatForward;
            var hp = rig.head.position;
            root.position = new Vector3(hp.x, hp.y - 0.08f, hp.z) + f * dist;
            root.rotation = Quaternion.LookRotation(f, Vector3.up);
        }

        public bool Facing(Rig rig)
        {
            var to = root.position - rig.head.position; to.y = 0;
            float d = to.magnitude;
            return d > 1.1f && d < 3f && Vector3.Angle(rig.FlatForward, to) < 50f;
        }

        /// <summary>手柄射线指向 / 扣扳机点击。返回是否有按钮被点。</summary>
        public bool Update(Rig rig, Fx fx, Action<string> sound)
        {
            if (!visible) return false;
            bool clicked = false;
            for (int hI = 0; hI < 2; hI++)
            {
                var hand = hI == 0 ? rig.left : rig.right;
                int hov = -1;
                if (hand.tracked)
                {
                    Vector3 o = root.InverseTransformPoint(hand.AimPos), d = root.InverseTransformDirection(hand.AimDir);
                    float len = 1.5f;
                    if (d.z > 1e-4f && o.z < 0)
                    {
                        float t = -o.z / d.z;
                        float x = o.x + d.x * t, y = o.y + d.y * t;
                        if (Mathf.Abs(x) <= w / 2 && Mathf.Abs(y) <= h / 2)
                        {
                            len = t;
                            for (int i = 0; i < buttons.Count; i++) if (buttons[i].enabled && buttons[i].rect.Contains(new Vector2(x, y))) { hov = i; break; }
                            fx.Billboard(root.TransformPoint(new Vector3(x, y, -0.01f)), 0.035f, new Color(1f, 0.95f, 0.8f, 1f));
                        }
                    }
                    fx.AddBeam(hand.AimPos, hand.AimPos + hand.AimDir * len, 0.006f, new Color(1f, 0.88f, 0.63f, hov >= 0 ? 0.9f : 0.4f), Time.deltaTime * 1.5f);
                    if (hand.triggerHit && hov >= 0)
                    {
                        hand.Pulse(0.4f, 0.03f);
                        sound?.Invoke("click");
                        var act = buttons[hov].onClick;
                        act?.Invoke();
                        return true;                        // 面板内容可能已重建
                    }
                }
                if (hov != hover[hI])
                {
                    if (hov >= 0) { hand.Pulse(0.15f, 0.015f); sound?.Invoke("hover"); }
                    hover[hI] = hov;
                }
            }
            for (int i = 0; i < buttons.Count; i++)
            {
                var b = buttons[i];
                bool hot = hover[0] == i || hover[1] == i;
                b.mpb.SetColor("_Color", hot ? new Color(0.62f, 0.45f, 0.18f, 1f) : b.baseCol);
                b.bg.SetPropertyBlock(b.mpb);
            }
            return clicked;
        }
    }

    /// <summary>随头显示：血量、弹药、波次、技能冷却、首领血条、横幅、字幕。</summary>
    public class Hud
    {
        public Transform root;
        readonly Transform hpFill, hpBack, bossRoot, bossFill, breathFill, hurtQuad;
        readonly MeshRenderer hurtR, fuR, dashR, ultR;
        readonly MaterialPropertyBlock mpb = new MaterialPropertyBlock();
        readonly TextMesh hpText, ammoText, weaponText, waveText, statText, bannerTitle, bannerSub, toastText, bossName, subText, abilText;
        float bannerUntil, toastUntil, subUntil;
        const float Z = 1.4f;

        public Hud(Transform head)
        {
            root = new GameObject("Hud").transform;
            root.SetParent(head, false);
            var mat = Mats.Fx(false, 0, true, 4050);
            var low = new GameObject("low").transform; low.SetParent(root, false);
            low.localPosition = new Vector3(0, -0.6f, Z); low.localRotation = Quaternion.Euler(24, 0, 0);
            Q(low, mat, 0, 0, 0.92f, 0.17f, new Color(0.04f, 0.03f, 0.02f, 0.5f), 0.002f);
            hpBack = Q(low, mat, -0.25f, 0.045f, 0.38f, 0.035f, new Color(0, 0, 0, 0.6f), 0.001f);
            hpFill = Q(low, mat, -0.25f, 0.045f, 0.38f, 0.035f, new Color(0.8f, 0.24f, 0.16f, 0.95f));
            breathFill = Q(low, mat, -0.25f, 0.016f, 0.38f, 0.008f, new Color(0.55f, 0.78f, 1f, 0.9f));
            hpText = Txt.Make(low, "", 0.03f, Color.white); hpText.transform.localPosition = new Vector3(-0.25f, 0.045f, -0.002f);
            fuR = Q(low, mat, -0.39f, -0.04f, 0.1f, 0.06f, Color.gray).GetComponent<MeshRenderer>();
            dashR = Q(low, mat, -0.27f, -0.04f, 0.1f, 0.06f, Color.gray).GetComponent<MeshRenderer>();
            ultR = Q(low, mat, -0.15f, -0.04f, 0.1f, 0.06f, Color.gray).GetComponent<MeshRenderer>();
            abilText = Txt.Make(low, "符      罡      雷", 0.034f, new Color(0.1f, 0.07f, 0.03f)); abilText.transform.localPosition = new Vector3(-0.27f, -0.04f, -0.002f);
            weaponText = Txt.Make(low, "", 0.03f, new Color(0.91f, 0.85f, 0.69f), TextAnchor.MiddleRight); weaponText.transform.localPosition = new Vector3(0.44f, 0.05f, -0.002f);
            ammoText = Txt.Make(low, "", 0.065f, new Color(1f, 0.96f, 0.85f), TextAnchor.MiddleRight); ammoText.transform.localPosition = new Vector3(0.44f, -0.025f, -0.002f);
            waveText = Txt.Make(low, "", 0.026f, new Color(0.91f, 0.76f, 0.42f), TextAnchor.MiddleLeft); waveText.transform.localPosition = new Vector3(-0.03f, 0.045f, -0.002f);
            statText = Txt.Make(low, "", 0.024f, new Color(0.78f, 0.74f, 0.63f), TextAnchor.MiddleLeft); statText.transform.localPosition = new Vector3(-0.03f, -0.03f, -0.002f);

            var top = new GameObject("top").transform; top.SetParent(root, false);
            top.localPosition = new Vector3(0, 0.36f, Z); top.localRotation = Quaternion.Euler(-14, 0, 0);
            bannerTitle = Txt.Make(top, "", 0.085f, new Color(0.91f, 0.76f, 0.42f)); bannerTitle.transform.localPosition = new Vector3(0, 0, 0);
            bannerSub = Txt.Make(top, "", 0.034f, new Color(0.94f, 0.9f, 0.78f)); bannerSub.transform.localPosition = new Vector3(0, -0.075f, 0);
            toastText = Txt.Make(top, "", 0.04f, new Color(1f, 0.88f, 0.63f)); toastText.transform.localPosition = new Vector3(0, -0.14f, 0);
            bossRoot = new GameObject("boss").transform; bossRoot.SetParent(top, false); bossRoot.localPosition = new Vector3(0, 0.11f, 0);
            Q(bossRoot, mat, 0, 0, 0.72f, 0.022f, new Color(0, 0, 0, 0.7f), 0.001f);
            bossFill = Q(bossRoot, mat, 0, 0, 0.72f, 0.022f, new Color(0.85f, 0.19f, 0.12f, 0.95f));
            bossName = Txt.Make(bossRoot, "", 0.032f, new Color(1f, 0.5f, 0.38f)); bossName.transform.localPosition = new Vector3(0, 0.04f, 0);

            var sub = new GameObject("sub").transform; sub.SetParent(root, false);
            sub.localPosition = new Vector3(0, -0.34f, Z); sub.localRotation = Quaternion.Euler(13, 0, 0);
            subText = Txt.Make(sub, "", 0.036f, new Color(0.94f, 0.91f, 0.85f));

            hurtQuad = Q(root, Mats.Fx(false, 0, true, 4040), 0, 0, 3f, 3f, new Color(0.75f, 0.1f, 0.06f, 0f));
            hurtQuad.localPosition = new Vector3(0, 0, 0.5f);
            hurtR = hurtQuad.GetComponent<MeshRenderer>();
            lowRoot = low;
        }
        readonly Transform lowRoot;

        static Transform Q(Transform parent, Material mat, float x, float y, float w, float h, Color col, float z = 0)
        {
            var go = Prim.QuadObj("q", parent, mat, col, out _);
            go.transform.localPosition = new Vector3(x, y, z);
            go.transform.localScale = new Vector3(w, h, 1);
            return go.transform;
        }

        void Bar(Transform fill, float k, float fullW, float cx)
        {
            k = Mathf.Clamp01(k);
            var s = fill.localScale; s.x = Mathf.Max(0.0001f, fullW * k); fill.localScale = s;
            var p = fill.localPosition; p.x = cx - fullW * (1 - k) / 2; fill.localPosition = p;
        }

        void Tint(MeshRenderer r, float ready, Color col)
        {
            mpb.SetColor("_Color", ready >= 0.999f ? col : new Color(0.35f, 0.33f, 0.3f, 0.35f + ready * 0.45f));
            r.SetPropertyBlock(mpb);
        }

        public void Banner(string title, string sub = "", float dur = 2.4f) { bannerTitle.text = title; bannerSub.text = sub; bannerUntil = Time.time + dur; }
        public void Toast(string text, float dur = 1.8f) { toastText.text = text; toastUntil = Time.time + dur; }
        public void Subtitle(string text, float dur = 4f) { subText.text = Txt.Wrap(text, 24); subUntil = Time.time + dur; }

        public void ShowPlay(bool v) { lowRoot.gameObject.SetActive(v); }

        public void Update(Game g, float hurt, Color flash, float flashA)
        {
            float now = Time.time;
            bannerTitle.gameObject.SetActive(now < bannerUntil); bannerSub.gameObject.SetActive(now < bannerUntil);
            toastText.gameObject.SetActive(now < toastUntil && now >= bannerUntil);
            subText.gameObject.SetActive(now < subUntil);
            Color hc = flashA > 0.02f ? new Color(flash.r, flash.g, flash.b, Mathf.Min(0.55f, flashA)) : new Color(0.75f, 0.1f, 0.06f, Mathf.Min(0.5f, hurt * 0.5f));
            hurtQuad.gameObject.SetActive(hc.a > 0.01f);
            if (hc.a > 0.01f) { mpb.SetColor("_Color", hc); hurtR.SetPropertyBlock(mpb); }

            Enemy boss = null;
            foreach (var e in g.enemies.list) if (e.boss && e.alive && !e.dying && (boss == null || e.hp < boss.hp)) boss = e;
            bossRoot.gameObject.SetActive(boss != null);
            if (boss != null) { Bar(bossFill, boss.hp / boss.maxHp, 0.72f, 0); bossName.text = boss.def.name + " · " + boss.def.title; }

            if (!lowRoot.gameObject.activeSelf) return;
            var p = g.player;
            Bar(hpFill, p.hp / p.maxHp, 0.38f, -0.25f);
            hpText.text = Mathf.CeilToInt(p.hp) + " / " + Mathf.RoundToInt(p.maxHp);
            bool showBreath = p.breath < p.breathMax * 0.999f || p.holding;
            breathFill.gameObject.SetActive(showBreath);
            if (showBreath) Bar(breathFill, p.breath / p.breathMax, 0.38f, -0.25f);
            Tint(fuR, g.skills.fuCd > 0 ? 1 - g.skills.fuCd / g.skills.stats.fuCd : 1, new Color(1f, 0.69f, 0.25f, 0.95f));
            Tint(dashR, 1 - p.dashCd / p.dashCdMax, new Color(0.55f, 0.78f, 1f, 0.95f));
            Tint(ultR, g.skills.ult / 100f, new Color(1f, 0.88f, 0.38f, 0.95f));
            var w = g.weapons;
            weaponText.text = w.Def.name;
            ammoText.text = w.Def.melee ? "∞" : w.reloading > 0 ? "换弹…" : w.Mag + " / " + w.MagMax;
            ammoText.color = !w.Def.melee && w.Mag == 0 ? new Color(1f, 0.3f, 0.25f) : new Color(1f, 0.96f, 0.85f);
            waveText.text = g.WaveLine();
            statText.text = "道行 " + g.level + "   诛邪 " + g.kills + (g.combo >= 3 ? "   连斩 " + g.combo : "") + "\n" + g.Objective();
        }
    }

    /// <summary>伤害飘字（对象池）。</summary>
    public class DamageNumbers
    {
        class N { public TextMesh tm; public float t; public Vector3 pos, vel; }
        readonly List<N> active = new List<N>();
        readonly Stack<N> pool = new Stack<N>();
        readonly Transform root;
        public DamageNumbers() { root = new GameObject("DmgNums").transform; }

        public void Add(Vector3 pos, string text, Color col, float size = 0.16f)
        {
            if (active.Count > 40) return;
            N n = pool.Count > 0 ? pool.Pop() : new N { tm = Txt.Make(root, "", 0.16f, Color.white, TextAnchor.MiddleCenter, false) };
            n.tm.gameObject.SetActive(true);
            n.tm.text = text; n.tm.color = col; n.tm.characterSize = size * 10f / 48f;
            n.pos = pos; n.t = 0; n.vel = new Vector3(UnityEngine.Random.value - 0.5f, 1.6f, UnityEngine.Random.value - 0.5f);
            active.Add(n);
        }

        public void Update(float dt, Transform cam)
        {
            for (int i = active.Count - 1; i >= 0; i--)
            {
                var n = active[i];
                n.t += dt;
                if (n.t > 0.8f) { n.tm.gameObject.SetActive(false); pool.Push(n); active.RemoveAt(i); continue; }
                n.pos += n.vel * dt;
                n.tm.transform.position = n.pos;
                n.tm.transform.rotation = Quaternion.LookRotation(n.pos - cam.position, Vector3.up);
                float dist = Vector3.Distance(n.pos, cam.position);
                n.tm.transform.localScale = Vector3.one * Mathf.Clamp(dist * 0.22f, 0.6f, 4f);
                var c = n.tm.color; c.a = n.t > 0.5f ? (0.8f - n.t) / 0.3f : 1f; n.tm.color = c;
            }
        }

        public void Clear() { foreach (var n in active) { n.tm.gameObject.SetActive(false); pool.Push(n); } active.Clear(); }
    }
}
