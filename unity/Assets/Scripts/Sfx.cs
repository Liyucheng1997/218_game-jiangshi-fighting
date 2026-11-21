using System;
using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>音效与配乐：全部程序合成（不带任何音频文件）。</summary>
    public class Sfx : MonoBehaviour
    {
        const int SR = 22050;
        readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        readonly List<AudioSource> pool = new List<AudioSource>();
        AudioSource music, amb;
        int next;
        System.Random rnd = new System.Random(5);
        float lp;
        public float sfxVol = 0.8f, musicVol = 0.45f;
        string musicName;

        public static Sfx Create(Transform head)
        {
            var go = new GameObject("Sfx");
            go.transform.SetParent(head, false);
            var s = go.AddComponent<Sfx>();
            for (int i = 0; i < 14; i++)
            {
                var src = new GameObject("src" + i).AddComponent<AudioSource>();
                src.transform.SetParent(go.transform, false);
                src.playOnAwake = false; src.rolloffMode = AudioRolloffMode.Linear; src.minDistance = 2; src.maxDistance = 45; src.dopplerLevel = 0;
                s.pool.Add(src);
            }
            s.music = go.AddComponent<AudioSource>(); s.music.loop = true; s.music.spatialBlend = 0; s.music.playOnAwake = false;
            s.amb = go.AddComponent<AudioSource>(); s.amb.loop = true; s.amb.spatialBlend = 0; s.amb.playOnAwake = false;
            s.Build();
            return s;
        }

        float Noise() => (float)(rnd.NextDouble() * 2 - 1);
        float LP(float x, float k) { lp += (x - lp) * k; return lp; }

        void Make(string name, float dur, Func<float, float, float> f, float gain = 1f)
        {
            int n = Mathf.CeilToInt(dur * SR);
            var data = new float[n];
            lp = 0;
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)SR;
                data[i] = Mathf.Clamp(f(t, t / dur) * gain, -1f, 1f);
            }
            // 首尾淡入淡出，避免爆音
            int fade = Mathf.Min(64, n / 4);
            for (int i = 0; i < fade; i++) { data[i] *= i / (float)fade; data[n - 1 - i] *= i / (float)fade; }
            var c = AudioClip.Create(name, n, 1, SR, false);
            c.SetData(data, 0);
            clips[name] = c;
        }

        static float Sin(float f, float t) => Mathf.Sin(6.2831853f * f * t);
        static float Env(float k, float p = 2f) => Mathf.Pow(1f - Mathf.Clamp01(k), p);

        void Build()
        {
            // 枪
            Make("pistol", 0.28f, (t, k) => (LP(Noise(), 0.55f) * Env(k, 3f) + Sin(150 - 90 * k, t) * Env(k, 4f) * 0.8f), 0.9f);
            Make("smg", 0.2f, (t, k) => (LP(Noise(), 0.7f) * Env(k, 3f) + Sin(190 - 100 * k, t) * Env(k, 5f) * 0.6f), 0.75f);
            Make("ak", 0.3f, (t, k) => (LP(Noise(), 0.45f) * Env(k, 2.6f) + Sin(110 - 60 * k, t) * Env(k, 3f)), 0.95f);
            Make("shotgun", 0.55f, (t, k) => (LP(Noise(), 0.3f) * Env(k, 2.2f) * 1.3f + Sin(70 - 30 * k, t) * Env(k, 2.5f)), 1f);
            Make("gatling", 0.14f, (t, k) => (LP(Noise(), 0.6f) * Env(k, 3f) + Sin(130, t) * Env(k, 4f) * 0.6f), 0.7f);
            Make("knife", 0.22f, (t, k) => LP(Noise(), 0.25f + k * 0.5f) * Mathf.Sin(k * Mathf.PI) * 0.8f);
            Make("dry", 0.06f, (t, k) => Noise() * Env(k, 6f) * 0.5f + Sin(2400, t) * Env(k, 8f) * 0.3f);
            Make("reload", 0.3f, (t, k) => (k < 0.2f ? Noise() * Env(k * 5, 4f) : k > 0.6f && k < 0.75f ? Noise() * 0.8f : 0) * 0.5f + Sin(900, t) * (k > 0.6f && k < 0.7f ? 0.3f : 0));
            Make("reloadDone", 0.1f, (t, k) => Noise() * Env(k, 5f) * 0.5f + Sin(1400 - 600 * k, t) * Env(k, 4f) * 0.4f);
            Make("switch", 0.12f, (t, k) => LP(Noise(), 0.4f) * Env(k, 3f) * 0.5f);
            // 命中 / 击杀
            Make("hit", 0.09f, (t, k) => LP(Noise(), 0.35f) * Env(k, 3f) + Sin(220 - 120 * k, t) * Env(k, 3f) * 0.6f, 0.6f);
            Make("head", 0.12f, (t, k) => Sin(1500, t) * Env(k, 3f) * 0.5f + Sin(2250, t) * Env(k, 4f) * 0.3f);
            Make("kill", 0.2f, (t, k) => Sin(520 + 500 * k, t) * Env(k, 2f) * 0.4f + LP(Noise(), 0.2f) * Env(k, 4f) * 0.4f);
            Make("hurt", 0.3f, (t, k) => Sin(140 - 60 * k, t) * Env(k, 2f) * 0.8f + LP(Noise(), 0.15f) * Env(k, 3f) * 0.6f);
            // 邪祟
            Make("hop", 0.14f, (t, k) => Sin(75 - 30 * k, t) * Env(k, 2.5f) + LP(Noise(), 0.1f) * Env(k, 4f) * 0.6f, 0.8f);
            Make("groan", 0.9f, (t, k) => (Sin(88 + Sin(5, t) * 8, t) * 0.6f + Sin(176 + Sin(7, t) * 10, t) * 0.25f + LP(Noise(), 0.08f) * 0.5f) * Mathf.Sin(k * Mathf.PI) * 0.7f);
            Make("ghostfire", 0.5f, (t, k) => Sin(600 + 400 * Mathf.Sin(k * 6f), t) * Env(k, 2f) * 0.35f + LP(Noise(), 0.3f) * Env(k, 2f) * 0.3f);
            Make("chain", 0.45f, (t, k) => (Sin(1800 + Noise() * 400, t) * 0.3f + Noise() * 0.25f) * Env(k, 1.6f) * (0.5f + 0.5f * Mathf.Abs(Sin(22, t))));
            Make("dash", 0.4f, (t, k) => LP(Noise(), 0.1f + k * 0.4f) * Mathf.Sin(k * Mathf.PI));
            Make("roar", 1.4f, (t, k) => (Sin(55 + Sin(9, t) * 12, t) + Sin(110 + Sin(13, t) * 20, t) * 0.5f + LP(Noise(), 0.12f) * 0.9f) * Mathf.Sin(k * Mathf.PI) * 0.8f);
            // 道术
            Make("fu", 0.35f, (t, k) => LP(Noise(), 0.2f + k * 0.3f) * Mathf.Sin(k * Mathf.PI) * 0.7f + Sin(300 + 500 * k, t) * Env(k, 2f) * 0.2f);
            Make("fire", 0.7f, (t, k) => LP(Noise(), 0.18f) * Env(k, 1.5f) * 0.9f);
            Make("boom", 0.9f, (t, k) => LP(Noise(), 0.12f) * Env(k, 2f) * 1.4f + Sin(60 - 30 * k, t) * Env(k, 2f));
            Make("thunder", 1.6f, (t, k) => (LP(Noise(), 0.5f - k * 0.42f) * Env(k, 1.6f) * 1.3f + Sin(48, t) * Env(k, 2f) * 0.7f) * (k < 0.03f ? k / 0.03f : 1));
            Make("gong", 2.2f, (t, k) => (Sin(196, t) + Sin(196 * 2.01f, t) * 0.5f + Sin(196 * 2.76f, t) * 0.35f + Sin(196 * 5.4f, t) * 0.15f) * Env(k, 2.4f) * 0.45f);
            Make("bell", 1.2f, (t, k) => (Sin(1320, t) + Sin(1320 * 2.7f, t) * 0.4f + Sin(1320 * 5.2f, t) * 0.2f) * Env(k, 3f) * 0.35f);
            Make("coin", 0.25f, (t, k) => (Sin(2600, t) + Sin(3900, t) * 0.5f) * Env(k, 3f) * 0.3f);
            Make("breath", 0.6f, (t, k) => LP(Noise(), 0.06f) * Mathf.Sin(k * Mathf.PI) * 0.9f);
            // 界面 / 拾取
            Make("click", 0.07f, (t, k) => Sin(880, t) * Env(k, 3f) * 0.4f);
            Make("hover", 0.04f, (t, k) => Sin(1320, t) * Env(k, 3f) * 0.18f);
            Make("pickup", 0.1f, (t, k) => Sin(900 + 700 * k, t) * Env(k, 2f) * 0.25f);
            Make("levelup", 0.9f, (t, k) => { float f = k < 0.25f ? 523 : k < 0.5f ? 659 : k < 0.75f ? 784 : 1047; return (Sin(f, t) + Sin(f * 2, t) * 0.3f) * Env((k * 4f) % 1f, 1.2f) * 0.35f; });
            Make("heal", 0.5f, (t, k) => Sin(440 + 440 * k, t) * Mathf.Sin(k * Mathf.PI) * 0.3f);
            Make("horn", 1.8f, (t, k) => (Sin(110, t) + Sin(165, t) * 0.6f + Sin(220, t) * 0.4f + LP(Noise(), 0.05f) * 0.3f) * Mathf.Sin(k * Mathf.PI) * 0.4f);
            Make("step", 0.08f, (t, k) => LP(Noise(), 0.12f) * Env(k, 3f) * 0.7f);
            // 环境与配乐（循环）
            Make("amb", 8f, (t, k) => LP(Noise(), 0.012f) * 1.8f * (0.6f + 0.4f * Sin(0.25f, t)) + Sin(52, t) * 0.05f, 0.6f);
            MakeMusic("calm", 16f, new[] { 0, 3, 5, 7, 10 }, 110f, 0.5f, false);
            MakeMusic("battle", 12.8f, new[] { 0, 3, 5, 7, 10 }, 146.8f, 0.2f, true);
        }

        // 五声音阶拨弦 + 低音持续音；战斗曲加鼓点
        void MakeMusic(string name, float dur, int[] scale, float root, float noteLen, bool drums)
        {
            int n = Mathf.CeilToInt(dur * SR);
            var data = new float[n];
            var r = new System.Random(name.GetHashCode());
            int steps = Mathf.RoundToInt(dur / noteLen);
            for (int s = 0; s < steps; s++)
            {
                if (r.NextDouble() < (drums ? 0.35 : 0.55)) continue;
                int deg = scale[r.Next(scale.Length)] + 12 * r.Next(0, 2);
                float f = root * 2f * Mathf.Pow(2f, deg / 12f);
                int start = Mathf.RoundToInt(s * noteLen * SR), len = Mathf.RoundToInt((drums ? 0.5f : 1.8f) * SR);
                for (int i = 0; i < len; i++)
                {
                    float t = i / (float)SR, e = Mathf.Exp(-t * (drums ? 6f : 2.2f));
                    data[(start + i) % n] += (Mathf.Sin(6.2831853f * f * t) + Mathf.Sin(6.2831853f * f * 2 * t) * 0.3f * e) * e * 0.13f;
                }
            }
            for (int i = 0; i < n; i++)
            {
                float t = i / (float)SR;
                data[i] += (Mathf.Sin(6.2831853f * root * 0.5f * t) * 0.09f + Mathf.Sin(6.2831853f * root * 0.75f * t) * 0.04f) * (0.7f + 0.3f * Mathf.Sin(6.2831853f * t / dur * 2f));
                if (drums)
                {
                    float beat = (t % 0.4f) / 0.4f, b2 = ((t + 0.2f) % 0.8f) / 0.8f;
                    data[i] += Mathf.Sin(6.2831853f * (70 - 40 * beat) * (t % 0.4f)) * Mathf.Pow(1 - beat, 6f) * 0.3f;
                    data[i] += (float)(r.NextDouble() * 2 - 1) * Mathf.Pow(1 - b2, 14f) * 0.1f;
                }
                data[i] = Mathf.Clamp(data[i], -1f, 1f);
            }
            var c = AudioClip.Create(name, n, 1, SR, false);
            c.SetData(data, 0);
            clips[name] = c;
        }

        public void Play(string name, float vol = 1f, float pitch = 1f, Vector3? at = null)
        {
            if (!clips.TryGetValue(name, out var c)) return;
            var src = pool[next]; next = (next + 1) % pool.Count;
            src.Stop();
            src.clip = c; src.volume = vol * sfxVol; src.pitch = pitch;
            if (at.HasValue) { src.spatialBlend = 1f; src.transform.position = at.Value; }
            else { src.spatialBlend = 0f; src.transform.localPosition = Vector3.zero; }
            src.Play();
        }

        public void Music(string name)
        {
            if (musicName == name) return;
            musicName = name;
            if (name == null || !clips.ContainsKey(name)) { music.Stop(); return; }
            music.clip = clips[name]; music.volume = musicVol; music.Play();
            if (!amb.isPlaying) { amb.clip = clips["amb"]; amb.volume = 0.5f; amb.Play(); }
        }
    }
}
