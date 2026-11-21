using System;
using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>战役导演：章节 → 限时波次 → 首领 → 过关；通关后无尽轮回。按玩家压力调节刷怪节奏。</summary>
    public class Director
    {
        readonly Enemies enemies; readonly World world;
        public DiffDef mode = Data.Diffs["normal"];
        public int chapter, wave, endlessN;
        public string phase = "idle";          // idle / wave / boss / cleared
        public float waveT, acc, stress, intensity = 0.3f, tempoT;
        public bool endless;
        string tempo = "build";
        float hordeAt; bool hordeDone, hasHorde;
        public readonly List<Enemy> bossList = new List<Enemy>();
        public Action<int, int, int> onWaveStart;
        public Action<int, List<Enemy>, string> onBossStart;
        public Action<int> onChapterClear;
        public Action<string, Vector3> onHorde;
        const float H = Data.ArenaHalf;

        public Director(Enemies e, World w) { enemies = e; world = w; }

        public void Reset()
        {
            chapter = 0; wave = 0; phase = "idle"; waveT = 0; acc = 0; endless = false; endlessN = 0; bossList.Clear(); stress = 0; tempo = "build"; tempoT = 0; intensity = 0.3f;
        }

        public ChapterDef ChapterDef => Data.Chapters[Mathf.Min(chapter, Data.Chapters.Count - 1)];
        public WaveDef WaveDef => endless ? Data.EndlessWave : ChapterDef.waves[Mathf.Min(wave, ChapterDef.waves.Length - 1)];
        public int TotalWaves => ChapterDef.waves.Length;

        public void StartChapter(int idx) { chapter = idx; wave = 0; StartWave(); }
        public void StartEndless() { endless = true; endlessN = 0; chapter = Data.Chapters.Count - 1; wave = 0; StartWave(); }
        public void PlayerHurt(float frac) { stress = Mathf.Min(1.5f, stress + frac * 2.2f); }

        void ApplyDifficulty()
        {
            float[] baseHp = { 1f, 1.9f, 3.1f, 4.0f };
            int w = endless ? endlessN : wave;
            float end = endless ? Mathf.Pow(1.16f, endlessN) * 1.25f : 1f;
            enemies.diff = new Difficulty
            {
                hp = baseHp[Mathf.Min(chapter, 3)] * (1 + w * 0.1f) * end * mode.hp,
                dmg = (1 + chapter * 0.32f + w * 0.05f) * (endless ? 1 + endlessN * 0.06f : 1) * mode.dmg,
                speed = 1 + Mathf.Min(0.25f, chapter * 0.05f + (endless ? endlessN * 0.02f : 0)),
                bossHp = (endless ? 1.3f * Mathf.Pow(1.12f, endlessN) : 1) * mode.bossHp,
                aggro = mode.aggro * (1 + chapter * 0.04f),
                tele = mode.tele,
            };
        }

        void StartWave()
        {
            phase = "wave"; waveT = 0; acc = 2;
            ApplyDifficulty();
            hasHorde = wave >= 1 || endless;
            hordeAt = WaveDef.dur * (0.35f + UnityEngine.Random.value * 0.3f); hordeDone = false;
            onWaveStart?.Invoke(chapter, wave, TotalWaves);
        }

        void StartBoss(Vector3 ppos)
        {
            phase = "boss";
            var def = ChapterDef;
            string[] types = def.boss;
            if (endless)
            {
                string[][] opts = { new[] { "drought" }, new[] { "wuWhite", "wuBlack" }, new[] { "hou" }, new[] { "sorcerer" } };
                types = opts[Mathf.Abs(endlessN / 3 - 1) % opts.Length];
            }
            ApplyDifficulty();
            Vector3 gate = def.bossAt.HasValue && !endless ? new Vector3(def.bossAt.Value.x, 0, def.bossAt.Value.y) : new Vector3(0, 0, -(H - 7));
            bossList.Clear();
            for (int i = 0; i < types.Length; i++)
                bossList.Add(enemies.Spawn(types[i], gate + new Vector3((i - (types.Length - 1) / 2f) * 5f, 0, 0), false, endless ? 1 + endlessN * 0.15f : 1));
            if (def.escort != null) foreach (var (t, n) in def.escort) for (int k = 0; k < n; k++) SpawnOne(t, ppos);
            onBossStart?.Invoke(chapter, bossList, def.bossName);
        }

        public Vector3 PickSpawn(Vector3 ppos, int side = -1)
        {
            for (int tries = 0; tries < 14; tries++)
            {
                Vector3 p;
                if (side < 0 && UnityEngine.Random.value < 0.55f) p = world.spawnPoints[UnityEngine.Random.Range(0, world.spawnPoints.Count)];
                else
                {
                    int sd = side >= 0 ? side : UnityEngine.Random.Range(0, 4);
                    float along = (UnityEngine.Random.value - 0.5f) * (H * 2 - 8), e = H - 3;
                    p = sd == 0 ? new Vector3(along, 0, e) : sd == 1 ? new Vector3(along, 0, -e) : sd == 2 ? new Vector3(-e, 0, along) : new Vector3(e, 0, along);
                }
                p.x += (UnityEngine.Random.value - 0.5f) * 2.5f; p.z += (UnityEngine.Random.value - 0.5f) * 2.5f;
                float dx = p.x - ppos.x, dz = p.z - ppos.z;
                if (dx * dx + dz * dz < 13 * 13) continue;
                if (world.Blocked(p, 0.4f)) continue;
                return p;
            }
            return new Vector3(ppos.x > 0 ? -20 : 20, 0, ppos.z > 0 ? -20 : 20);
        }

        public Enemy SpawnOne(string type, Vector3 ppos, Vector3? at = null, int side = -1, bool elite = false)
        {
            return enemies.Spawn(type, at ?? PickSpawn(ppos, side), elite);
        }

        string PickType((string, int)[] pool)
        {
            int tot = 0; foreach (var (_, w) in pool) tot += w;
            float r = UnityEngine.Random.value * tot;
            foreach (var (t, w) in pool) { r -= w; if (r <= 0) return t; }
            return pool[0].Item1;
        }

        float Tempo(float dt, Vector3 ppos, float hpFrac)
        {
            float near = 0;
            foreach (var e in enemies.list)
            {
                if (!e.alive || e.dying) continue;
                float dx = e.pos.x - ppos.x, dz = e.pos.z - ppos.z;
                if (dx * dx + dz * dz < 64) near += e.boss ? 3 : e.elite ? 2 : 1;
            }
            float target = Mathf.Min(1.2f, near / 14f + (1 - hpFrac) * 0.5f);
            stress += (target - stress) * Mathf.Min(1, dt * 0.6f);
            stress = Mathf.Max(0, stress - dt * 0.03f);
            tempoT += dt;
            if (tempo == "build" && (stress > 0.85f || tempoT > 26)) { tempo = "peak"; tempoT = 0; }
            else if (tempo == "peak" && tempoT > 8.5f) { tempo = "relax"; tempoT = 0; }
            else if (tempo == "relax" && tempoT > 5.5f && stress < 0.55f) { tempo = "build"; tempoT = 0; }
            float want = phase == "boss" ? 0.85f + stress * 0.15f : Mathf.Min(1, 0.25f + near / 18f + stress * 0.45f + (tempo == "peak" ? 0.15f : 0));
            intensity += (want - intensity) * Mathf.Min(1, dt * 0.8f);
            return tempo == "relax" ? 0.35f : tempo == "peak" ? 1.25f : 1f;
        }

        public void Update(float dt, Vector3 ppos, float hpFrac)
        {
            if (phase == "idle" || phase == "cleared") return;
            float tempoK = Tempo(dt, ppos, hpFrac);
            if (phase == "wave")
            {
                var w = WaveDef;
                waveT += dt;
                float rateK = 1 + waveT / w.dur * 0.35f;
                acc += w.rate * rateK * dt * (endless ? 1 + endlessN * 0.08f : 1) * mode.spawn * tempoK;
                int maxAlive = Mathf.RoundToInt((endless ? w.max + endlessN * 3 : w.max) * Mathf.Min(1.25f, mode.spawn));
                while (acc >= 1 && enemies.aliveCount < maxAlive)
                {
                    acc -= 1;
                    string type = PickType(w.pool);
                    float eliteChance = (chapter == 0 && wave < 2 && !endless ? 0 : 0.025f + wave * 0.01f + chapter * 0.01f) * mode.elite;
                    if (type == "imp" && UnityEngine.Random.value < 0.35f)
                    {
                        var at = PickSpawn(ppos);
                        for (int k = 0; k < 4; k++) SpawnOne("imp", ppos, at + new Vector3(UnityEngine.Random.value - 0.5f, 0, UnityEngine.Random.value - 0.5f) * 3f);
                    }
                    else if (type == "soldier" && UnityEngine.Random.value < 0.5f)
                    {
                        var at = PickSpawn(ppos);
                        var side = new Vector3(-(at.z - ppos.z), 0, at.x - ppos.x).normalized;
                        for (int k = -1; k <= 1; k++) SpawnOne("soldier", ppos, at + side * (k * 1.3f));
                    }
                    else SpawnOne(type, ppos, null, -1, UnityEngine.Random.value < eliteChance);
                    enemies.aliveCount++;
                }
                if (acc > 3) acc = 3;
                if (hasHorde && !hordeDone && waveT >= hordeAt)
                {
                    hordeDone = true;
                    int side = UnityEngine.Random.Range(0, 4);
                    string[] names = { "北", "南", "西", "东" };
                    float e = H - 3;
                    Vector3[] dirPos = { new Vector3(0, 0, e), new Vector3(0, 0, -e), new Vector3(-e, 0, 0), new Vector3(e, 0, 0) };
                    onHorde?.Invoke(names[side], dirPos[side]);
                    int n = Mathf.RoundToInt((10 + chapter * 3 + (endless ? endlessN : 0)) * Mathf.Min(1.3f, mode.spawn));
                    for (int k = 0; k < n; k++)
                    {
                        int kk = k;
                        enemies.Later(2.5f + k * 0.12f, () => SpawnOne(PickType(w.pool), enemies.playerPos, null, side, kk == 0 && chapter > 0));
                    }
                }
                if (waveT >= w.dur)
                {
                    if (endless) { endlessN++; if (endlessN % 3 == 0) StartBoss(ppos); else StartWave(); }
                    else if (wave + 1 < ChapterDef.waves.Length) { wave++; StartWave(); }
                    else StartBoss(ppos);
                }
            }
            else if (phase == "boss")
            {
                var w = endless ? Data.EndlessWave : ChapterDef.waves[ChapterDef.waves.Length - 1];
                acc += w.rate * 0.3f * dt * mode.spawn * tempoK;
                while (acc >= 1 && enemies.aliveCount < w.max * 0.45f) { acc -= 1; SpawnOne(PickType(w.pool), ppos); enemies.aliveCount++; }
                bool allDead = true;
                foreach (var b in bossList) if (b.alive && !b.dying) { allDead = false; break; }
                if (allDead)
                {
                    if (endless) { endlessN++; StartWave(); }
                    else { phase = "cleared"; onChapterClear?.Invoke(chapter); }
                }
            }
        }
    }

    /// <summary>存档：阳气、局外修行、通关记录。</summary>
    public class Save
    {
        public int yangqi, bestKills, bestChapter, bestCombo;
        readonly Dictionary<string, int> up = new Dictionary<string, int>();
        readonly HashSet<string> cleared = new HashSet<string>();
        public string lastDiff = "normal";

        public Save()
        {
            yangqi = PlayerPrefs.GetInt("yangqi", 0);
            bestKills = PlayerPrefs.GetInt("bestKills", 0); bestChapter = PlayerPrefs.GetInt("bestChapter", 0); bestCombo = PlayerPrefs.GetInt("bestCombo", 0);
            lastDiff = PlayerPrefs.GetString("lastDiff", "normal");
            foreach (var u in Data.Upgrades) up[u.id] = PlayerPrefs.GetInt("up_" + u.id, 0);
            foreach (var d in Data.DiffOrder) if (PlayerPrefs.GetInt("clr_" + d, 0) == 1) cleared.Add(d);
        }

        public int Up(string id) => up.TryGetValue(id, out int v) ? v : 0;
        public bool Cleared(string diff) => cleared.Contains(diff);
        public void MarkCleared(string diff) { cleared.Add(diff); Flush(); }

        public bool Buy(UpgradeDef u)
        {
            int lv = Up(u.id);
            if (lv >= u.max) return false;
            int cost = Data.UpgradeCost(u, lv);
            if (yangqi < cost) return false;
            yangqi -= cost; up[u.id] = lv + 1;
            Flush();
            return true;
        }

        public void Flush()
        {
            PlayerPrefs.SetInt("yangqi", yangqi);
            PlayerPrefs.SetInt("bestKills", bestKills); PlayerPrefs.SetInt("bestChapter", bestChapter); PlayerPrefs.SetInt("bestCombo", bestCombo);
            PlayerPrefs.SetString("lastDiff", lastDiff);
            foreach (var kv in up) PlayerPrefs.SetInt("up_" + kv.Key, kv.Value);
            foreach (var d in cleared) PlayerPrefs.SetInt("clr_" + d, 1);
            PlayerPrefs.Save();
        }
    }
}
