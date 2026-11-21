using System;
using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    public class Stats
    {
        public float maxHp = 100, gunDmg = 1, fireRate = 1, reloadMult = 1, crit = 0.05f, headMult = 1, moveMult = 1, armor = 1, regen = 0, magnet = 2.6f, xpMult = 1;
        public float fuCd = Data.FuCooldown, fuDmg = Data.FuDamage, fuRadius = Data.FuRadius, lifesteal = 0;
        public int fuCount = 1, cards = 3;
    }

    public class Card
    {
        public string kind, id, name, desc, icon, tag;
        public int level, max;
        public Color color = new Color(0.91f, 0.76f, 0.42f);
    }

    class ArtDef { public string id, name, icon; public Func<int, string> desc; public Color col; }
    class PassiveDef { public string id, name, icon, desc; public int max; public Action<Stats, int> apply; }

    /// <summary>茅山道术：火符、天师降魔、自动施放的道法、修身被动、升级选卡。</summary>
    public class Skills
    {
        public Stats stats = new Stats();
        public float fuCd, ult;
        public int rerolls;
        public readonly Dictionary<string, int> arts = new Dictionary<string, int>(), passives = new Dictionary<string, int>();
        readonly Dictionary<string, float> cds = new Dictionary<string, float>();
        readonly Game g;
        readonly List<Enemy> tmp = new List<Enemy>();

        class Shot { public Vector3 pos, vel; public float life, dmg, radius; public int pierce; public bool fu; public List<Enemy> hit; }
        readonly List<Shot> shots = new List<Shot>();
        class Zone { public Vector3 pos; public float life, radius, dps, tick; }
        readonly List<Zone> zones = new List<Zone>();
        readonly Dictionary<Enemy, float> swordHit = new Dictionary<Enemy, float>();
        float swordAngle, decoyT, decoyDmg;
        Vector3 decoyPos;

        static readonly int[] ThunderN = { 1, 2, 2, 3, 3 }, CoinN = { 1, 1, 2, 2, 3 };
        static readonly ArtDef[] Arts = {
            new ArtDef { id = "thunder", name = "五雷正法", icon = "雷", col = Col.H(0x9fd0ff, 1), desc = l => $"召天雷劈击 {ThunderN[l - 1]} 个邪祟，伤害 {45 + l * 18}，附带短暂麻痹" },
            new ArtDef { id = "swords", name = "桃木剑阵", icon = "剑", col = Col.H(0xffb080, 1), desc = l => $"{1 + l} 柄桃木剑环身飞旋，触之即伤 {20 + l * 7}" },
            new ArtDef { id = "coins", name = "铜钱剑", icon = "钱", col = Col.H(0xffd060, 1), desc = l => $"自动掷出铜钱剑 ×{CoinN[l - 1]}，伤害 {28 + l * 10}，贯穿 {1 + l / 2}" },
            new ArtDef { id = "bagua", name = "八卦镜", icon = "卦", col = Col.H(0xffe080, 1), desc = l => $"每 {7 - l * 0.5f:0.0} 秒照出金光，半径 {4.5f + l * 0.6f:0.0} 米，伤害 {40 + l * 15} 并震退" },
            new ArtDef { id = "rice", name = "糯米阵", icon = "米", col = Col.H(0xf4f0e0, 1), desc = l => $"撒下糯米，形成 {1 + l / 3} 处阵地，每秒伤害 {14 + l * 6}（僵尸 ×2）并减速" },
            new ArtDef { id = "inkline", name = "墨斗线", icon = "墨", col = Col.H(0xff6060, 1), desc = l => $"弹出 {2 + l} 道墨斗线，伤害 {30 + l * 12}，定身 {1.2f + l * 0.2f:0.0} 秒" },
            new ArtDef { id = "bell", name = "三清铃", icon = "铃", col = Col.H(0xe0c080, 1), desc = l => $"摇铃震魂，半径 {5 + l * 0.5f:0.0} 米内邪祟眩晕 {1 + l * 0.2f:0.0} 秒（对鬼怪伤害 ×2）" },
            new ArtDef { id = "paperman", name = "纸人替身", icon = "替", col = Col.H(0xffb0b0, 1), desc = l => $"召出纸人替身吸引邪祟 5 秒，随后自焚爆炸造成 {60 + l * 30} 伤害" },
            new ArtDef { id = "beidou", name = "七星剑诀", icon = "斗", col = Col.H(0xc0b0ff, 1), desc = l => $"北斗七星自天而降，每颗星伤害 {50 + l * 20}" + (l >= 5 ? "，连降两轮" : "") },
        };
        static readonly PassiveDef[] Passives = {
            new PassiveDef { id = "vigor", name = "铜皮铁骨", icon = "骨", desc = "生命上限 +20", max = 5, apply = (s, l) => s.maxHp += 20 * l },
            new PassiveDef { id = "sharp", name = "火药精研", icon = "药", desc = "枪械伤害 +12%", max = 5, apply = (s, l) => s.gunDmg *= 1 + 0.12f * l },
            new PassiveDef { id = "rapid", name = "快手", icon = "疾", desc = "射速 +10%", max = 5, apply = (s, l) => s.fireRate *= 1 + 0.1f * l },
            new PassiveDef { id = "reload", name = "熟能生巧", icon = "熟", desc = "换弹速度 +18%", max = 4, apply = (s, l) => s.reloadMult *= 1 + 0.18f * l },
            new PassiveDef { id = "crit", name = "天眼通", icon = "眼", desc = "暴击率 +6%", max = 5, apply = (s, l) => s.crit += 0.06f * l },
            new PassiveDef { id = "head", name = "点穴", icon = "穴", desc = "爆头伤害 +20%", max = 4, apply = (s, l) => s.headMult *= 1 + 0.2f * l },
            new PassiveDef { id = "swift", name = "神行", icon = "行", desc = "移动速度 +6%", max = 4, apply = (s, l) => s.moveMult *= 1 + 0.06f * l },
            new PassiveDef { id = "armor", name = "金钟罩", icon = "钟", desc = "所受伤害 -7%", max = 5, apply = (s, l) => s.armor *= 1 - 0.07f * l },
            new PassiveDef { id = "regen", name = "吐纳", icon = "息", desc = "每秒回复 0.6 生命", max = 4, apply = (s, l) => s.regen += 0.6f * l },
            new PassiveDef { id = "magnet", name = "聚阳", icon = "聚", desc = "拾取范围 +1.2 米", max = 4, apply = (s, l) => s.magnet += 1.2f * l },
            new PassiveDef { id = "fufire", name = "敕令真火", icon = "火", desc = "火符伤害 +30 · 范围 +0.4 米", max = 5, apply = (s, l) => { s.fuDmg += 30 * l; s.fuRadius += 0.4f * l; } },
            new PassiveDef { id = "fumore", name = "连珠符", icon = "符", desc = "火符 +1 张 · 冷却 -0.6 秒", max = 2, apply = (s, l) => { s.fuCount += l; s.fuCd -= 0.6f * l; } },
            new PassiveDef { id = "steal", name = "采阴补阳", icon = "补", desc = "每次诛邪回复 0.4 生命", max = 3, apply = (s, l) => s.lifesteal += 0.4f * l },
            new PassiveDef { id = "wisdom", name = "悟性", icon = "悟", desc = "阳气经验 +10%", max = 4, apply = (s, l) => s.xpMult *= 1 + 0.1f * l },
        };

        public Skills(Game game) { g = game; }

        public bool FuReady => fuCd <= 0;
        public bool UltReady => ult >= 100;
        public void AddUlt(float v) { ult = Mathf.Min(100, ult + v); }

        public void Reset()
        {
            arts.Clear(); passives.Clear(); cds.Clear(); shots.Clear(); zones.Clear(); swordHit.Clear();
            fuCd = 0; ult = 0; decoyT = 0;
            rerolls = 1 + g.save.Up("luck");
            Recompute();
        }

        public void Recompute()
        {
            var s = new Stats();
            var up = g.save;
            s.maxHp += up.Up("hp") * 15;
            s.moveMult *= 1 + up.Up("spd") * 0.05f;
            s.gunDmg *= 1 + up.Up("dmg") * 0.07f;
            s.fuDmg += up.Up("fu") * 25; s.fuCd -= up.Up("fu") * 0.6f;
            s.xpMult *= 1 + up.Up("xp") * 0.08f;
            foreach (var p in Passives) if (passives.TryGetValue(p.id, out int l) && l > 0) p.apply(s, l);
            s.fuCd = Mathf.Max(2f, s.fuCd);
            stats = s;
            g.ApplyStats();
        }

        // ------------------------------------------------------------ 选卡
        public List<Card> Roll(int n)
        {
            var poolC = new List<Card>();
            foreach (var a in Arts)
            {
                int l = arts.TryGetValue(a.id, out int v) ? v : 0;
                if (l >= 5) continue;
                poolC.Add(new Card { kind = "art", id = a.id, name = a.name, icon = a.icon, level = l + 1, max = 5, desc = a.desc(l + 1), tag = l == 0 ? "道术 · 新" : "道术", color = a.col });
            }
            foreach (var p in Passives)
            {
                int l = passives.TryGetValue(p.id, out int v) ? v : 0;
                if (l >= p.max) continue;
                poolC.Add(new Card { kind = "passive", id = p.id, name = p.name, icon = p.icon, level = l + 1, max = p.max, desc = p.desc, tag = "修身", color = new Color(0.7f, 0.85f, 0.75f) });
            }
            var W = g.weapons;
            foreach (var id in Data.WeaponOrder)
            {
                var d = Data.Weapons[id];
                if (!W.owned.Contains(id)) { if (g.level >= 3) poolC.Add(new Card { kind = "weapon", id = id, name = d.name, icon = "枪", desc = WeaponBlurb(id), tag = "兵器 · 新", color = new Color(1f, 0.6f, 0.35f) }); }
                else if (W.Level(id) < 3) poolC.Add(new Card { kind = "wup", id = id, name = d.name + " 改良", icon = "锻", level = W.Level(id) + 1, max = 3, desc = d.melee ? "伤害 +30% · 范围 +15%" : "伤害 +20% · 弹容 +25% · 换弹更快", tag = "兵器", color = new Color(1f, 0.6f, 0.35f) });
            }
            if (g.player.hp < g.player.maxHp * 0.6f) poolC.Add(new Card { kind = "heal", id = "heal", name = "回春丹", icon = "丹", desc = "立即回复 50% 生命", tag = "丹药", color = new Color(0.5f, 1f, 0.6f) });
            var res = new List<Card>();
            // 至少保证一张道术（若还有可学的）
            for (int k = 0; k < n && poolC.Count > 0; k++)
            {
                int i = UnityEngine.Random.Range(0, poolC.Count);
                if (k == 0) { var artsOnly = poolC.FindAll(c => c.kind == "art"); if (artsOnly.Count > 0) i = poolC.IndexOf(artsOnly[UnityEngine.Random.Range(0, artsOnly.Count)]); }
                res.Add(poolC[i]); poolC.RemoveAt(i);
            }
            return res;
        }

        static string WeaponBlurb(string id)
        {
            switch (id)
            {
                case "thompson": return "汤姆逊冲锋枪：50 发弹鼓，泼水般的全自动火力";
                case "ak47": return "AK-47：全自动，单发伤害高，射程远";
                case "shotgun": return "双管猎枪：一枪九丸，近身轰飞一片";
                case "gatling": return "加特林：200 发弹链，需预热，举枪时移动变慢";
                default: return "";
            }
        }

        public void Apply(Card c)
        {
            switch (c.kind)
            {
                case "art": arts[c.id] = c.level; cds[c.id] = 0.5f; break;
                case "passive": passives[c.id] = c.level; break;
                case "weapon": g.weapons.Add(c.id); break;
                case "wup": g.weapons.Upgrade(c.id); break;
                case "heal": g.HealPlayer(g.player.maxHp * 0.5f); break;
            }
            Recompute();
        }

        public string OwnedLine()
        {
            var sb = new System.Text.StringBuilder();
            foreach (var a in Arts) if (arts.TryGetValue(a.id, out int l)) sb.Append(a.name).Append(' ').Append(l).Append("　");
            foreach (var p in Passives) if (passives.TryGetValue(p.id, out int l)) sb.Append(p.name).Append(' ').Append(l).Append("　");
            return sb.ToString();
        }

        // ------------------------------------------------------------ 火符 / 大招
        public bool ThrowFu(Vector3 origin, Vector3 dir)
        {
            if (!FuReady) return false;
            fuCd = stats.fuCd;
            for (int k = 0; k < stats.fuCount; k++)
            {
                float off = (k - (stats.fuCount - 1) / 2f) * 9f;
                var d = Quaternion.Euler(0, off, 0) * dir;
                shots.Add(new Shot { pos = origin + d * 0.3f, vel = d * Data.FuSpeed + Vector3.up * 1.2f, life = 1.8f, dmg = stats.fuDmg, radius = stats.fuRadius, fu = true });
            }
            g.sfx.Play("fu");
            return true;
        }

        void ExplodeFu(Shot s)
        {
            var p = new Vector3(s.pos.x, Mathf.Max(0.05f, s.pos.y), s.pos.z);
            g.fx.Explosion(new Vector3(p.x, 0.05f, p.z), s.radius, new Color(1f, 0.6f, 0.2f, 1f));
            g.sfx.Play("boom", 1f, 1f, p);
            g.enemies.Query(p, s.radius, tmp);
            foreach (var e in tmp) { var dir = (e.pos - p); dir.y = 0; g.enemies.Damage(e, s.dmg, Dmg.Fire, dir.normalized, 0.6f); }
            if (tmp.Count >= 5) g.hud.Toast("敕令真火 · 燎中 " + tmp.Count + " 只");
        }

        public bool CastUlt()
        {
            if (!UltReady) return false;
            ult = 0;
            Vector3 feet = g.rig.Feet;
            g.fx.AddRing(feet + Vector3.up * 0.06f, 1f, 26f, new Color(1f, 0.88f, 0.5f, 1f), 1.2f, 1.2f);
            g.sfx.Play("thunder"); g.sfx.Play("gong");
            g.Flash(new Color(1f, 0.94f, 0.75f), 0.55f);
            g.world.Lightning(1.5f);
            g.enemies.Query(feet, 28f, tmp);
            int i = 0;
            foreach (var e in tmp.ToArray())
            {
                var target = e;
                g.enemies.Later(0.05f + (i++ % 12) * 0.05f, () =>
                {
                    if (!target.alive || target.dying) return;
                    g.fx.Bolt(target.pos + Vector3.up * 24f, target.pos + Vector3.up * 0.2f, new Color(1f, 0.92f, 0.6f, 1f), 0.22f);
                    target.stun = Mathf.Max(target.stun, target.boss ? 1.2f : 2.5f);
                    g.enemies.Damage(target, target.boss ? 900f : 380f, Dmg.Art, Vector3.zero);
                });
            }
            return true;
        }

        // ------------------------------------------------------------ 每帧
        int L(string id) => arts.TryGetValue(id, out int l) ? l : 0;
        bool Ready(string id, float dt)
        {
            if (!cds.TryGetValue(id, out float c)) c = 0;
            c -= dt; cds[id] = c;
            return c <= 0;
        }

        public void Update(float dt)
        {
            var E = g.enemies; var fx = g.fx;
            Vector3 feet = g.rig.Feet, chest = feet + Vector3.up * 1.2f;
            fuCd = Mathf.Max(0, fuCd - dt);
            int l;

            if ((l = L("thunder")) > 0 && Ready("thunder", dt))
            {
                E.Query(feet, 18f, tmp);
                if (tmp.Count > 0)
                {
                    cds["thunder"] = 2.6f;
                    for (int k = 0; k < ThunderN[l - 1] && tmp.Count > 0; k++)
                    {
                        int i = UnityEngine.Random.Range(0, tmp.Count); var e = tmp[i]; tmp.RemoveAt(i);
                        fx.Bolt(e.pos + Vector3.up * 22f, e.pos + Vector3.up * 0.2f, new Color(0.7f, 0.85f, 1f, 1f));
                        e.stun = Mathf.Max(e.stun, 0.4f);
                        E.Damage(e, 45 + l * 18, Dmg.Art, Vector3.zero);
                    }
                    g.sfx.Play("thunder", 0.5f, 1.3f);
                }
            }

            if ((l = L("swords")) > 0)
            {
                swordAngle += dt * 150f;
                int n = 1 + l;
                var keys = new List<Enemy>(swordHit.Keys);
                foreach (var k in keys) { swordHit[k] -= dt; if (swordHit[k] <= 0) swordHit.Remove(k); }
                for (int i = 0; i < n; i++)
                {
                    float a = (swordAngle + i * 360f / n) * Mathf.Deg2Rad;
                    var p = chest + new Vector3(Mathf.Cos(a) * 2.2f, -0.1f, Mathf.Sin(a) * 2.2f);
                    var tan = new Vector3(-Mathf.Sin(a), 0, Mathf.Cos(a));
                    fx.AddBeam(p - tan * 0.45f, p + tan * 0.45f, 0.07f, new Color(1f, 0.6f, 0.35f, 0.95f), dt * 1.5f);
                    fx.Billboard(p + tan * 0.45f, 0.16f, new Color(1f, 0.75f, 0.5f, 0.8f));
                    E.Query(p, 0.55f, tmp);
                    foreach (var e in tmp)
                    {
                        if (swordHit.ContainsKey(e)) continue;
                        swordHit[e] = 0.5f;
                        E.Damage(e, 20 + l * 7, Dmg.Art, (e.pos - feet).normalized, 0.25f);
                    }
                }
            }

            if ((l = L("coins")) > 0 && Ready("coins", dt))
            {
                E.Query(feet, 20f, tmp);
                if (tmp.Count > 0)
                {
                    cds["coins"] = 1.8f;
                    tmp.Sort((a, b) => (a.pos - feet).sqrMagnitude.CompareTo((b.pos - feet).sqrMagnitude));
                    for (int k = 0; k < CoinN[l - 1]; k++)
                    {
                        var e = tmp[Mathf.Min(k, tmp.Count - 1)];
                        var d = (e.Center - chest).normalized;
                        shots.Add(new Shot { pos = chest, vel = d * 20f, life = 1.6f, dmg = 28 + l * 10, pierce = 1 + l / 2, hit = new List<Enemy>() });
                    }
                    g.sfx.Play("coin", 0.5f);
                }
            }

            if ((l = L("bagua")) > 0 && Ready("bagua", dt))
            {
                float r = 4.5f + l * 0.6f;
                E.Query(feet, r, tmp);
                if (tmp.Count > 0)
                {
                    cds["bagua"] = 7 - l * 0.5f;
                    fx.AddRing(feet + Vector3.up * 0.06f, 0.4f, r, new Color(1f, 0.88f, 0.5f, 1f), 0.5f, 0.8f);
                    foreach (var e in tmp) E.Damage(e, 40 + l * 15, Dmg.Art, (e.pos - feet).normalized, 1.2f);
                    g.sfx.Play("gong", 0.5f, 1.5f);
                }
            }

            if ((l = L("rice")) > 0 && Ready("rice", dt))
            {
                var near = E.Nearest(feet, 12f);
                if (near != null)
                {
                    cds["rice"] = 6f;
                    int n = 1 + l / 3;
                    for (int k = 0; k < n; k++)
                    {
                        var p = k == 0 ? Vector3.Lerp(feet, near.pos, 0.6f) : feet + new Vector3(UnityEngine.Random.value - 0.5f, 0, UnityEngine.Random.value - 0.5f) * 8f;
                        p.y = 0;
                        zones.Add(new Zone { pos = p, life = 5f, radius = 2.6f, dps = 14 + l * 6 });
                    }
                    g.sfx.Play("coin", 0.4f, 0.6f);
                }
            }
            for (int i = zones.Count - 1; i >= 0; i--)
            {
                var z = zones[i];
                z.life -= dt; z.tick -= dt;
                if (z.life <= 0) { zones.RemoveAt(i); continue; }
                fx.GroundDisc(z.pos + Vector3.up * 0.04f, z.radius, new Color(0.96f, 0.94f, 0.85f, 0.22f * Mathf.Min(1, z.life)), 1f);
                if (UnityEngine.Random.value < dt * 20f) { float a = UnityEngine.Random.value * 6.283f, r = UnityEngine.Random.value * z.radius; fx.Emit(z.pos + new Vector3(Mathf.Cos(a) * r, 0.05f, Mathf.Sin(a) * r), Vector3.up * 0.8f, 0.06f, 0.02f, 0.5f, new Color(1f, 1f, 0.9f, 0.9f)); }
                if (z.tick <= 0)
                {
                    z.tick = 0.4f;
                    E.Query(z.pos, z.radius, tmp);
                    foreach (var e in tmp) { e.slow = 0.6f; E.Damage(e, z.dps * 0.4f * (e.def.jiangshi ? 2 : 1), Dmg.Art, Vector3.zero); }
                }
            }

            if ((l = L("inkline")) > 0 && Ready("inkline", dt))
            {
                E.Query(feet, 14f, tmp);
                if (tmp.Count > 0)
                {
                    cds["inkline"] = 5f;
                    tmp.Sort((a, b) => (a.pos - feet).sqrMagnitude.CompareTo((b.pos - feet).sqrMagnitude));
                    for (int k = 0; k < Mathf.Min(2 + l, tmp.Count); k++)
                    {
                        var e = tmp[k];
                        fx.AddBeam(chest, e.Center, 0.05f, new Color(1f, 0.25f, 0.2f, 1f), 0.35f);
                        e.stun = Mathf.Max(e.stun, e.boss ? 0.4f : 1.2f + l * 0.2f);
                        E.Damage(e, 30 + l * 12, Dmg.Art, Vector3.zero);
                    }
                    g.sfx.Play("chain", 0.5f, 1.4f);
                }
            }

            if ((l = L("bell")) > 0 && Ready("bell", dt))
            {
                float r = 5 + l * 0.5f;
                E.Query(feet, r, tmp);
                if (tmp.Count >= 2)
                {
                    cds["bell"] = 6f;
                    fx.AddRing(chest, 0.3f, r, new Color(0.9f, 0.8f, 0.5f, 0.8f), 0.6f, 0.4f);
                    foreach (var e in tmp) { e.stun = Mathf.Max(e.stun, e.boss ? 0.3f : 1 + l * 0.2f); E.Damage(e, (15 + l * 5) * (e.def.ghost ? 2 : 1), Dmg.Art, Vector3.zero); }
                    g.sfx.Play("bell");
                }
            }

            if ((l = L("paperman")) > 0)
            {
                if (decoyT > 0)
                {
                    decoyT -= dt;
                    fx.Billboard(decoyPos + Vector3.up * 0.9f, 1.3f, new Color(1f, 0.6f, 0.6f, 0.5f));
                    fx.Billboard(decoyPos + Vector3.up * 1.5f, 0.5f, new Color(1f, 0.9f, 0.8f, 0.9f));
                    E.hasDecoy = true; E.decoyPos = decoyPos;
                    if (decoyT <= 0)
                    {
                        E.hasDecoy = false;
                        fx.Explosion(decoyPos, 4f, new Color(1f, 0.5f, 0.3f, 1f));
                        g.sfx.Play("boom", 1f, 1f, decoyPos);
                        E.Query(decoyPos, 4f, tmp);
                        foreach (var e in tmp) E.Damage(e, decoyDmg, Dmg.Fire, (e.pos - decoyPos).normalized, 1f);
                    }
                }
                else if (Ready("paperman", dt) && E.aliveCount >= 4)
                {
                    cds["paperman"] = 14f;
                    decoyPos = g.world.Collide(feet + g.rig.FlatForward * 4f, 0.4f);
                    decoyT = 5f; decoyDmg = 60 + l * 30;
                    fx.Puff(decoyPos + Vector3.up, new Color(1f, 0.8f, 0.8f), 10);
                }
            }
            else E.hasDecoy = false;

            if ((l = L("beidou")) > 0 && Ready("beidou", dt))
            {
                E.Query(feet, 20f, tmp);
                if (tmp.Count > 0)
                {
                    cds["beidou"] = 9f;
                    int rounds = l >= 5 ? 2 : 1;
                    float dmg = 50 + l * 20;
                    for (int r = 0; r < rounds; r++)
                        for (int k = 0; k < 7; k++)
                        {
                            var e = tmp[UnityEngine.Random.Range(0, tmp.Count)];
                            var p = e.pos + new Vector3(UnityEngine.Random.value - 0.5f, 0, UnityEngine.Random.value - 0.5f) * 1.5f;
                            E.Later(0.25f + k * 0.16f + r * 1.3f, () =>
                            {
                                fx.Bolt(p + Vector3.up * 26f, p, new Color(0.8f, 0.75f, 1f, 1f), 0.16f);
                                fx.AddRing(p + Vector3.up * 0.06f, 0.2f, 1.8f, new Color(0.8f, 0.75f, 1f, 1f), 0.4f);
                                var hits = new List<Enemy>();
                                E.Query(p, 1.8f, hits);
                                foreach (var h in hits) E.Damage(h, dmg, Dmg.Art, Vector3.zero);
                                g.sfx.Play("bell", 0.3f, 1.6f, p);
                            });
                        }
                }
            }

            // 飞行物：火符 / 铜钱剑
            for (int i = shots.Count - 1; i >= 0; i--)
            {
                var s = shots[i];
                s.life -= dt;
                if (s.fu) s.vel.y -= 5f * dt;
                Vector3 prev = s.pos;
                s.pos += s.vel * dt;
                bool dead = s.life <= 0 || s.pos.y <= 0.05f || g.world.Blocked(s.pos, 0.05f) && s.pos.y < 3.2f;
                if (s.fu)
                {
                    fx.Billboard(s.pos, 0.55f, new Color(1f, 0.6f, 0.2f, 0.9f));
                    fx.Billboard(s.pos, 0.2f, new Color(1f, 0.95f, 0.6f, 1f));
                    if (UnityEngine.Random.value < dt * 50f) fx.Emit(s.pos, Vector3.up * 0.5f, 0.22f, 0.02f, 0.35f, new Color(1f, 0.5f, 0.15f, 0.7f));
                    if (!dead) { E.Query(s.pos, 0.5f, tmp); foreach (var e in tmp) if (Mathf.Abs(e.Center.y - s.pos.y) < e.height * 0.7f) { dead = true; break; } }
                    if (dead) { ExplodeFu(s); shots.RemoveAt(i); }
                }
                else
                {
                    fx.AddBeam(prev, s.pos, 0.09f, new Color(1f, 0.82f, 0.35f, 1f), 0.1f);
                    fx.Billboard(s.pos, 0.25f, new Color(1f, 0.85f, 0.4f, 1f));
                    if (!dead)
                    {
                        E.Query(s.pos, 0.6f, tmp);
                        foreach (var e in tmp)
                        {
                            if (s.hit.Contains(e)) continue;
                            s.hit.Add(e);
                            E.Damage(e, s.dmg, Dmg.Art, s.vel.normalized, 0.3f);
                            if (--s.pierce < 0) { dead = true; break; }
                        }
                    }
                    if (dead) shots.RemoveAt(i);
                }
            }
        }
    }
}
