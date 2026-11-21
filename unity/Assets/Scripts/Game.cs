using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    public enum GState { Menu, Diff, Upgrade, Help, Story, Playing, Cards, Paused, Dying, Result }

    /// <summary>主流程：状态机、输入分发、拾取物、界面各屏。</summary>
    public class Game : MonoBehaviour
    {
        public Rig rig; public World world; public Fx fx; public Enemies enemies; public Director director;
        public Player player = new Player(); public Weapons weapons; public Skills skills; public Hud hud; public Panel panel;
        public DamageNumbers nums; public Sfx sfx; public Save save;

        public GState state = GState.Menu;
        public int level = 1, kills, gold, combo, maxCombo, chapterIdx, perfect;
        public float xp, runTime, comboT;
        int pendingLevels, pendingChest;
        float timeScale = 1, slowT, hurt, flashA, clearT, dyingT, lightningT = 12, perfectCd, groanT = 3;
        Color flashCol = Color.white;
        DiffDef diff = Data.Diffs["normal"];
        List<Card> cards;
        string cardSource;
        bool victory;
        int gained;
        // 帧率 / 动态分辨率
        float fpsT; int fpsN; public float fps = 72, renderScale = 1f, hz = 72;

        class Pickup { public Vector3 pos, vel; public int kind; public float value, t; }   // 0 阳气 1 葫芦 2 宝箱
        readonly List<Pickup> pickups = new List<Pickup>();

        void Awake()
        {
            Application.targetFrameRate = 120;
            QualitySettings.vSyncCount = 0;
            Mats.Init();
            rig = Rig.Create();
            Txt.Init();
            save = new Save();
            world = new World();
            fx = Fx.Create(rig.head);
            sfx = Sfx.Create(rig.head);
            enemies = new Enemies(world, fx);
            director = new Director(enemies, world);
            weapons = new Weapons(this, rig.right.aim);
            skills = new Skills(this);
            hud = new Hud(rig.head);
            panel = new Panel();
            nums = new DamageNumbers();
            Wire();
            world.SetAmbience(Data.Chapters[0].amb);
            Mats.ApplyAmbience(world.amb);
            skills.Reset();
            ToMenu();
        }

        // ================================================================ 事件
        void Wire()
        {
            enemies.onKill = (e, type) =>
            {
                kills++; combo++; comboT = 3.2f; maxCombo = Mathf.Max(maxCombo, combo);
                float comboK = 1 + Mathf.Min(0.5f, combo * 0.01f);
                DropXp(e.pos, e.def.xp * (e.elite ? 5 : 1));
                gold += Mathf.CeilToInt(e.def.xp * (e.elite ? 3 : 1) * comboK);
                skills.AddUlt((e.boss ? 35 : e.elite ? 6 : 1.4f) * (1 + Mathf.Min(0.5f, combo * 0.008f)));
                if (skills.stats.lifesteal > 0) player.Heal(skills.stats.lifesteal);
                if (e.elite) { pickups.Add(new Pickup { pos = e.pos + Vector3.up * 0.4f, kind = 2 }); hud.Toast("诛灭精英 " + e.label); }
                else if (diff.heal > 0 && Random.value < 0.012f * diff.heal) pickups.Add(new Pickup { pos = e.pos + Vector3.up * 0.4f, kind = 1 });
                fx.Puff(e.Center, new Color(0.25f, 0.3f, 0.28f), 6, 0.6f);
                sfx.Play("kill", 0.5f, 0.9f + Random.value * 0.2f, e.pos);
                if (combo % 10 == 0) sfx.Play("coin", 0.5f, 1f + combo * 0.004f);
                if (e.boss)
                {
                    pickups.Add(new Pickup { pos = e.pos + new Vector3(1.5f, 0.4f, 0), kind = 2 });
                    hud.Banner(e.def.name + " 伏诛", "", 2.2f);
                    fx.Explosion(e.pos, 5f, new Color(1f, 0.7f, 0.3f, 1f));
                    Flash(new Color(1f, 0.88f, 0.75f), 0.4f);
                    Slowmo(0.25f, 1.1f);
                    sfx.Play("gong");
                    rig.left.Pulse(1, 0.3f); rig.right.Pulse(1, 0.3f);
                }
            };
            enemies.onDamage = (e, dmg, pos, crit, blocked) =>
            {
                if (dmg < 4 && !blocked) return;
                nums.Add(pos, blocked ? "格挡" : Mathf.RoundToInt(dmg) + (crit ? "!" : ""), blocked ? new Color(0.7f, 0.75f, 0.8f) : crit ? new Color(1f, 0.85f, 0.3f) : Color.white, crit ? 0.2f : 0.15f);
            };
            enemies.onPlayerHit = OnPlayerHit;
            enemies.onPhase = (e, ph) => { hud.Banner(ph >= 2 ? "殊死一搏" : "怒", e.def.name + " 进入第 " + (ph + 1) + " 阶段", 1.8f); sfx.Play("roar", 1f, 1f, e.pos); world.Lightning(1.2f); };
            enemies.onSummon = (type, pos) => director.SpawnOne(type, rig.Feet, pos);
            enemies.onSound = (name, pos) => sfx.Play(name, name == "hop" ? 0.25f : 0.7f, 0.9f + Random.value * 0.2f, pos);
            director.onWaveStart = (ch, w, total) =>
            {
                if (director.endless) hud.Banner("无尽 · 第 " + (director.endlessN + 1) + " 轮", "邪祟愈发凶悍", 2f);
                else if (w > 0) hud.Banner("第 " + (w + 1) + " / " + total + " 波", "邪祟来袭", 1.8f);
                sfx.Play("horn", 0.6f);
            };
            director.onBossStart = (ch, list, name) =>
            {
                hud.Banner(name, "首领现身", 3.2f);
                sfx.Play("roar"); sfx.Play("gong", 0.7f);
                world.Lightning(1.4f);
            };
            director.onHorde = (dirName, pos) => { hud.Banner("尸潮将至", "自" + dirName + "方涌来", 2.4f); sfx.Play("horn", 0.8f, 0.8f); fx.AddRing(pos + Vector3.up * 0.1f, 1f, 7f, new Color(1f, 0.2f, 0.12f, 0.9f), 1.2f); };
            director.onChapterClear = OnChapterClear;
        }

        public void ApplyStats()
        {
            var s = skills.stats;
            float old = player.maxHp;
            player.maxHp = Mathf.Round(s.maxHp);
            if (player.maxHp > old && state == GState.Playing) player.hp += player.maxHp - old;
            player.hp = Mathf.Min(player.hp, player.maxHp);
            if (weapons == null) return;
            weapons.gunDmg = s.gunDmg; weapons.fireRate = s.fireRate; weapons.reloadMult = s.reloadMult; weapons.crit = s.crit; weapons.headMult = s.headMult;
        }

        public void Flash(Color c, float a) { flashCol = c; flashA = Mathf.Max(flashA, a); }
        public void Slowmo(float scale, float dur) { timeScale = Mathf.Min(timeScale, scale); slowT = Mathf.Max(slowT, dur); }

        public void HealPlayer(float v)
        {
            float amt = v * (diff.heal > 0 ? Mathf.Max(0.5f, diff.heal) : 0.5f);
            player.Heal(amt);
            if (amt >= 5) { nums.Add(rig.head.position + rig.FlatForward * 1.2f, "+" + Mathf.RoundToInt(amt), new Color(0.5f, 1f, 0.6f)); sfx.Play("heal"); }
        }

        public void OnBulletHit(Enemy e, Vector3 point, Vector3 dir, bool head, bool died)
        {
            Color blood = e.def.ghost ? new Color(0.5f, 0.7f, 1f, 0.8f) : e.def.paper ? new Color(0.9f, 0.85f, 0.7f, 0.8f) : new Color(0.25f, 0.5f, 0.2f, 0.9f);
            fx.Blood(point, -dir, died ? 12 : 5, blood);
            sfx.Play(head ? "head" : "hit", 0.5f, 0.9f + Random.value * 0.2f);
            rig.right.Pulse(head ? 0.5f : 0.25f, 0.02f);
        }

        void OnPlayerHit(float dmg, Vector3 from, bool aura)
        {
            if (state != GState.Playing || !player.alive) return;
            float d = dmg * skills.stats.armor;
            if (aura) { player.hp = Mathf.Max(0, player.hp - d); hurt = Mathf.Max(hurt, 0.4f); if (player.hp <= 0) player.alive = false; return; }
            if (player.Dashing) { PerfectDodge(); return; }
            if (!player.TakeDamage(d)) return;
            hurt = 1;
            sfx.Play("hurt");
            rig.left.Pulse(0.9f, 0.12f); rig.right.Pulse(0.9f, 0.12f);
            director.PlayerHurt(d / player.maxHp);
            if (combo >= 10) hud.Toast("连斩中断 · " + combo);
            combo = 0;
        }

        void PerfectDodge()
        {
            if (perfectCd > 0) return;
            perfectCd = 1.6f; perfect++;
            Slowmo(0.35f, 1.2f);
            player.dashCd = 0; skills.AddUlt(6); player.invuln = Mathf.Max(player.invuln, 0.5f);
            hud.Banner("灵台清明", "完美闪避", 0.9f);
            Flash(new Color(0.85f, 0.92f, 1f), 0.3f);
            sfx.Play("bell", 0.6f, 1.5f);
            fx.AddRing(rig.Feet + Vector3.up * 0.1f, 0.5f, 4f, new Color(0.6f, 0.82f, 1f, 0.9f), 0.6f);
        }

        void DropXp(Vector3 p, float value)
        {
            int n = Mathf.Clamp(Mathf.CeilToInt(value / 4f), 1, 6);
            for (int i = 0; i < n; i++)
                pickups.Add(new Pickup { pos = p + Vector3.up * 0.5f, vel = new Vector3(Random.value - 0.5f, 1.2f, Random.value - 0.5f) * 2.4f, kind = 0, value = value / n });
        }

        void GainXp(float v)
        {
            xp += v * skills.stats.xpMult;
            while (xp >= Data.XpNeed(level)) { xp -= Data.XpNeed(level); level++; pendingLevels++; fx.LevelUp(rig.Feet); }
        }

        void UpdatePickups(float dt)
        {
            Vector3 feet = rig.Feet, chest = feet + Vector3.up * 1.0f;
            float magnet = clearT > 0 || director.phase == "cleared" ? 999f : skills.stats.magnet;
            for (int i = pickups.Count - 1; i >= 0; i--)
            {
                var p = pickups[i];
                p.t += dt;
                float dist = Vector3.Distance(new Vector3(p.pos.x, 0, p.pos.z), feet);
                if (dist < magnet && p.t > 0.35f) p.vel = Vector3.Lerp(p.vel, (chest - p.pos).normalized * 14f, Mathf.Min(1, dt * 8f));
                else { p.vel.y -= 9f * dt; if (p.pos.y < 0.35f) { p.pos.y = 0.35f; p.vel = Vector3.zero; } }
                p.pos += p.vel * dt;
                if (p.kind == 0) fx.Billboard(p.pos, 0.2f + Mathf.Sin(p.t * 6f) * 0.03f, new Color(1f, 0.85f, 0.35f, 0.95f));
                else if (p.kind == 1) { fx.Billboard(p.pos, 0.55f, new Color(0.4f, 1f, 0.55f, 0.9f)); fx.Billboard(p.pos, 0.2f, new Color(0.9f, 1f, 0.9f, 1f)); }
                else { fx.Billboard(p.pos, 0.85f, new Color(1f, 0.75f, 0.25f, 0.9f)); fx.Billboard(p.pos + Vector3.up * (0.3f + Mathf.Sin(p.t * 3f) * 0.1f), 0.3f, Color.white); }
                if (dist < 0.9f && Mathf.Abs(p.pos.y - chest.y) < 1.6f && p.t > 0.3f)
                {
                    pickups.RemoveAt(i);
                    if (p.kind == 0) { GainXp(p.value); sfx.Play("pickup", 0.35f, 0.9f + Random.value * 0.4f); }
                    else if (p.kind == 1) HealPlayer(25);
                    else { pendingChest++; sfx.Play("levelup", 0.7f, 1.2f); }
                }
            }
        }

        // ================================================================ 流程
        void ToMenu()
        {
            state = GState.Menu;
            enemies.Clear(); pickups.Clear(); fx.Clear(); nums.Clear();
            director.Reset();
            world.SetAmbience(Data.Chapters[0].amb);
            player.enabled = false;
            weapons.SetVisible(false);
            hud.ShowPlay(false);
            rig.Teleport(new Vector3(0, 0, -8), 0);
            sfx.Music("calm");
            ShowScreen();
        }

        void StartRun(string diffId)
        {
            diff = Data.Diffs[diffId];
            save.lastDiff = diffId; save.Flush();
            director.Reset(); director.mode = diff;
            enemies.Clear(); pickups.Clear(); fx.Clear(); nums.Clear();
            weapons.ResetRun();
            skills.Reset();
            level = 1; xp = 0; pendingLevels = 0; pendingChest = 0; kills = 0; gold = 0; runTime = 0; combo = 0; maxCombo = 0; perfect = 0; clearT = 0; timeScale = 1; slowT = 0;
            player.breathMax = 3.2f + save.Up("breath") * 0.8f;
            player.dashCdMax = 2.2f - save.Up("dash") * 0.2f;
            player.Reset(); player.hp = player.maxHp;
            OpenStory(0);
        }

        void OpenStory(int ch)
        {
            state = GState.Story; chapterIdx = ch;
            world.SetAmbience(Data.Chapters[ch].amb);
            player.enabled = false; weapons.SetVisible(false); hud.ShowPlay(false);
            enemies.Clear();
            sfx.Music("calm");
            ShowScreen();
        }

        void BeginChapter()
        {
            state = GState.Playing;
            panel.Show(false);
            rig.Calibrate();
            rig.Teleport(new Vector3(0, 0, -8), 0);
            player.enabled = true; player.invuln = 1.5f;
            weapons.SetVisible(true); hud.ShowPlay(true);
            director.StartChapter(chapterIdx);
            var c = Data.Chapters[chapterIdx];
            hud.Banner(c.name, c.en + " · 难度 " + diff.name, 3.2f);
            sfx.Play("gong"); sfx.Music("battle");
        }

        void OnChapterClear(int ch)
        {
            int bonus = Mathf.RoundToInt(150 * (ch + 1) * diff.reward);
            gold += bonus;
            hud.Banner("除祟功成", Data.Chapters[ch].name + " · 阳气 +" + bonus, 3f);
            sfx.Play("levelup");
            clearT = 3.6f;
            player.invuln = 999;
            enemies.projectiles.Clear(); enemies.hazards.Clear();
            Vector3 feet = rig.Feet;
            fx.AddRing(feet + Vector3.up * 0.1f, 1f, 40f, new Color(1f, 0.9f, 0.6f, 1f), 1.6f, 1.5f);
            Flash(new Color(1f, 0.94f, 0.78f), 0.5f);
            foreach (var e in enemies.list.ToArray())
                if (e.alive && !e.dying && !e.boss) { var t = e; enemies.Later(0.2f + Vector3.Distance(e.pos, feet) / 30f, () => enemies.Kill(t)); }
        }

        void AfterChapter()
        {
            player.invuln = 0;
            player.hp = player.maxHp; weapons.RefillAll();
            if (director.endless) return;
            if (chapterIdx + 1 < Data.Chapters.Count) OpenStory(chapterIdx + 1);
            else EndRun(true);
        }

        void EndRun(bool win)
        {
            victory = win;
            state = GState.Result;
            player.enabled = false; weapons.trigger = false; weapons.SetVisible(false); hud.ShowPlay(false);
            timeScale = 1; slowT = 0;
            int chReached = chapterIdx + (win ? 1 : 0);
            gained = Mathf.RoundToInt((gold + kills * 1.5f + runTime * 0.5f) * diff.reward);
            save.yangqi += gained;
            save.bestKills = Mathf.Max(save.bestKills, kills); save.bestChapter = Mathf.Max(save.bestChapter, chReached); save.bestCombo = Mathf.Max(save.bestCombo, maxCombo);
            if (win) { save.MarkCleared(diff.id); world.SetAmbience(Data.Dawn); }
            save.Flush();
            sfx.Music("calm");
            if (!win) sfx.Play("gong", 0.8f, 0.7f);
            ShowScreen();
        }

        void ContinueEndless()
        {
            state = GState.Playing;
            panel.Show(false);
            world.SetAmbience(Data.Chapters[3].amb);
            player.enabled = true; player.hp = player.maxHp; player.invuln = 1.5f;
            weapons.SetVisible(true); hud.ShowPlay(true);
            rig.Teleport(new Vector3(0, 0, -8), 0);
            director.StartEndless();
            sfx.Music("battle");
        }

        void OpenCards(string source)
        {
            cardSource = source;
            cards = skills.Roll(skills.stats.cards);
            if (cards.Count == 0) { if (source == "level") pendingLevels--; else pendingChest--; gold += 30; return; }
            state = GState.Cards;
            player.enabled = false; weapons.trigger = false;
            sfx.Play("levelup");
            ShowScreen();
        }

        void PickCard(Card c)
        {
            if (state != GState.Cards) return;
            if (c != null) { skills.Apply(c); hud.Toast(c.name + (c.level > 0 ? " " + c.level + " 重" : "")); }
            if (cardSource == "level") pendingLevels--; else pendingChest--;
            Resume();
        }

        void Resume()
        {
            state = GState.Playing;
            panel.Show(false);
            player.enabled = true;
            if (player.invuln < 100) player.invuln = Mathf.Max(player.invuln, 0.6f);
        }

        void Pause()
        {
            if (state != GState.Playing) return;
            state = GState.Paused;
            player.enabled = false; weapons.trigger = false;
            ShowScreen();
        }

        public string WaveLine()
        {
            var D = director;
            if (D.endless) return "无尽轮回 · 第 " + (D.endlessN + 1) + " 轮";
            if (D.phase == "boss") return Data.Chapters[chapterIdx].name + " · 首领现身";
            if (D.phase == "cleared") return "除祟功成";
            if (D.phase != "wave") return "";
            float left = Mathf.Max(0, D.WaveDef.dur - D.waveT);
            return Data.Chapters[chapterIdx].name + " · 第 " + (D.wave + 1) + "/" + D.TotalWaves + " 波 · " + Mathf.FloorToInt(left / 60) + ":" + Mathf.FloorToInt(left % 60).ToString("00");
        }

        public string Objective()
        {
            if (director.endless) return "坚守到底";
            if (director.phase == "boss") return "击败首领";
            if (director.phase == "cleared") return "拾取阳气与宝物";
            return Data.Chapters[chapterIdx].objective;
        }

        // ================================================================ 界面
        static readonly Color Gold = new Color(0.91f, 0.76f, 0.42f), Body = new Color(0.9f, 0.86f, 0.75f), Dim = new Color(0.66f, 0.6f, 0.47f);

        void ShowScreen()
        {
            var P = panel;
            switch (state)
            {
                case GState.Menu:
                    P.Begin(1.5f, 1.15f);
                    P.Label("真理斗僵尸", 0, 0.42f, 0.15f, Gold);
                    P.Label("茅山伏魔录 · VR", 0, 0.29f, 0.045f, Dim);
                    P.Button("开始除祟", 0, 0.14f, 0.62f, 0.11f, () => { state = GState.Diff; ShowScreen(); });
                    P.Button("道行修炼", 0, 0.0f, 0.62f, 0.11f, () => { state = GState.Upgrade; ShowScreen(); });
                    P.Button("操作说明", 0, -0.14f, 0.62f, 0.11f, () => { state = GState.Help; ShowScreen(); });
                    P.Button("退出游戏", 0, -0.28f, 0.62f, 0.11f, () => Application.Quit());
                    P.Label("阳气 " + save.yangqi + "　·　最远 " + (save.bestChapter > 0 ? Data.Chapters[Mathf.Min(3, save.bestChapter - 1)].name : "—") + "　·　最多诛邪 " + save.bestKills + "　·　最高连斩 " + save.bestCombo, 0, -0.44f, 0.032f, Dim);
                    P.Label(Mathf.RoundToInt(fps) + " FPS · " + Mathf.RoundToInt(renderScale * 100) + "%", 0, -0.52f, 0.022f, new Color(0.4f, 0.36f, 0.3f));
                    break;
                case GState.Diff:
                    P.Begin(1.9f, 1.1f);
                    P.Label("择 难 度", 0, 0.44f, 0.09f, Gold);
                    for (int i = 0; i < Data.DiffOrder.Length; i++)
                    {
                        var d = Data.Diffs[Data.DiffOrder[i]];
                        bool locked = d.unlock != null && !save.Cleared(d.unlock) && !save.Cleared("hell");
                        float x = (i - 1.5f) * 0.45f;
                        string id = d.id;
                        P.Button("", x, 0.0f, 0.41f, 0.66f, () => StartRun(id), !locked);
                        P.Label(d.name, x, 0.24f, 0.075f, locked ? Dim : Gold);
                        P.Label(d.tag, x, 0.15f, 0.032f, Dim);
                        P.Label(d.desc, x, 0.09f, 0.03f, Body, TextAnchor.UpperCenter, 11, 7);
                        P.Label(locked ? "未解锁" : "阳气收益 ×" + d.reward, x, -0.25f, 0.03f, locked ? new Color(0.6f, 0.4f, 0.35f) : new Color(1f, 0.75f, 0.38f));
                        if (save.Cleared(d.id)) P.Label("✦ 已通关", x, -0.3f, 0.026f, new Color(0.6f, 0.82f, 0.63f));
                    }
                    P.Button("返回", 0, -0.44f, 0.4f, 0.09f, ToMenu);
                    break;
                case GState.Upgrade:
                    P.Begin(1.9f, 1.2f);
                    P.Label("道行修炼", 0, 0.5f, 0.085f, Gold);
                    P.Label("现有阳气 " + save.yangqi, 0, 0.4f, 0.04f, new Color(1f, 0.85f, 0.56f));
                    for (int i = 0; i < Data.Upgrades.Count; i++)
                    {
                        var u = Data.Upgrades[i];
                        int lv = save.Up(u.id);
                        bool full = lv >= u.max;
                        int cost = full ? 0 : Data.UpgradeCost(u, lv);
                        float x = i % 2 == 0 ? -0.46f : 0.46f, y = 0.26f - (i / 2) * 0.165f;
                        var uu = u;
                        P.Button("", x, y, 0.88f, 0.145f, () => { if (save.Buy(uu)) { sfx.Play("coin"); skills.Recompute(); } ShowScreen(); }, !full && save.yangqi >= cost);
                        P.Label(u.name + "  " + new string('◆', lv) + new string('◇', u.max - lv), x - 0.41f, y + 0.03f, 0.038f, Gold, TextAnchor.MiddleLeft);
                        P.Label(u.desc, x - 0.41f, y - 0.035f, 0.028f, Body, TextAnchor.MiddleLeft);
                        P.Label(full ? "已圆满" : "阳气 " + cost, x + 0.41f, y, 0.034f, full ? Dim : new Color(1f, 0.75f, 0.38f), TextAnchor.MiddleRight);
                    }
                    P.Button("返回", 0, -0.5f, 0.4f, 0.09f, ToMenu);
                    break;
                case GState.Help:
                    P.Begin(1.7f, 1.25f);
                    P.Label("操作说明", 0, 0.54f, 0.08f, Gold);
                    string[,] rows = {
                        { "右手 扳机", "开枪 / 挥剑（枪口朝哪打哪）" }, { "右手 握键", "换弹" }, { "右手 摇杆 ←→", "分段转身" }, { "右手 摇杆 ↑↓", "切换武器" },
                        { "右手 A", "跳" }, { "右手 B", "罡步冲刺（被击瞬间 = 完美闪避）" }, { "右手 按下摇杆", "重置高度" },
                        { "左手 摇杆", "移动（方向跟随头部；按下摇杆切换疾跑）" }, { "左手 扳机", "掷火符（朝左手所指）" }, { "左手 握键", "按住闭气（僵尸闻不到你）" },
                        { "左手 X", "天师降魔（大招，诛邪蓄满）" }, { "左手 Y / 菜单键", "暂停" } };
                    for (int i = 0; i < rows.GetLength(0); i++)
                    {
                        float y = 0.42f - i * 0.072f;
                        P.Label(rows[i, 0], -0.32f, y, 0.036f, new Color(1f, 0.85f, 0.56f), TextAnchor.MiddleRight);
                        P.Label(rows[i, 1], -0.27f, y, 0.036f, Body, TextAnchor.MiddleLeft);
                    }
                    P.Button("返回", 0, -0.53f, 0.4f, 0.09f, ToMenu);
                    break;
                case GState.Story:
                    {
                        var c = Data.Chapters[chapterIdx];
                        P.Begin(1.7f, 1.15f);
                        P.Label("第" + "一二三四"[chapterIdx] + "章 · " + c.en, 0, 0.5f, 0.036f, Dim);
                        P.Label(c.name, 0, 0.38f, 0.12f, Gold);
                        P.Label(c.poem, 0, 0.25f, 0.04f, new Color(0.85f, 0.78f, 0.63f));
                        P.Label(c.story, 0, 0.16f, 0.04f, Body, TextAnchor.UpperCenter, 30, 9);
                        P.Label("难度 · " + diff.name, 0, -0.33f, 0.03f, Dim);
                        P.Button("启 程", 0, -0.45f, 0.5f, 0.11f, BeginChapter, true, 0.06f);
                        break;
                    }
                case GState.Cards:
                    {
                        P.Begin(1.9f, 1.2f);
                        P.Label(cardSource == "chest" ? "镇尸宝箱" : "道行精进", 0, 0.5f, 0.085f, Gold);
                        P.Label(cardSource == "chest" ? "箱中灵光三道，择其一" : "道行升至 " + (level - pendingLevels + 1) + " 重 · 择一道法修习", 0, 0.4f, 0.034f, Dim);
                        int n = cards.Count;
                        float cw = 0.54f, gap = 0.06f;
                        for (int i = 0; i < n; i++)
                        {
                            var c = cards[i];
                            float x = (i - (n - 1) / 2f) * (cw + gap);
                            P.Button("", x, -0.03f, cw, 0.72f, () => PickCard(c));
                            P.Label(c.tag, x, 0.28f, 0.03f, c.color);
                            P.Rect(x, 0.15f, 0.17f, 0.17f, new Color(c.color.r, c.color.g, c.color.b, 0.22f));
                            P.Label(c.icon, x, 0.15f, 0.12f, c.color);
                            P.Label(c.name, x, 0.0f, 0.055f, new Color(1f, 0.91f, 0.69f));
                            if (c.max > 0) P.Label(new string('★', c.level) + new string('☆', c.max - c.level), x, -0.075f, 0.032f, new Color(1f, 0.78f, 0.31f));
                            P.Label(c.desc, x, -0.12f, 0.032f, Body, TextAnchor.UpperCenter, 15, 6);
                        }
                        P.Button("重掷 (" + skills.rerolls + ")", -0.32f, -0.5f, 0.5f, 0.09f, () => { if (skills.rerolls > 0) { skills.rerolls--; cards = skills.Roll(skills.stats.cards); ShowScreen(); } }, skills.rerolls > 0, 0.04f);
                        P.Button("跳过（阳气 +30）", 0.32f, -0.5f, 0.5f, 0.09f, () => { gold += 30; PickCard(null); }, true, 0.04f);
                        break;
                    }
                case GState.Paused:
                    P.Begin(1.4f, 1.25f);
                    P.Label("暂 停", 0, 0.52f, 0.1f, Gold);
                    P.Label(WaveLine() + "　·　难度 " + diff.name, 0, 0.41f, 0.032f, Dim);
                    P.Label(skills.OwnedLine(), 0, 0.35f, 0.028f, Dim, TextAnchor.UpperCenter, 44, 2);
                    P.Button("继续", 0, 0.2f, 0.7f, 0.1f, Resume);
                    P.Button("重置高度（坐 / 站切换后点一下）", 0, 0.08f, 0.7f, 0.1f, () => rig.Calibrate(), true, 0.034f);
                    P.Button("枪口上抬 5°", -0.18f, -0.04f, 0.34f, 0.1f, () => { rig.SetAimPitch(Rig.AimPitch - 5f); PlayerPrefs.SetFloat("aimPitch", Rig.AimPitch); ShowScreen(); }, true, 0.036f);
                    P.Button("枪口下压 5°", 0.18f, -0.04f, 0.34f, 0.1f, () => { rig.SetAimPitch(Rig.AimPitch + 5f); PlayerPrefs.SetFloat("aimPitch", Rig.AimPitch); ShowScreen(); }, true, 0.036f);
                    P.Label("当前枪口修正 " + Mathf.RoundToInt(Rig.AimPitch) + "°（射线和手感不合时调）", 0, -0.125f, 0.026f, Dim);
                    P.Button("放弃本局", 0, -0.23f, 0.7f, 0.1f, () => EndRun(false));
                    P.Button("退出游戏", 0, -0.35f, 0.7f, 0.1f, () => Application.Quit());
                    P.Label(Mathf.RoundToInt(fps) + " FPS · 渲染 " + Mathf.RoundToInt(renderScale * 100) + "% · " + Mathf.RoundToInt(hz) + "Hz", 0, -0.55f, 0.024f, new Color(0.45f, 0.4f, 0.34f));
                    break;
                case GState.Result:
                    {
                        P.Begin(1.8f, 1.15f);
                        P.Label(victory ? (director.endless ? "轮回圆满" : "三界肃清") : "道长阵亡", 0, 0.42f, 0.14f, victory ? Gold : new Color(0.8f, 0.25f, 0.2f));
                        P.Label(victory ? "鬼门永闭，一灯长明" : "止步于 " + (director.endless ? "无尽轮回 第 " + (director.endlessN + 1) + " 轮" : Data.Chapters[chapterIdx].name), 0, 0.29f, 0.04f, Dim);
                        string[] k = { "存活时间", "诛邪", "道行", "最高连斩", "完美闪避", "获得阳气" };
                        string[] v = { Mathf.FloorToInt(runTime / 60) + ":" + Mathf.FloorToInt(runTime % 60).ToString("00"), kills.ToString(), level.ToString(), maxCombo.ToString(), perfect.ToString(), "+" + gained };
                        for (int i = 0; i < 6; i++)
                        {
                            float x = (i % 3 - 1) * 0.52f, y = 0.14f - (i / 3) * 0.19f;
                            P.Label(k[i], x, y, 0.032f, Dim);
                            P.Label(v[i], x, y - 0.065f, 0.065f, i == 5 ? new Color(1f, 0.82f, 0.38f) : new Color(1f, 0.91f, 0.69f));
                        }
                        P.Label(skills.OwnedLine(), 0, -0.24f, 0.026f, Dim, TextAnchor.UpperCenter, 60, 2);
                        bool endlessBtn = victory && !director.endless;
                        float bx = endlessBtn ? -0.5f : -0.26f;
                        P.Button("再战一局", bx, -0.44f, 0.46f, 0.11f, () => { state = GState.Diff; ShowScreen(); });
                        P.Button("主菜单", bx + 0.52f, -0.44f, 0.46f, 0.11f, ToMenu);
                        if (endlessBtn) P.Button("无尽轮回", bx + 1.04f, -0.44f, 0.46f, 0.11f, ContinueEndless);
                        break;
                    }
            }
            if (!panel.visible || !panel.Facing(rig)) panel.Place(rig);
            panel.Show(true);
        }

        // ================================================================ 主循环
        void Update()
        {
            float raw = Mathf.Min(0.05f, Time.unscaledDeltaTime);
            // 帧率统计 → 动态分辨率
            fpsN++; fpsT += Time.unscaledDeltaTime;
            if (fpsT >= 1f)
            {
                fps = fpsN / fpsT; fpsN = 0; fpsT = 0;
                hz = Rig.RefreshRate();
                if (fps < hz * 0.86f) renderScale = Mathf.Max(0.6f, renderScale - 0.08f);
                else if (fps > hz * 0.97f) renderScale = Mathf.Min(1f, renderScale + 0.04f);
                if (rig.hasXR) Rig.SetRenderScale(renderScale);
            }
            if (slowT > 0) { slowT -= raw; if (slowT <= 0) timeScale = 1; }
            float dt = raw * timeScale;
            rig.Poll(raw);
            perfectCd = Mathf.Max(0, perfectCd - raw);
            hurt = Mathf.Max(0, hurt - raw * 2.5f);
            flashA = Mathf.Max(0, flashA - raw * 2.5f);

            var L = rig.left; var R = rig.right;
            Vector3 feet = rig.Feet;
            enemies.playerPos = new Vector3(feet.x, player.y, feet.z);
            enemies.playerStealth = player.Stealth && state == GState.Playing;

            switch (state)
            {
                case GState.Playing: TickPlaying(dt, raw); break;
                case GState.Dying:
                    dyingT += raw;
                    enemies.Update(dt * 0.3f);
                    hurt = Mathf.Max(hurt, 0.8f);
                    if (dyingT > 2.4f) EndRun(false);
                    break;
                case GState.Cards:
                case GState.Paused:
                    if (R.flickR) rig.SnapTurn(30); if (R.flickL) rig.SnapTurn(-30);
                    if (state == GState.Paused && (L.secondaryHit || L.menuHit)) { Resume(); break; }
                    panel.Update(rig, fx, n => sfx.Play(n));
                    break;
                default:
                    if (R.flickR) rig.SnapTurn(30); if (R.flickL) rig.SnapTurn(-30);
                    if (R.stickClickHit) { rig.Calibrate(); panel.Place(rig); }
                    panel.Update(rig, fx, n => sfx.Play(n));
                    break;
            }
            world.Update(raw, rig.head.position, fx);
            nums.Update(raw, rig.head);
            float low = state == GState.Playing && player.hp / player.maxHp < 0.3f ? 0.3f : 0;
            hud.Update(this, Mathf.Max(hurt, low), flashCol, flashA);
        }

        void TickPlaying(float dt, float raw)
        {
            var L = rig.left; var R = rig.right; var W = weapons;
            runTime += dt;
            // 输入
            if (R.flickR) rig.SnapTurn(30); if (R.flickL) rig.SnapTurn(-30);
            if (R.flickU) W.Cycle(-1); if (R.flickD) W.Cycle(1);
            W.trigger = R.triggerDown;
            if (R.gripHit) W.StartReload();
            if (R.secondaryHit && player.Dash(rig)) { sfx.Play("dash", 0.6f); fx.Puff(rig.Feet + Vector3.up * 0.2f, new Color(0.5f, 0.5f, 0.5f), 6); L.Pulse(0.5f, 0.06f); R.Pulse(0.5f, 0.06f); }
            if (R.stickClickHit) rig.Calibrate();
            if (L.triggerHit && L.tracked) skills.ThrowFu(L.AimPos, L.AimDir);
            if (L.primaryHit && skills.CastUlt()) { hud.Banner("天师降魔", "五雷轰顶 · 万邪伏诛", 1.8f); L.Pulse(1, 0.3f); R.Pulse(1, 0.3f); }
            if (L.secondaryHit || L.menuHit) { Pause(); return; }

            player.speedMult = skills.stats.moveMult * (W.Def.moveSlow < 1 && (W.trigger || W.spin > 0.15f) ? W.Def.moveSlow : 1f);
            player.Update(dt, rig, world, this);
            if (skills.stats.regen > 0) player.Heal(skills.stats.regen * dt * Mathf.Max(0.3f, diff.heal));
            W.Update(dt, true);
            skills.Update(dt);
            enemies.Update(dt);
            director.Update(dt, rig.Feet, player.hp / player.maxHp);
            UpdatePickups(dt);

            // 左手：火符就绪时指尖亮起；右手：枪口激光
            if (L.tracked && skills.FuReady) fx.Billboard(L.AimPos + L.AimDir * 0.08f, 0.09f, new Color(1f, 0.75f, 0.25f, 0.9f));
            if (R.tracked && !W.Def.melee)
            {
                Vector3 o = W.MuzzleWorld, d = rig.right.aim.forward;
                float wd = world.Raycast(o, d, 60f), dist = wd > 0 ? wd : 60f;
                bool onEnemy = enemies.Raycast(o, d, dist, out _, out var pt, out _);
                if (onEnemy) dist = Vector3.Distance(o, pt);
                fx.AddBeam(o + d * 0.1f, o + d * Mathf.Min(dist, 30f), 0.006f, new Color(1f, 0.3f, 0.2f, 0.3f), raw * 1.5f);
                if (dist < 59f) fx.Billboard(o + d * (dist - 0.03f), Mathf.Max(0.03f, dist * 0.012f), onEnemy ? new Color(1f, 0.2f, 0.12f, 1f) : new Color(1f, 0.8f, 0.5f, 0.8f));
            }

            if (combo > 0) { comboT -= dt; if (comboT <= 0) combo = 0; }
            groanT -= dt;
            if (groanT <= 0 && enemies.aliveCount > 0) { groanT = 2.5f + Random.value * 4f; var e = enemies.list[Random.Range(0, enemies.list.Count)]; if (e.alive && !e.dying) sfx.Play("groan", 0.5f, 0.8f + Random.value * 0.5f, e.pos); }
            lightningT -= dt;
            if (lightningT <= 0) { lightningT = chapterIdx == 1 ? 14 + Random.value * 18 : 30 + Random.value * 30; if (chapterIdx >= 1) { world.Lightning(0.8f); sfx.Play("thunder", 0.35f, 0.8f); } }

            if (!player.alive)
            {
                state = GState.Dying; dyingT = 0;
                player.enabled = false; W.trigger = false;
                Slowmo(0.35f, 1.4f);
                sfx.Play("gong", 0.8f, 0.6f);
                return;
            }
            if (clearT > 0)
            {
                clearT -= dt;
                if (clearT <= 0) { if (pendingLevels > 0 || pendingChest > 0) clearT = 0.01f; else { AfterChapter(); return; } }
            }
            if (pendingLevels > 0) OpenCards("level");
            else if (pendingChest > 0) OpenCards("chest");
        }
    }

    public static class Boot
    {
        [RuntimeInitializeOnLoadMethod(RuntimeInitializeLoadType.AfterSceneLoad)]
        static void Start()
        {
            if (Object.FindAnyObjectByType<Game>() != null) return;
            Rig.AimPitch = PlayerPrefs.GetFloat("aimPitch", 35f);
            var go = new GameObject("Game");
            go.AddComponent<Game>();
            Debug.Log("[ZS] boot ok");
        }
    }
}
