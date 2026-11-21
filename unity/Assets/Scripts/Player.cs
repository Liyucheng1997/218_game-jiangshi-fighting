using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    /// <summary>道长本体：生命、移动（摇杆 + 现实走动）、跳、罡步冲刺、闭气。</summary>
    public class Player
    {
        public float hp = 100, maxHp = 100, invuln, dashT, dashCd, dashCdMax = 2.2f, breath = 3.2f, breathMax = 3.2f, breathLock;
        public bool alive = true, holding, enabled, moving, running;
        public float speedMult = 1, walkSpeed = 5.4f, runSpeed = 8.2f;
        public Vector3 vel, dashDir;
        public float y, vy;                  // 跳跃高度
        float stepT;
        const float Radius = 0.42f;
        public bool Dashing => dashT > 0;
        public bool Stealth => holding && alive;

        public void Reset()
        {
            hp = maxHp; alive = true; invuln = 0; dashT = 0; dashCd = 0; breath = breathMax; holding = false; breathLock = 0; vel = Vector3.zero; y = 0; vy = 0;
        }

        public bool TakeDamage(float d)
        {
            if (!alive || invuln > 0 || dashT > 0) return false;
            hp = Mathf.Max(0, hp - d);
            invuln = 0.35f;
            if (hp <= 0) alive = false;
            return true;
        }

        public void Heal(float v) { hp = Mathf.Min(maxHp, hp + v); }

        public bool Dash(Rig rig)
        {
            if (dashCd > 0 || !alive) return false;
            var f = rig.FlatForward; var r = new Vector3(f.z, 0, -f.x);
            var s = rig.left.stick;
            var d = f * s.y + r * s.x;
            dashDir = d.sqrMagnitude > 0.04f ? d.normalized : f;
            dashT = 0.22f; dashCd = dashCdMax;
            return true;
        }

        public void Update(float dt, Rig rig, World world, Game g)
        {
            invuln = Mathf.Max(0, invuln - dt);
            dashCd = Mathf.Max(0, dashCd - dt);
            // 闭气
            breathLock = Mathf.Max(0, breathLock - dt);
            bool want = enabled && rig.left.gripDown && breathLock <= 0 && alive;
            if (want && breath > 0)
            {
                if (!holding) { holding = true; g.sfx.Play("breath"); }
                breath -= dt;
                if (breath <= 0) { breath = 0; holding = false; breathLock = 2.2f; g.hud.Toast("气竭！"); g.sfx.Play("hurt", 0.6f, 1.4f); }
            }
            else { holding = false; breath = Mathf.Min(breathMax, breath + dt * breathMax / 4.5f); }

            Vector3 feet = rig.Feet;
            if (enabled)
            {
                var f = rig.FlatForward; var r = new Vector3(f.z, 0, -f.x);
                Vector2 s = rig.left.stick;
                float mag = s.magnitude;
                if (mag < 0.15f) { s = Vector2.zero; mag = 0; }
                moving = mag > 0;
                running = moving && rig.left.stickClick && !holding;
                if (rig.left.stickClickHit) runLatch = !runLatch;
                if (!moving) runLatch = false;
                running = moving && runLatch && !holding;
                float speed = (running ? runSpeed : walkSpeed) * speedMult * (holding ? 0.72f : 1f) * Mathf.Clamp(mag, 0.35f, 1f);
                Vector3 move = moving ? (f * s.y + r * s.x).normalized * speed : Vector3.zero;
                if (dashT > 0) { dashT -= dt; vel = dashDir * 22f; }
                else vel = Vector3.Lerp(vel, move, Mathf.Min(1, 14f * dt));
                if (rig.right.primary && y <= 0.001f) vy = 7.5f;
            }
            else { vel = Vector3.zero; moving = false; }
            vy -= 22f * dt; y += vy * dt;
            if (y <= 0) { y = 0; vy = 0; }
            feet += new Vector3(vel.x, 0, vel.z) * dt;
            feet = world.Collide(feet, Radius, y);
            feet.y = y;
            rig.MoveFeetTo(feet);
            if (moving && y <= 0.001f)
            {
                stepT += dt * (running ? 2.6f : 1.7f);
                if (stepT > 0.9f) { stepT = 0; if (!holding) g.sfx.Play("step", 0.25f, 0.9f + Random.value * 0.2f); }
            }
        }
        bool runLatch;
    }

    /// <summary>兵器：右手持握，枪口朝哪打哪。</summary>
    public class Weapons
    {
        public readonly List<string> owned = new List<string>();
        public readonly Dictionary<string, int> levels = new Dictionary<string, int>(), mags = new Dictionary<string, int>();
        public string current = "mauser";
        public float cooldown, reloading, reloadTotal, spin, kick, swingT = -1;
        public bool trigger; bool consumed;
        public float gunDmg = 1, fireRate = 1, reloadMult = 1, crit = 0, headMult = 1;
        readonly Dictionary<string, GameObject> models = new Dictionary<string, GameObject>();
        readonly Dictionary<string, Vector3> muzzles = new Dictionary<string, Vector3>();
        readonly Transform mount, holder;
        readonly Game g;
        float flashT;

        public Weapons(Game game, Transform aim)
        {
            g = game;
            mount = new GameObject("GunMount").transform; mount.SetParent(aim, false);
            holder = new GameObject("GunHolder").transform; holder.SetParent(mount, false);
            ResetRun();
        }

        public WeaponDef Def => Data.Weapons[current];
        public int Mag => mags[current];
        public int Level(string id) => levels.TryGetValue(id, out int l) ? l : 0;
        public int MagMaxOf(string id) => Mathf.RoundToInt(Data.Weapons[id].mag * (1 + Level(id) * 0.25f));
        public int MagMax => MagMaxOf(current);
        float Damage => Def.melee ? Def.damage * (1 + Level(current) * 0.3f) : Def.damage * (1 + Level(current) * 0.2f);
        float ReloadTime => Def.reload * (1 - Level(current) * 0.1f) / reloadMult;
        public Vector3 MuzzleWorld => holder.TransformPoint(muzzles[current]);

        public void ResetRun()
        {
            owned.Clear(); owned.Add("mauser"); owned.Add("sword");
            levels.Clear(); mags.Clear();
            foreach (var id in Data.WeaponOrder) mags[id] = Data.Weapons[id].mag;
            current = "mauser"; cooldown = 0; reloading = 0; spin = 0; swingT = -1;
            Show();
        }

        void Show()
        {
            if (!models.ContainsKey(current))
            {
                var mesh = EnemyModels.Gun(current, out var mz);
                var go = new GameObject("gun_" + current);
                go.transform.SetParent(holder, false);
                go.AddComponent<MeshFilter>().sharedMesh = mesh;
                var r = go.AddComponent<MeshRenderer>(); r.sharedMaterial = Mats.Lit;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                models[current] = go; muzzles[current] = mz;
            }
            foreach (var kv in models) kv.Value.SetActive(kv.Key == current);
        }

        public void SetVisible(bool v) { mount.gameObject.SetActive(v); }

        public void Add(string id)
        {
            if (owned.Contains(id)) return;
            owned.Add(id);
            owned.Sort((a, b) => System.Array.IndexOf(Data.WeaponOrder, a).CompareTo(System.Array.IndexOf(Data.WeaponOrder, b)));
            mags[id] = MagMaxOf(id);
            SwitchTo(id);
        }

        public void Upgrade(string id) { levels[id] = Level(id) + 1; mags[id] = MagMaxOf(id); }

        public void SwitchTo(string id)
        {
            if (!owned.Contains(id) || id == current) return;
            current = id; reloading = 0; cooldown = 0.25f; spin = 0; swingT = -1;
            Show();
            g.sfx.Play("switch");
        }

        public void Cycle(int d)
        {
            int i = owned.IndexOf(current);
            SwitchTo(owned[(i + d + owned.Count) % owned.Count]);
        }

        public void StartReload()
        {
            if (Def.melee || reloading > 0 || Mag >= MagMax) return;
            reloading = reloadTotal = ReloadTime;
            g.sfx.Play("reload");
        }

        public void RefillAll() { foreach (var id in owned) mags[id] = MagMaxOf(id); reloading = 0; }

        public void Update(float dt, bool active)
        {
            var d = Def;
            cooldown -= dt;
            kick = Mathf.Max(0, kick - dt * 10f);
            if (reloading > 0) { reloading -= dt; if (reloading <= 0) { reloading = 0; mags[current] = MagMax; g.sfx.Play("reloadDone"); } }
            if (d.spinUp > 0) spin += ((trigger && active ? 1 : 0) - spin) * Mathf.Min(1, dt * (trigger ? 1f / d.spinUp : 3f));

            if (active && trigger && cooldown <= 0 && reloading <= 0)
            {
                if (d.melee) { if (!consumed) { consumed = true; cooldown = d.interval; swingT = 0; Melee(); } }
                else if (!d.auto && consumed) { }
                else if (d.spinUp > 0 && spin < 0.8f) { }
                else if (Mag <= 0) { if (!consumed) { g.sfx.Play("dry"); consumed = true; } StartReload(); }
                else
                {
                    consumed = true;
                    cooldown = d.interval / fireRate;
                    mags[current] = Mag - 1;
                    Fire();
                    if (Mag <= 0) StartReload();
                }
            }
            if (!trigger) consumed = false;

            // 握持姿态：后坐、换弹下压、挥剑
            float rx = -kick * 12f, ry = 0, rz = 0; Vector3 p = new Vector3(0, 0, -kick * 0.04f);
            if (reloading > 0) { float s = Mathf.Sin((1 - reloading / reloadTotal) * Mathf.PI); rx += s * 40f; rz += s * 30f; p.y -= s * 0.05f; }
            if (swingT >= 0)
            {
                swingT += dt / 0.3f;
                float k = Mathf.Min(1, swingT), s = Mathf.Sin(k * Mathf.PI);
                ry = 60f - k * 120f; rx += 25f * s;
                if (swingT >= 1) swingT = -1;
            }
            holder.localPosition = p; holder.localRotation = Quaternion.Euler(rx, ry, rz);
            if (flashT > 0) { flashT -= dt; g.fx.Billboard(MuzzleWorld, 0.28f * d.flash, new Color(1f, 0.8f, 0.4f, 1f)); }
        }

        void Fire()
        {
            var d = Def;
            Vector3 o = MuzzleWorld, fwd = mount.forward, right = mount.right, up = mount.up;
            float spread = d.spread * (g.player.moving ? 1.3f : 1f);
            for (int i = 0; i < d.pellets; i++)
            {
                float a = Random.value * 6.283f, r = Mathf.Sqrt(Random.value) * spread;
                var dir = (fwd + right * (Mathf.Cos(a) * r) + up * (Mathf.Sin(a) * r)).normalized;
                Shot(o, dir, d, i == 0);
            }
            g.sfx.Play(d.sound, 0.9f, 0.95f + Random.value * 0.1f);
            kick = Mathf.Min(1, kick + 0.5f);
            flashT = 0.05f;
            g.rig.right.Pulse(0.5f + d.flash * 0.2f, 0.045f);
            if (d.flash > 0) g.fx.Emit(o, fwd * 0.6f + Vector3.up * 0.4f, 0.1f, 0.35f, 0.5f, new Color(0.7f, 0.7f, 0.7f, 0.18f), -0.3f, false);
        }

        void Shot(Vector3 o, Vector3 dir, WeaponDef d, bool first)
        {
            var E = g.enemies;
            float wd = g.world.Raycast(o, dir, d.range);
            Vector3 end = o + dir * d.range;
            if (E.Raycast(o, dir, wd > 0 ? wd : d.range, out var e, out var point, out bool head))
            {
                end = point;
                bool cr = Random.value < crit;
                float dmg = Damage * gunDmg * (head ? d.headMult * headMult : 1f) * (cr ? 2f : 1f);
                bool died = E.Damage(e, dmg, Dmg.Bullet, dir, d.knock, cr, head);
                g.OnBulletHit(e, point, dir, head, died);
            }
            else if (wd > 0) { end = o + dir * wd; g.fx.Sparks(end, 4, new Color(1f, 0.8f, 0.5f, 1f), 3f); }
            if (first || Random.value < 0.4f) g.fx.AddBeam(o, end, 0.025f, new Color(1f, 0.85f, 0.6f, 0.8f), 0.06f);
        }

        readonly List<Enemy> tmp = new List<Enemy>();
        void Melee()
        {
            var d = Def;
            g.sfx.Play("knife");
            g.rig.right.Pulse(0.6f, 0.08f);
            Vector3 fwd = mount.forward; fwd.y = 0; fwd = fwd.sqrMagnitude > 0.01f ? fwd.normalized : g.rig.FlatForward;
            Vector3 feet = g.rig.Feet;
            float range = d.range * (1 + Level(current) * 0.15f);
            g.enemies.Query(feet, range, tmp);
            int n = 0;
            foreach (var e in tmp)
            {
                Vector3 to = e.pos - feet; to.y = 0;
                if (to.magnitude > 0.3f && Vector3.Angle(fwd, to) > d.arc * Mathf.Rad2Deg / 2f) continue;
                bool cr = Random.value < crit;
                bool died = g.enemies.Damage(e, Damage * gunDmg * (cr ? 2 : 1), Dmg.Melee, to.normalized, d.knock, cr);
                g.OnBulletHit(e, e.Center, to.normalized, false, died);
                n++;
            }
            for (int i = 0; i < 12; i++)
            {
                float a = (i / 11f - 0.5f) * d.arc * Mathf.Rad2Deg;
                var dd = Quaternion.Euler(0, a, 0) * fwd;
                g.fx.Emit(feet + dd * 1.5f + Vector3.up * (1.0f + i * 0.03f), dd * 2f, 0.25f, 0.05f, 0.22f, new Color(1f, 0.7f, 0.45f, 0.8f));
            }
            if (n > 0) g.sfx.Play("hit");
        }
    }
}
