using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    public enum AI { Hop, Run, Walk, Caster, Soldier, Drought, WuWhite, WuBlack, Hou, Sorcerer }

    public class EnemyDef
    {
        public string id, name, title, look;
        public AI ai;
        public float scale = 1, hp, speed, damage, radius, xp, atkRange, atkTime, bulletMult = 1, fireMult = 1;
        public float hopH, hopT, hopRest, floatY;
        public bool boss, jiangshi, ghost, paper, burst;
        public float shieldArc, shieldMult = 1;
        public float posture;
        public float[] phases;
        public int skin, robe, trim;       // 外观主色
    }

    public class WaveDef { public float dur, rate; public int max; public (string, int)[] pool; }

    public class Ambience
    {
        public Color skyTop, skyHorizon, moonColor, moonLight, fog, hemiSky, hemiGround, cloud, ghostFire;
        public float moonIntensity, moonSize, fogDensity, hemi, eclipse;
        public bool rain, embers, gate;
    }

    public class ChapterDef
    {
        public string name, en, story, poem, bossName, objective;
        public WaveDef[] waves;
        public string[] boss;
        public (string, int)[] escort;
        public Vector2? bossAt;
        public Ambience amb;
    }

    public class DiffDef { public string id, name, tag, desc, unlock; public float hp, dmg, spawn, elite, aggro, tele, reward, heal, bossHp; }

    public class WeaponDef
    {
        public string id, name, sound;
        public bool auto, melee;
        public float interval, damage, headMult, reload, spread, range, knock, flash, spinUp, moveSlow = 1, arc;
        public int mag, pellets = 1;
    }

    public class UpgradeDef { public string id, name, desc; public int max; public float baseCost, growth; }

    public static class Data
    {
        public const float ArenaHalf = 36f;
        public const float EyeHeight = 1.65f;

        public static readonly Dictionary<string, EnemyDef> Enemies = new Dictionary<string, EnemyDef>();
        public static readonly List<ChapterDef> Chapters = new List<ChapterDef>();
        public static readonly Dictionary<string, DiffDef> Diffs = new Dictionary<string, DiffDef>();
        public static readonly string[] DiffOrder = { "easy", "normal", "hard", "hell" };
        public static readonly Dictionary<string, WeaponDef> Weapons = new Dictionary<string, WeaponDef>();
        public static readonly string[] WeaponOrder = { "mauser", "thompson", "ak47", "shotgun", "gatling", "sword" };
        public static readonly List<UpgradeDef> Upgrades = new List<UpgradeDef>();
        public static WaveDef EndlessWave;
        public static Ambience Dawn;

        // 火符
        public const float FuDamage = 80, FuRadius = 3.4f, FuCooldown = 7, FuSpeed = 15;

        static void E(EnemyDef d) { Enemies[d.id] = d; }
        static Color C(int hex) => Col.H(hex, 1);

        static Data()
        {
            // ---------------- 邪祟
            E(new EnemyDef { id = "normal", look = "jiangshi", name = "伏尸", title = "尸变之始", ai = AI.Hop, hp = 45, speed = 2.4f, damage = 8, radius = 0.42f, xp = 1, hopH = 0.42f, hopT = 0.55f, hopRest = 0.28f, atkRange = 1.6f, atkTime = 0.9f, fireMult = 1.3f, jiangshi = true, skin = 0x9aa79a, robe = 0x1c2a4a, trim = 0xa82a22 });
            E(new EnemyDef { id = "purple", look = "jiangshi", name = "紫僵", title = "淤血初变", ai = AI.Hop, scale = 1.02f, hp = 80, speed = 2.8f, damage = 11, radius = 0.42f, xp = 2, hopH = 0.5f, hopT = 0.52f, hopRest = 0.22f, atkRange = 1.65f, atkTime = 0.85f, fireMult = 1.3f, jiangshi = true, skin = 0x8a6aa0, robe = 0x2a1c44, trim = 0xc8a040 });
            E(new EnemyDef { id = "white", look = "jiangshi", name = "白僵", title = "霉毛遍体", ai = AI.Hop, scale = 1.04f, hp = 170, speed = 1.9f, damage = 16, radius = 0.45f, xp = 4, hopH = 0.38f, hopT = 0.7f, hopRest = 0.35f, atkRange = 1.7f, atkTime = 1.0f, fireMult = 2.2f, jiangshi = true, skin = 0xe8e8e0, robe = 0x8a8a84, trim = 0x4a6a8a });
            E(new EnemyDef { id = "green", look = "jiangshi", name = "绿僵", title = "尸气凝碧", ai = AI.Hop, scale = 1.06f, hp = 140, speed = 3.6f, damage = 17, radius = 0.45f, xp = 4, hopH = 0.6f, hopT = 0.48f, hopRest = 0.18f, atkRange = 1.75f, atkTime = 0.8f, fireMult = 1.3f, jiangshi = true, skin = 0x5a9a5a, robe = 0x1a3a22, trim = 0xc8c040 });
            E(new EnemyDef { id = "hairy", look = "jiangshi", name = "毛僵", title = "刀枪不入", ai = AI.Hop, scale = 1.1f, hp = 260, speed = 3.9f, damage = 21, radius = 0.48f, xp = 7, hopH = 0.7f, hopT = 0.44f, hopRest = 0.16f, atkRange = 1.8f, atkTime = 0.75f, bulletMult = 0.5f, fireMult = 1.8f, jiangshi = true, skin = 0x6a5a48, robe = 0x3a2a1c, trim = 0x8a2a1a });
            E(new EnemyDef { id = "flying", look = "jiangshi", name = "飞僵", title = "腾跃如风", ai = AI.Hop, scale = 1.05f, hp = 130, speed = 5.6f, damage = 17, radius = 0.44f, xp = 6, hopH = 1.7f, hopT = 0.6f, hopRest = 0.1f, atkRange = 1.8f, atkTime = 0.7f, fireMult = 1.2f, jiangshi = true, skin = 0x7a8aa8, robe = 0x101828, trim = 0x60c8ff });
            E(new EnemyDef { id = "drought", look = "jiangshi", name = "旱魃", title = "赤地千里", ai = AI.Drought, boss = true, scale = 1.3f, hp = 2600, speed = 2.6f, damage = 26, radius = 0.6f, xp = 60, hopH = 0.55f, hopT = 0.62f, hopRest = 0.25f, atkRange = 2.2f, atkTime = 1.0f, bulletMult = 0.85f, fireMult = 0.4f, jiangshi = true, posture = 1000, phases = new[] { 0.55f, 0.25f }, skin = 0xc85a30, robe = 0x4a1408, trim = 0xffb040 });
            E(new EnemyDef { id = "imp", look = "imp", name = "小鬼", title = "阴司走卒", ai = AI.Run, hp = 22, speed = 5.4f, damage = 5, radius = 0.32f, xp = 1, atkRange = 1.1f, atkTime = 0.55f, fireMult = 1.5f, ghost = true, skin = 0x4a9a6a, robe = 0x2a2a30, trim = 0xffe060 });
            E(new EnemyDef { id = "paper", look = "paper", name = "纸人", title = "纸扎还魂", ai = AI.Walk, hp = 60, speed = 3.0f, damage = 9, radius = 0.36f, xp = 2, atkRange = 1.3f, atkTime = 0.7f, bulletMult = 0.8f, fireMult = 3.0f, paper = true, burst = true, skin = 0xf4ecd8, robe = 0xc02838, trim = 0x3a8a4a });
            E(new EnemyDef { id = "ghost", look = "ghost", name = "红衣厉鬼", title = "含冤而死", ai = AI.Caster, hp = 95, speed = 2.6f, damage = 12, radius = 0.4f, xp = 4, floatY = 0.35f, atkRange = 13, atkTime = 1.1f, fireMult = 1.2f, ghost = true, skin = 0xe8e4e0, robe = 0xa01018, trim = 0x101014 });
            E(new EnemyDef { id = "wuWhite", look = "wu", name = "白无常", title = "一见生财", ai = AI.WuWhite, boss = true, hp = 2400, speed = 3.2f, damage = 20, radius = 0.55f, xp = 50, atkRange = 12, atkTime = 1.2f, ghost = true, posture = 900, phases = new[] { 0.5f }, skin = 0xf4f2f0, robe = 0xe8e6e0, trim = 0x1a1a1a });
            E(new EnemyDef { id = "wuBlack", look = "wu", name = "黑无常", title = "天下太平", ai = AI.WuBlack, boss = true, hp = 2800, speed = 3.0f, damage = 28, radius = 0.55f, xp = 50, atkRange = 2.4f, atkTime = 1.0f, ghost = true, posture = 1000, phases = new[] { 0.5f }, skin = 0x3a3840, robe = 0x121216, trim = 0xf0e8d8 });
            E(new EnemyDef { id = "soldier", look = "soldier", name = "阴兵", title = "阴兵借道", ai = AI.Soldier, hp = 150, speed = 2.5f, damage = 18, radius = 0.5f, xp = 5, atkRange = 2.7f, atkTime = 1.15f, fireMult = 1.1f, ghost = true, shieldArc = 1.25f, shieldMult = 0.15f, skin = 0x6a7a8a, robe = 0x2a3038, trim = 0xc8a040 });
            E(new EnemyDef { id = "sorcerer", look = "sorcerer", name = "玄阴子", title = "逆天邪道", ai = AI.Sorcerer, boss = true, hp = 11000, speed = 3.4f, damage = 30, radius = 0.55f, xp = 300, atkRange = 2.9f, atkTime = 1.0f, fireMult = 0.9f, floatY = 0.3f, posture = 1800, phases = new[] { 0.55f, 0.2f }, skin = 0xd4d0cc, robe = 0x141018, trim = 0xa040ff });
            E(new EnemyDef { id = "hou", look = "hou", name = "犼", title = "僵尸之王", ai = AI.Hou, boss = true, scale = 1.5f, hp = 7000, speed = 3.4f, damage = 36, radius = 0.85f, xp = 200, atkRange = 3.0f, atkTime = 1.1f, bulletMult = 0.8f, jiangshi = true, posture = 2200, phases = new[] { 0.6f, 0.3f }, skin = 0x8a2a1a, robe = 0x2a0c08, trim = 0xff8030 });

            // ---------------- 章节
            Chapters.Add(new ChapterDef
            {
                name = "义庄 · 尸变", en = "CHAPTER I", objective = "守住义庄", poem = "夜半棺声如叩门，一灯如豆守孤魂。",
                story = "入夜，乱葬岗的新坟接连塌陷，义庄的棺材板“咚、咚”作响。\n师父云游未归，只留下一沓符纸、一把驳壳枪。\n守住义庄——杀得越多，阳气越盛，道行越深。",
                waves = new[] {
                    W(35, 1.1f, 22, ("normal", 8), ("imp", 3)), W(40, 1.35f, 28, ("normal", 6), ("purple", 4), ("imp", 4)),
                    W(45, 1.6f, 34, ("normal", 4), ("purple", 6), ("imp", 5), ("white", 1)), W(45, 1.9f, 38, ("purple", 6), ("white", 3), ("imp", 6)) },
                boss = new[] { "drought" }, bossName = "旱魃 · 赤地千里", escort = new[] { ("purple", 4) },
                amb = new Ambience { skyTop = C(0x04060c), skyHorizon = C(0x1a2436), moonColor = C(0xf4ecd8), moonLight = C(0xbfd0ff), moonIntensity = 1.35f, moonSize = 0.045f, fog = C(0x0e1420), fogDensity = 0.016f, hemiSky = C(0x8aa0c8), hemiGround = C(0x2a2418), hemi = 0.45f, cloud = C(0x283040), ghostFire = C(0x9fd8ff) },
            });
            Chapters.Add(new ChapterDef
            {
                name = "荒村 · 纸扎", en = "CHAPTER II", objective = "焚尽纸人，护住阿秀", poem = "雨打纸人胭脂冷，井底犹闻唤娘声。",
                story = "邻村七日无人出入。推门一看，满屋纸扎人齐齐转过头来。\n竹林里阴风阵阵，红衣女子立在井边，一动不动。\n更远处，锁链声响——勾魂的黑白无常，亲自来了。",
                waves = new[] {
                    W(40, 1.6f, 32, ("paper", 6), ("purple", 4), ("imp", 4)), W(45, 1.9f, 38, ("paper", 5), ("white", 3), ("ghost", 2), ("imp", 5)),
                    W(45, 2.2f, 42, ("green", 4), ("paper", 4), ("ghost", 3), ("imp", 6)), W(50, 2.5f, 46, ("green", 5), ("white", 3), ("ghost", 3), ("paper", 4), ("imp", 5)) },
                boss = new[] { "wuWhite", "wuBlack" }, bossName = "黑白无常 · 勾魂使者", escort = new[] { ("paper", 5) },
                amb = new Ambience { skyTop = C(0x040a08), skyHorizon = C(0x14261c), moonColor = C(0xd8f0d0), moonLight = C(0xa8e0b8), moonIntensity = 1.1f, moonSize = 0.04f, fog = C(0x0c1a14), fogDensity = 0.022f, hemiSky = C(0x88b098), hemiGround = C(0x1a2418), hemi = 0.42f, cloud = C(0x1e3028), ghostFire = C(0x9fffc8), rain = true },
            });
            Chapters.Add(new ChapterDef
            {
                name = "阴司 · 鬼门", en = "CHAPTER III", objective = "闯过鬼门", poem = "血月当空鬼门开，千年尸骨化犼来。",
                story = "七月十五，鬼门大开。血月当空，地缝里渗出岩浆般的红光。\n毛僵、飞僵倾巢而出，小鬼漫山遍野。\n千年古尸褪尽腐肉，化而为犼——道长，成败在此一举。",
                waves = new[] {
                    W(45, 2.2f, 44, ("green", 4), ("hairy", 2), ("imp", 8), ("ghost", 2)), W(50, 2.5f, 50, ("hairy", 3), ("flying", 3), ("imp", 8), ("paper", 3)),
                    W(50, 2.8f, 54, ("hairy", 4), ("flying", 4), ("ghost", 3), ("soldier", 2), ("imp", 8)), W(55, 3.1f, 58, ("hairy", 4), ("flying", 5), ("green", 3), ("ghost", 3), ("soldier", 3), ("imp", 9)) },
                boss = new[] { "hou" }, bossName = "犼 · 僵尸之王", escort = new[] { ("hairy", 2), ("flying", 2) },
                amb = new Ambience { skyTop = C(0x0a0204), skyHorizon = C(0x3a0c08), moonColor = C(0xff5a3a), moonLight = C(0xff7a5c), moonIntensity = 1.2f, moonSize = 0.075f, fog = C(0x1c0806), fogDensity = 0.019f, hemiSky = C(0xc08070), hemiGround = C(0x2a0e08), hemi = 0.42f, cloud = C(0x3a1410), ghostFire = C(0xff8a50), embers = true, gate = true },
            });
            Chapters.Add(new ChapterDef
            {
                name = "鬼门 · 逆天", en = "CHAPTER IV", objective = "击败玄阴子，救出师父", poem = "一念长生一念魔，锁魂链上照山河。",
                story = "犼王伏诛，鬼门却未闭合。\n门后阴兵列阵，锁魂链的那一头，吊着师父的魂魄。\n玄阴子立在门前，等你很久了。",
                waves = new[] {
                    W(40, 2.4f, 46, ("soldier", 5), ("hairy", 3), ("flying", 3), ("ghost", 3), ("imp", 6)),
                    W(45, 2.8f, 52, ("soldier", 6), ("hairy", 4), ("flying", 4), ("ghost", 3), ("paper", 3), ("imp", 6)) },
                boss = new[] { "sorcerer" }, bossName = "玄阴子 · 逆天邪道", escort = new[] { ("soldier", 4) }, bossAt = new Vector2(0, 12),
                amb = new Ambience { skyTop = C(0x08030e), skyHorizon = C(0x2a0a30), moonColor = C(0xff5a8a), moonLight = C(0xc08aff), moonIntensity = 1.05f, moonSize = 0.07f, fog = C(0x150818), fogDensity = 0.02f, hemiSky = C(0xa080c0), hemiGround = C(0x200a20), hemi = 0.4f, cloud = C(0x2a0c34), ghostFire = C(0xc080ff), embers = true, gate = true, eclipse = 1 },
            });
            Dawn = new Ambience { skyTop = C(0x2a4a7a), skyHorizon = C(0xd8906a), moonColor = C(0xfff0d0), moonLight = C(0xffd8b0), moonIntensity = 1.6f, moonSize = 0.03f, fog = C(0x8a7a80), fogDensity = 0.012f, hemiSky = C(0xc8d8ff), hemiGround = C(0x5a4a3a), hemi = 0.8f, cloud = C(0xd8a080), ghostFire = C(0xffe0a0) };
            EndlessWave = W(50, 3.2f, 64, ("hairy", 4), ("flying", 4), ("green", 3), ("ghost", 3), ("imp", 9), ("paper", 3), ("white", 2), ("soldier", 3));

            // ---------------- 难度
            Diffs["easy"] = new DiffDef { id = "easy", name = "入道", tag = "剧情", desc = "邪祟孱弱，适合初涉此道、专注故事的道友。", hp = 0.7f, dmg = 0.55f, spawn = 0.8f, elite = 0.6f, aggro = 0.85f, tele = 1.3f, reward = 0.6f, heal = 1.5f, bossHp = 0.7f };
            Diffs["normal"] = new DiffDef { id = "normal", name = "修行", tag = "标准", desc = "设计者心中的本来面目：步步惊心，却有路可走。", hp = 1, dmg = 1, spawn = 1, elite = 1, aggro = 1, tele = 1, reward = 1, heal = 1, bossHp = 1 };
            Diffs["hard"] = new DiffDef { id = "hard", name = "伏魔", tag = "困难", desc = "尸潮更密、出手更狠、预兆更短。", hp = 1.3f, dmg = 1.35f, spawn = 1.15f, elite = 1.6f, aggro = 1.15f, tele = 0.85f, reward = 1.5f, heal = 0.8f, bossHp = 1.3f };
            Diffs["hell"] = new DiffDef { id = "hell", name = "天劫", tag = "噩梦", desc = "天降大劫，九死一生。回春葫芦不再掉落。通关伏魔后开启。", hp = 1.65f, dmg = 1.75f, spawn = 1.3f, elite = 2.3f, aggro = 1.3f, tele = 0.72f, reward = 2.3f, heal = 0, bossHp = 1.65f, unlock = "hard" };

            // ---------------- 兵器
            Weapons["mauser"] = new WeaponDef { id = "mauser", name = "驳壳枪", interval = 0.17f, damage = 34, headMult = 2.4f, mag = 20, reload = 1.4f, spread = 0.007f, range = 120, sound = "pistol", knock = 0.15f, flash = 0.9f };
            Weapons["thompson"] = new WeaponDef { id = "thompson", name = "汤姆逊", auto = true, interval = 0.075f, damage = 17, headMult = 2.2f, mag = 50, reload = 2.1f, spread = 0.024f, range = 110, sound = "smg", knock = 0.08f, flash = 1.0f };
            Weapons["ak47"] = new WeaponDef { id = "ak47", name = "AK-47", auto = true, interval = 0.1f, damage = 29, headMult = 2.4f, mag = 30, reload = 1.9f, spread = 0.015f, range = 140, sound = "ak", knock = 0.14f, flash = 1.4f };
            Weapons["shotgun"] = new WeaponDef { id = "shotgun", name = "双管猎枪", interval = 0.3f, damage = 13, pellets = 9, headMult = 1.6f, mag = 2, reload = 1.5f, spread = 0.06f, range = 40, sound = "shotgun", knock = 0.95f, flash = 2.0f };
            Weapons["gatling"] = new WeaponDef { id = "gatling", name = "加特林", auto = true, interval = 0.045f, damage = 12, headMult = 2, mag = 200, reload = 3.4f, spread = 0.04f, range = 110, sound = "gatling", knock = 0.05f, flash = 1.3f, spinUp = 0.55f, moveSlow = 0.62f };
            Weapons["sword"] = new WeaponDef { id = "sword", name = "桃木剑", melee = true, interval = 0.42f, damage = 70, headMult = 1, mag = 0, range = 3.0f, arc = 1.35f, sound = "knife", knock = 0.9f };

            // ---------------- 局外修行
            Upgrades.Add(new UpgradeDef { id = "hp", name = "铜皮铁骨", desc = "初始生命 +15", max = 5, baseCost = 120, growth = 1.6f });
            Upgrades.Add(new UpgradeDef { id = "spd", name = "轻功提纵", desc = "移动速度 +5%", max = 5, baseCost = 120, growth = 1.6f });
            Upgrades.Add(new UpgradeDef { id = "dmg", name = "百步穿杨", desc = "枪械伤害 +7%", max = 5, baseCost = 160, growth = 1.6f });
            Upgrades.Add(new UpgradeDef { id = "fu", name = "敕令真火", desc = "火符伤害 +25 · 冷却 -0.6s", max = 5, baseCost = 150, growth = 1.6f });
            Upgrades.Add(new UpgradeDef { id = "xp", name = "悟性通达", desc = "阳气经验 +8%", max = 5, baseCost = 140, growth = 1.6f });
            Upgrades.Add(new UpgradeDef { id = "luck", name = "福缘深厚", desc = "每局重掷 +1", max = 3, baseCost = 300, growth = 2.0f });
            Upgrades.Add(new UpgradeDef { id = "breath", name = "龟息功", desc = "闭气时长 +0.8 秒", max = 3, baseCost = 180, growth = 1.7f });
            Upgrades.Add(new UpgradeDef { id = "dash", name = "踏罡步斗", desc = "罡步冷却 -0.2 秒", max = 3, baseCost = 200, growth = 1.7f });
        }

        static WaveDef W(float dur, float rate, int max, params (string, int)[] pool) => new WaveDef { dur = dur, rate = rate, max = max, pool = pool };

        public static int UpgradeCost(UpgradeDef u, int level) => Mathf.RoundToInt(u.baseCost * Mathf.Pow(u.growth, level));
        public static int XpNeed(int lv) => Mathf.RoundToInt(5 + lv * 3.5f + Mathf.Pow(lv, 1.6f) * 1.2f);
    }
}
