using System;
using System.Collections.Generic;
using UnityEngine;

namespace ZS
{
    public enum Dmg { Bullet, Melee, Fire, Art }

    public class Enemy
    {
        public EnemyDef def;
        public Transform tf;
        public MeshRenderer rend;
        public MaterialPropertyBlock mpb = new MaterialPropertyBlock();
        public float hp, maxHp, height, radius, scale;
        public bool alive, dying, elite, boss, lost;
        public float spawnT, dyingT, cycle, atkT = -1, atkCd, stun, slow, burnT, burnDps, flashT, burnTick;
        public bool atkDone;
        public Vector3 pos, knock, lastKnown, moveDir;
        public float yaw, y, cd1, cd2, cd3, stateT, seed, tele;
        public int state, phase;
        public string affix, label;
        public Color rim;
        public float speedK = 1, dmgK = 1, bulletK = 1;
        public Vector3 Head => new Vector3(pos.x, y + height * 0.88f, pos.z);
        public Vector3 Center => new Vector3(pos.x, y + height * 0.55f, pos.z);
    }

    public class Projectile { public Vector3 pos, vel; public float radius, dmg, life; public Color col; public bool chain; }
    public class Hazard { public Vector3 pos; public float radius, delay, t, dmg; public Color col; public bool hitsEnemies; public Action onFire; }

    public struct Difficulty { public float hp, dmg, speed, bossHp, aggro, tele; }

    /// <summary>邪祟：生成 / AI / 受击 / 弹幕 / 地面预警。</summary>
    public class Enemies
    {
        public readonly List<Enemy> list = new List<Enemy>();
        public readonly List<Projectile> projectiles = new List<Projectile>();
        public readonly List<Hazard> hazards = new List<Hazard>();
        readonly Dictionary<string, Stack<Enemy>> pool = new Dictionary<string, Stack<Enemy>>();
        readonly List<(float, Action)> timers = new List<(float, Action)>();
        public Difficulty diff = new Difficulty { hp = 1, dmg = 1, speed = 1, bossHp = 1, aggro = 1, tele = 1 };
        public float freeze;
        public int aliveCount;
        readonly World world;
        readonly Fx fx;
        readonly Transform root;

        // 回调
        public Action<Enemy, Dmg> onKill;
        public Action<Enemy, float, Vector3, bool, bool> onDamage;      // (e, dmg, pos, crit, blocked)
        public Action<float, Vector3, bool> onPlayerHit;                 // (dmg, from, isAura)
        public Action<Enemy, int> onPhase;
        public Func<string, Vector3, Enemy> onSummon;
        public Action<string, Vector3> onSound;

        // 玩家信息（每帧由 Game 写入）
        public Vector3 playerPos, decoyPos;
        public bool playerStealth, hasDecoy;

        static readonly string[] Affixes = { "swift", "armored", "volatile", "vampiric", "frenzy" };
        static readonly Dictionary<string, (string, int)> AffixInfo = new Dictionary<string, (string, int)> {
            { "swift", ("迅捷", 0x60c8ff) }, { "armored", ("铁甲", 0xd8c080) }, { "volatile", ("爆裂", 0xff7040) }, { "vampiric", ("吸魂", 0xff4070) }, { "frenzy", ("狂暴", 0xff3020) } };

        public Enemies(World world, Fx fx)
        {
            this.world = world; this.fx = fx;
            root = new GameObject("Enemies").transform;
        }

        public void Later(float delay, Action a) { timers.Add((delay, a)); }

        // ------------------------------------------------------------ 生成 / 回收
        public Enemy Spawn(string type, Vector3 at, bool elite = false, float hpMult = 1f, bool instant = false)
        {
            var d = Data.Enemies[type];
            Enemy e;
            if (pool.TryGetValue(type, out var st) && st.Count > 0) e = st.Pop();
            else
            {
                e = new Enemy { def = d };
                var go = new GameObject(d.id);
                go.transform.SetParent(root, false);
                go.AddComponent<MeshFilter>().sharedMesh = EnemyModels.Get(d);
                e.rend = go.AddComponent<MeshRenderer>();
                e.rend.sharedMaterial = Mats.Lit;
                e.rend.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                e.rend.receiveShadows = false;
                e.tf = go.transform;
            }
            e.elite = elite && !d.boss; e.boss = d.boss;
            e.scale = d.scale * (e.elite ? 1.18f : 1f);
            e.height = EnemyModels.Height(d) * e.scale;
            e.radius = d.radius * (e.elite ? 1.1f : 1f);
            e.maxHp = d.hp * (d.boss ? diff.bossHp * hpMult : diff.hp * (e.elite ? 3.2f : 1f) * hpMult);
            e.hp = e.maxHp;
            e.alive = true; e.dying = false; e.lost = false;
            e.spawnT = instant ? 0 : (d.boss ? 1.6f : 0.8f);
            e.dyingT = 0; e.cycle = UnityEngine.Random.value; e.atkT = -1; e.atkCd = 0.5f; e.stun = 0; e.slow = 0; e.burnT = 0; e.flashT = 0;
            e.pos = new Vector3(at.x, 0, at.z); e.knock = Vector3.zero; e.y = 0;
            e.yaw = Mathf.Atan2(playerPos.x - at.x, playerPos.z - at.z) * Mathf.Rad2Deg;
            e.cd1 = 3f + UnityEngine.Random.value * 2f; e.cd2 = 6f + UnityEngine.Random.value * 3f; e.cd3 = 9f; e.state = 0; e.stateT = 0; e.phase = 0;
            e.seed = UnityEngine.Random.value * 10f;
            e.speedK = 1; e.dmgK = 1; e.bulletK = 1; e.affix = null; e.label = d.name;
            e.rim = d.boss ? new Color(0.5f, 0.12f, 0.08f) : Color.black;
            if (e.elite)
            {
                e.affix = Affixes[UnityEngine.Random.Range(0, Affixes.Length)];
                var (nm, col) = AffixInfo[e.affix];
                e.label = nm + " · " + d.name;
                e.rim = Col.H(col) * 0.9f;
                if (e.affix == "swift") e.speedK = 1.4f;
                if (e.affix == "armored") e.bulletK = 0.5f;
            }
            e.tf.gameObject.SetActive(true);
            e.tf.localScale = Vector3.one * e.scale;
            list.Add(e);
            if (!instant)
            {
                fx.Puff(e.pos + Vector3.up * 0.2f, new Color(0.3f, 0.26f, 0.2f), 8, 0.7f);
                fx.AddRing(e.pos + Vector3.up * 0.04f, 0.2f, 1.2f * e.scale, new Color(0.5f, 0.8f, 0.6f, 0.6f), 0.6f, 0.2f);
            }
            Apply(e);
            return e;
        }

        void Release(Enemy e)
        {
            e.alive = false;
            e.tf.gameObject.SetActive(false);
            if (!pool.TryGetValue(e.def.id, out var st)) pool[e.def.id] = st = new Stack<Enemy>();
            st.Push(e);
        }

        public void Clear()
        {
            foreach (var e in list) { e.tf.gameObject.SetActive(false); if (!pool.TryGetValue(e.def.id, out var st)) pool[e.def.id] = st = new Stack<Enemy>(); st.Push(e); e.alive = false; }
            list.Clear(); projectiles.Clear(); hazards.Clear(); timers.Clear(); freeze = 0; aliveCount = 0;
        }

        // ------------------------------------------------------------ 查询
        public bool Raycast(Vector3 o, Vector3 d, float range, out Enemy hit, out Vector3 point, out bool head)
        {
            hit = null; point = default; head = false;
            float best = range;
            for (int i = 0; i < list.Count; i++)
            {
                var e = list[i];
                if (!e.alive || e.dying || e.spawnT > 0.35f) continue;
                float r = e.radius * 1.05f;
                Vector3 a = new Vector3(e.pos.x, e.y + r * 0.6f, e.pos.z), b = new Vector3(e.pos.x, e.y + e.height - r * 0.5f, e.pos.z);
                // 射线与竖直线段的最近点
                Vector3 ab = b - a, ao = o - a;
                float dd = Vector3.Dot(d, ab), abab = Vector3.Dot(ab, ab), dao = Vector3.Dot(d, ao), abao = Vector3.Dot(ab, ao);
                float den = abab - dd * dd;
                float s = den > 1e-5f ? Mathf.Clamp01((abao - dd * dao) / den) : 0.5f;
                float t = Vector3.Dot(a + ab * s - o, d);
                if (t < 0 || t > best) continue;
                Vector3 pr = o + d * t, ps = a + ab * s;
                float dist = Vector3.Distance(pr, ps);
                if (dist > r) continue;
                float back = Mathf.Sqrt(Mathf.Max(0, r * r - dist * dist));
                best = Mathf.Max(0, t - back);
                hit = e; point = o + d * best;
                head = point.y > e.y + e.height * 0.78f;
            }
            return hit != null;
        }

        public void Query(Vector3 p, float r, List<Enemy> outList)
        {
            outList.Clear();
            for (int i = 0; i < list.Count; i++)
            {
                var e = list[i];
                if (!e.alive || e.dying || e.spawnT > 0.35f) continue;
                float dx = e.pos.x - p.x, dz = e.pos.z - p.z, rr = r + e.radius;
                if (dx * dx + dz * dz <= rr * rr) outList.Add(e);
            }
        }

        public Enemy Nearest(Vector3 p, float maxDist, Enemy except = null)
        {
            Enemy best = null; float bd = maxDist * maxDist;
            for (int i = 0; i < list.Count; i++)
            {
                var e = list[i];
                if (!e.alive || e.dying || e.spawnT > 0.35f || e == except) continue;
                float dx = e.pos.x - p.x, dz = e.pos.z - p.z, d2 = dx * dx + dz * dz;
                if (d2 < bd) { bd = d2; best = e; }
            }
            return best;
        }

        // ------------------------------------------------------------ 受击
        /// <returns>是否击杀</returns>
        public bool Damage(Enemy e, float dmg, Dmg type, Vector3 dir, float knock = 0, bool crit = false, bool head = false)
        {
            if (!e.alive || e.dying) return false;
            bool blocked = false;
            if (type == Dmg.Bullet)
            {
                dmg *= e.def.bulletMult * e.bulletK;
                if (e.def.shieldArc > 0 && e.stun <= 0)
                {
                    // 正面挡枪：子弹方向与怪物朝向相对
                    var fwd = Quaternion.Euler(0, e.yaw, 0) * Vector3.forward;
                    if (Vector3.Dot(fwd, -new Vector3(dir.x, 0, dir.z).normalized) > Mathf.Cos(e.def.shieldArc / 2f)) { dmg *= e.def.shieldMult; blocked = true; }
                }
            }
            else if (type == Dmg.Fire) { dmg *= e.def.fireMult; e.burnT = 3f; e.burnDps = Mathf.Max(e.burnDps, dmg * 0.12f); }
            if (e.spawnT > 0) dmg *= 0.5f;
            e.hp -= dmg;
            e.flashT = 0.12f;
            if (knock > 0 && !e.boss) e.knock += new Vector3(dir.x, 0, dir.z).normalized * knock * 4f;
            onDamage?.Invoke(e, dmg, e.Head + Vector3.up * 0.15f, crit || head, blocked);
            if (e.def.ai == AI.Caster && UnityEngine.Random.value < 0.3f && e.hp > 0) Blink(e);
            if (e.boss && e.def.phases != null && e.phase < e.def.phases.Length && e.hp / e.maxHp <= e.def.phases[e.phase])
            {
                e.phase++;
                fx.AddRing(e.pos + Vector3.up * 0.1f, 0.5f, 9f, new Color(1f, 0.4f, 0.2f, 0.9f), 0.8f, 0.6f);
                onPhase?.Invoke(e, e.phase);
            }
            if (e.hp <= 0) { Kill(e, type); return true; }
            return false;
        }

        public void Kill(Enemy e, Dmg type = Dmg.Art)
        {
            if (!e.alive || e.dying) return;
            e.dying = true; e.dyingT = 0; e.hp = 0;
            if (e.affix == "volatile") hazards.Add(new Hazard { pos = e.pos, radius = 3f, delay = 0.9f, dmg = 20 * diff.dmg, col = new Color(1f, 0.45f, 0.2f, 0.5f) });
            if (e.def.burst) fx.Puff(e.Center, new Color(0.9f, 0.85f, 0.7f), 14, 0.6f);
            onKill?.Invoke(e, type);
        }

        void Blink(Enemy e)
        {
            fx.Puff(e.Center, new Color(0.7f, 0.2f, 0.25f), 8, 0.6f);
            for (int k = 0; k < 8; k++)
            {
                float a = UnityEngine.Random.value * 6.283f, r = 5f + UnityEngine.Random.value * 4f;
                var p = e.pos + new Vector3(Mathf.Cos(a) * r, 0, Mathf.Sin(a) * r);
                if (world.Blocked(p)) continue;
                e.pos = p; break;
            }
            fx.Puff(e.Center, new Color(0.7f, 0.2f, 0.25f), 8, 0.6f);
        }

        void HitPlayer(Enemy e, float dmg, bool aura = false)
        {
            onPlayerHit?.Invoke(dmg * diff.dmg * e.dmgK, e.pos, aura);
        }

        // ------------------------------------------------------------ 每帧
        readonly List<Enemy> tmp = new List<Enemy>();

        public void Update(float dt)
        {
            for (int i = timers.Count - 1; i >= 0; i--)
            {
                var (t, a) = timers[i];
                t -= dt;
                if (t <= 0) { timers.RemoveAt(i); a(); } else timers[i] = (t, a);
            }
            if (freeze > 0) { freeze -= dt; dt *= 0.0001f; }
            int alive = 0;
            for (int i = list.Count - 1; i >= 0; i--)
            {
                var e = list[i];
                if (!e.alive) { list.RemoveAt(i); continue; }
                if (e.dying)
                {
                    e.dyingT += dt;
                    if (e.dyingT > 0.6f) { Release(e); list.RemoveAt(i); continue; }
                    Apply(e);
                    continue;
                }
                alive++;
                Tick(e, dt);
                Apply(e);
            }
            aliveCount = alive;
            Separate();
            UpdateProjectiles(dt);
            UpdateHazards(dt);
        }

        void Separate()
        {
            for (int i = 0; i < list.Count; i++)
            {
                var a = list[i];
                if (a.dying || a.spawnT > 0) continue;
                for (int j = i + 1; j < list.Count; j++)
                {
                    var b = list[j];
                    if (b.dying || b.spawnT > 0) continue;
                    float dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z, rr = a.radius + b.radius;
                    float d2 = dx * dx + dz * dz;
                    if (d2 >= rr * rr || d2 < 1e-6f) continue;
                    float d = Mathf.Sqrt(d2), push = (rr - d) * 0.5f;
                    float nx = dx / d, nz = dz / d;
                    float wa = a.boss ? 0.1f : 1f, wb = b.boss ? 0.1f : 1f;
                    a.pos.x -= nx * push * wa; a.pos.z -= nz * push * wa;
                    b.pos.x += nx * push * wb; b.pos.z += nz * push * wb;
                }
            }
        }

        void Tick(Enemy e, float dt)
        {
            var d = e.def;
            e.flashT = Mathf.Max(0, e.flashT - dt);
            if (e.spawnT > 0) { e.spawnT -= dt; return; }
            if (e.burnT > 0)
            {
                e.burnT -= dt; e.burnTick -= dt;
                e.hp -= e.burnDps * dt;
                if (e.burnTick <= 0) { e.burnTick = 0.15f; fx.Emit(e.Center + new Vector3(UnityEngine.Random.value - 0.5f, UnityEngine.Random.value - 0.3f, UnityEngine.Random.value - 0.5f) * 0.5f, Vector3.up * 1.6f, 0.3f, 0.05f, 0.4f, new Color(1f, 0.55f, 0.15f, 0.8f)); }
                if (e.hp <= 0) { Kill(e, Dmg.Fire); return; }
            }
            if (e.affix == "vampiric") e.hp = Mathf.Min(e.maxHp, e.hp + e.maxHp * 0.02f * dt);
            e.knock = Vector3.Lerp(e.knock, Vector3.zero, Mathf.Min(1, dt * 7f));
            e.pos += e.knock * dt;
            e.atkCd -= dt; e.cd1 -= dt; e.cd2 -= dt; e.cd3 -= dt;
            if (e.slow > 0) e.slow -= dt;
            if (e.stun > 0) { e.stun -= dt; e.y = Mathf.Max(0, e.y - dt * 4f); e.pos = world.Collide(e.pos, e.radius); return; }

            // 目标：闭气时僵尸失去目标；纸人替身会吸引仇恨
            Vector3 target = playerPos;
            bool decoyed = hasDecoy && !e.boss;
            if (decoyed) target = decoyPos;
            e.lost = !decoyed && playerStealth && d.jiangshi && !e.boss;
            if (e.lost) target = e.lastKnown + new Vector3(Mathf.Sin(Time.time * 0.6f + e.seed * 7f), 0, Mathf.Cos(Time.time * 0.5f + e.seed * 3f)) * 3f;
            else e.lastKnown = target;
            Vector3 to = new Vector3(target.x - e.pos.x, 0, target.z - e.pos.z);
            float dist = to.magnitude;
            Vector3 dir = dist > 0.001f ? to / dist : Vector3.forward;
            float spd = d.speed * diff.speed * e.speedK * (e.slow > 0 ? 0.5f : 1f) * (e.affix == "frenzy" && e.hp < e.maxHp * 0.4f ? 1.5f : 1f) * (e.boss && e.phase > 0 ? 1f + e.phase * 0.15f : 1f);
            float wantYaw = Mathf.Atan2(dir.x, dir.z) * Mathf.Rad2Deg;
            bool canHit = !e.lost && !decoyed;

            switch (d.ai)
            {
                case AI.Hop: HopAI(e, dt, dir, dist, spd, wantYaw, canHit); break;
                case AI.Run: case AI.Walk: case AI.Soldier: WalkAI(e, dt, dir, dist, spd, wantYaw, canHit); break;
                case AI.Caster: CasterAI(e, dt, dir, dist, spd, wantYaw, canHit, 7f, d.damage, 3.2f, false); break;
                case AI.Drought: HopAI(e, dt, dir, dist, spd, wantYaw, canHit); DroughtAI(e, dt, dist); break;
                case AI.WuWhite: CasterAI(e, dt, dir, dist, spd, wantYaw, canHit, 16f, 18f, e.phase > 0 ? 2.2f : 3.4f, true); if (e.cd2 <= 0) { e.cd2 = 9f; Summon(e, "imp", 4); } break;
                case AI.WuBlack: ChargerAI(e, dt, dir, dist, spd, wantYaw, canHit, 0.8f, 17f, 0.7f, 26f, e.phase > 0 ? 3.4f : 5f, 4.5f, 22f); break;
                case AI.Hou: if (e.state == 3) { e.yaw = Mathf.MoveTowardsAngle(e.yaw, wantYaw, 60f * dt); HouBreath(e, dt, dir, dist); break; } ChargerAI(e, dt, dir, dist, spd, wantYaw, canHit, 1.0f, 15f, 0.95f, 34f, 7f, 6f, 30f); HouAI(e, dt, dir, dist); break;
                case AI.Sorcerer: SorcererAI(e, dt, dir, dist, spd, wantYaw); break;
            }
            float feet = e.y;
            e.pos = world.Collide(e.pos, e.radius, feet > 1.2f ? feet : 0);
        }

        void Melee(Enemy e, float dt, float dist, bool canHit)
        {
            var d = e.def;
            float atkTime = d.atkTime / (e.affix == "swift" ? 1.35f : 1f) / Mathf.Max(0.6f, diff.aggro);
            if (e.atkT >= 0)
            {
                e.atkT += dt;
                if (!e.atkDone && e.atkT >= atkTime * 0.55f)
                {
                    e.atkDone = true;
                    if (canHit && dist < d.atkRange * e.scale + 0.45f) HitPlayer(e, d.damage);
                }
                if (e.atkT >= atkTime) { e.atkT = -1; e.atkCd = 0.35f; }
            }
            else if (canHit && dist < d.atkRange * e.scale && e.atkCd <= 0 && e.y < 0.05f) { e.atkT = 0; e.atkDone = false; }
        }

        void HopAI(Enemy e, float dt, Vector3 dir, float dist, float spd, float wantYaw, bool canHit)
        {
            var d = e.def;
            e.yaw = Mathf.MoveTowardsAngle(e.yaw, wantYaw, 240f * dt);
            Melee(e, dt, dist, canHit);
            if (e.atkT >= 0) { e.y = Mathf.Max(0, e.y - dt * 3f); return; }
            float period = d.hopT + d.hopRest;
            float k = spd / Mathf.Max(0.1f, d.speed);
            e.cycle += dt * k / period;
            float ph = (e.cycle % 1f) * period;
            if (ph >= d.hopRest)
            {
                float air = (ph - d.hopRest) / d.hopT;
                float stop = d.atkRange * e.scale * 0.8f;
                if (dist > stop || e.lost) e.pos += dir * (d.speed * period / d.hopT) * dt * k;
                float y = Mathf.Sin(air * Mathf.PI) * d.hopH;
                if (e.y > 0.05f && y <= 0.05f && dist < 22f) onSound?.Invoke("hop", e.pos);
                e.y = y;
            }
            else e.y = 0;
        }

        void WalkAI(Enemy e, float dt, Vector3 dir, float dist, float spd, float wantYaw, bool canHit)
        {
            var d = e.def;
            e.yaw = Mathf.MoveTowardsAngle(e.yaw, wantYaw, 360f * dt);
            Melee(e, dt, dist, canHit);
            if (e.atkT >= 0) return;
            e.cycle += dt * spd * 1.6f;
            Vector3 mv = dir;
            if (d.ai == AI.Run) mv = (dir + new Vector3(-dir.z, 0, dir.x) * Mathf.Sin(e.cycle * 0.9f + e.seed) * 0.55f).normalized;   // 小鬼蛇形
            if (dist > d.atkRange * e.scale * 0.75f || e.lost) e.pos += mv * spd * dt;
            e.y = d.ai == AI.Run ? Mathf.Abs(Mathf.Sin(e.cycle * 2.2f)) * 0.14f : 0;
        }

        void Shoot(Enemy e, Vector3 from, Vector3 at, float speed, float dmg, Color col, bool chain = false, float radius = 0.28f)
        {
            var v = (at - from).normalized * speed;
            projectiles.Add(new Projectile { pos = from, vel = v, radius = radius, dmg = dmg * diff.dmg * e.dmgK, life = 6f, col = col, chain = chain });
        }

        void CasterAI(Enemy e, float dt, Vector3 dir, float dist, float spd, float wantYaw, bool canHit, float shotSpeed, float shotDmg, float shotCd, bool chain)
        {
            var d = e.def;
            e.yaw = Mathf.MoveTowardsAngle(e.yaw, wantYaw, 300f * dt);
            e.cycle += dt;
            e.y = d.floatY + 0.15f + Mathf.Sin(e.cycle * 1.8f + e.seed) * 0.12f;
            Vector3 side = new Vector3(-dir.z, 0, dir.x) * (Mathf.Sin(e.cycle * 0.35f + e.seed) > 0 ? 1 : -1);
            Vector3 mv = dist > 11f ? dir : dist < 6f ? -dir : side;
            if (e.atkT < 0) e.pos += mv * spd * dt * (dist > 11f || dist < 6f ? 1f : 0.6f);
            if (e.atkT >= 0)
            {
                e.atkT += dt;
                var hand = e.Center + Quaternion.Euler(0, e.yaw, 0) * new Vector3(0, 0.2f, 0.5f);
                fx.Billboard(hand, 0.3f + e.atkT * 0.6f, chain ? new Color(0.8f, 0.9f, 1f, 0.9f) : new Color(0.4f, 1f, 0.6f, 0.9f));
                if (e.atkT >= 0.6f * diff.tele)
                {
                    e.atkT = -1; e.cd1 = shotCd / Mathf.Max(0.6f, diff.aggro);
                    if (canHit) Shoot(e, hand, playerPos + Vector3.up * 1.1f, shotSpeed, shotDmg, chain ? new Color(0.85f, 0.9f, 1f, 1f) : new Color(0.4f, 1f, 0.6f, 1f), chain);
                    onSound?.Invoke(chain ? "chain" : "ghostfire", e.pos);
                }
            }
            else if (canHit && e.cd1 <= 0 && dist < d.atkRange + 4f) e.atkT = 0;
        }

        void Summon(Enemy e, string type, int n)
        {
            for (int i = 0; i < n; i++)
            {
                float a = i / (float)n * 6.283f;
                var p = e.pos + new Vector3(Mathf.Cos(a) * 2.2f, 0, Mathf.Sin(a) * 2.2f);
                fx.Puff(p + Vector3.up, new Color(0.6f, 0.4f, 1f), 8, 0.6f);
                onSummon?.Invoke(type, p);
            }
        }

        void DroughtAI(Enemy e, float dt, float dist)
        {
            // 灼热光环 + 环形火弹
            if (dist < 4.2f) { e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.5f; HitPlayer(e, 3f, true); } }
            if (UnityEngine.Random.value < dt * 14f)
            {
                float a = UnityEngine.Random.value * 6.283f;
                fx.Emit(e.pos + new Vector3(Mathf.Cos(a) * 4.2f, 0.1f, Mathf.Sin(a) * 4.2f), Vector3.up * 1.5f, 0.3f, 0.05f, 0.6f, new Color(1f, 0.45f, 0.1f, 0.7f));
            }
            if (e.cd2 <= 0)
            {
                e.cd2 = e.phase >= 2 ? 4f : 6f;
                int n = e.phase >= 1 ? 16 : 10;
                var c = e.Center;
                for (int i = 0; i < n; i++)
                {
                    float a = i / (float)n * 6.283f + e.seed;
                    Shoot(e, c, c + new Vector3(Mathf.Cos(a), 0, Mathf.Sin(a)), 6.5f, 14f, new Color(1f, 0.5f, 0.12f, 1f));
                }
                fx.AddRing(e.pos + Vector3.up * 0.1f, 0.5f, 4f, new Color(1f, 0.5f, 0.15f, 0.9f), 0.5f);
                onSound?.Invoke("fire", e.pos);
            }
        }

        // 近战 + 蓄力冲撞 + 砸地
        void ChargerAI(Enemy e, float dt, Vector3 dir, float dist, float spd, float wantYaw, bool canHit, float windup, float dashSpeed, float dashDur, float dashDmg, float dashCd, float slamR, float slamDmg)
        {
            var d = e.def;
            if (e.state == 1)       // 蓄力：地面画出冲撞路径
            {
                e.stateT += dt;
                e.yaw = Mathf.MoveTowardsAngle(e.yaw, wantYaw, 200f * dt);
                e.moveDir = Quaternion.Euler(0, e.yaw, 0) * Vector3.forward;
                float k = e.stateT / (windup * diff.tele);
                for (int i = 1; i <= 6; i++) fx.GroundDisc(e.pos + e.moveDir * (i * 2.4f) + Vector3.up * 0.04f, 1.2f, new Color(1f, 0.2f, 0.1f, 0.35f), k);
                if (k >= 1) { e.state = 2; e.stateT = 0; onSound?.Invoke("dash", e.pos); }
                return;
            }
            if (e.state == 2)       // 冲撞
            {
                e.stateT += dt;
                var next = e.pos + e.moveDir * dashSpeed * dt;
                bool wall = world.Blocked(next, e.radius);
                e.pos = next;
                fx.Puff(e.pos + Vector3.up * 0.2f, new Color(0.4f, 0.36f, 0.3f), 1, 0.8f);
                if (!e.atkDone && canHit && Vector3.Distance(new Vector3(playerPos.x, 0, playerPos.z), e.pos) < e.radius + 1.1f) { e.atkDone = true; HitPlayer(e, dashDmg); }
                if (e.stateT >= dashDur || wall)
                {
                    e.state = 0; e.cd1 = dashCd;
                    hazards.Add(new Hazard { pos = e.pos, radius = slamR, delay = 0.55f * diff.tele, dmg = slamDmg * diff.dmg, col = new Color(1f, 0.3f, 0.15f, 0.45f) });
                }
                return;
            }
            WalkAI(e, dt, dir, dist, spd, wantYaw, canHit);
            if (canHit && e.cd1 <= 0 && dist > 5f && dist < 20f && e.atkT < 0) { e.state = 1; e.stateT = 0; e.atkDone = false; }
        }

        void HouAI(Enemy e, float dt, Vector3 dir, float dist)
        {
            if (e.state != 0) return;
            if (e.cd3 <= 0) { e.cd3 = 14f; Summon(e, "flying", e.phase >= 1 ? 4 : 3); }
            // 喷火：前方锥形
            if (e.cd2 <= 0 && dist > 3f && dist < 9.5f) { e.cd2 = e.phase >= 2 ? 5f : 8f; e.state = 3; e.stateT = 0; onSound?.Invoke("fire", e.pos); }
        }

        void HouBreath(Enemy e, float dt, Vector3 dir, float dist)
        {
            e.stateT += dt;
            var fwd = Quaternion.Euler(0, e.yaw, 0) * Vector3.forward;
            var mouth = e.pos + Vector3.up * e.height * 0.8f + fwd * 0.8f;
            if (e.stateT > 0.5f)
            {
                for (int i = 0; i < 3; i++)
                {
                    var v = (fwd + new Vector3(UnityEngine.Random.value - 0.5f, (UnityEngine.Random.value - 0.6f) * 0.5f, UnityEngine.Random.value - 0.5f) * 0.5f).normalized * (9f + UnityEngine.Random.value * 5f);
                    fx.Emit(mouth, v, 0.4f, 1.6f, 0.75f, new Color(1f, 0.45f + UnityEngine.Random.value * 0.3f, 0.1f, 0.8f));
                }
                Vector3 to = new Vector3(playerPos.x - e.pos.x, 0, playerPos.z - e.pos.z);
                if (to.magnitude < 9.5f && Vector3.Angle(fwd, to) < 30f) { e.burnTick -= dt; if (e.burnTick <= 0) { e.burnTick = 0.25f; HitPlayer(e, 42f * 0.25f); } }
            }
            else fx.Billboard(mouth, 0.5f + e.stateT * 2f, new Color(1f, 0.5f, 0.1f, 0.9f));
            if (e.stateT > 2.1f) e.state = 0;
        }

        void SorcererAI(Enemy e, float dt, Vector3 dir, float dist, float spd, float wantYaw)
        {
            e.yaw = Mathf.MoveTowardsAngle(e.yaw, wantYaw, 300f * dt);
            e.cycle += dt;
            e.y = 0.35f + Mathf.Sin(e.cycle * 1.4f) * 0.12f;
            float haste = 1f + e.phase * 0.3f;
            // 游走：保持中距离
            Vector3 side = new Vector3(-dir.z, 0, dir.x) * (Mathf.Sin(e.cycle * 0.3f) > 0 ? 1 : -1);
            e.pos += (dist > 13f ? dir : dist < 7f ? -dir : side) * spd * dt * 0.8f;
            // 掌心雷：玩家脚下与周围落雷
            if (e.cd1 <= 0)
            {
                e.cd1 = 2.8f / haste;
                int n = 2 + e.phase;
                for (int i = 0; i < n; i++)
                {
                    var p = playerPos + (i == 0 ? Vector3.zero : new Vector3(UnityEngine.Random.value - 0.5f, 0, UnityEngine.Random.value - 0.5f) * 9f);
                    p.y = 0;
                    var hp = p;
                    hazards.Add(new Hazard { pos = p, radius = 2.4f, delay = 1.1f * diff.tele, dmg = 26 * diff.dmg, col = new Color(0.7f, 0.4f, 1f, 0.45f), onFire = () => { fx.Bolt(hp + Vector3.up * 26f, hp, new Color(0.8f, 0.6f, 1f, 1f), 0.2f); onSound?.Invoke("thunder", hp); } });
                }
            }
            // 飞剑：扇形弹幕
            if (e.cd2 <= 0)
            {
                e.cd2 = 5f / haste;
                var c = e.Center + Vector3.up * 0.4f;
                int n = 5 + e.phase * 2;
                for (int i = 0; i < n; i++)
                {
                    float a = (i - (n - 1) / 2f) * 0.16f;
                    var v = Quaternion.Euler(0, a * Mathf.Rad2Deg, 0) * (playerPos + Vector3.up * 1.1f - c).normalized;
                    Shoot(e, c, c + v, 13f, 18f, new Color(0.8f, 0.5f, 1f, 1f));
                }
                onSound?.Invoke("chain", e.pos);
            }
            // 遁形 + 第二阶段起召阴兵
            if (e.cd3 <= 0)
            {
                e.cd3 = 7f / haste;
                Blink(e);
                if (e.phase >= 1) Summon(e, "soldier", 2);
                if (e.phase >= 2)
                {
                    // 鬼门大开：以玩家为心的一圈落雷
                    for (int i = 0; i < 8; i++)
                    {
                        float a = i / 8f * 6.283f;
                        var p = new Vector3(playerPos.x + Mathf.Cos(a) * 5f, 0, playerPos.z + Mathf.Sin(a) * 5f);
                        hazards.Add(new Hazard { pos = p, radius = 2.2f, delay = 1.5f * diff.tele, dmg = 24 * diff.dmg, col = new Color(1f, 0.3f, 0.6f, 0.45f), onFire = () => fx.Bolt(p + Vector3.up * 26f, p, new Color(1f, 0.5f, 0.8f, 1f), 0.2f) });
                    }
                }
            }
        }

        void UpdateProjectiles(float dt)
        {
            Vector3 chest = playerPos + Vector3.up * 1.1f;
            for (int i = projectiles.Count - 1; i >= 0; i--)
            {
                var p = projectiles[i];
                p.life -= dt;
                p.pos += p.vel * dt;
                fx.Billboard(p.pos, p.radius * 3.2f, p.col);
                if (UnityEngine.Random.value < dt * 30f) fx.Emit(p.pos, Vector3.zero, p.radius * 1.6f, 0.02f, 0.3f, new Color(p.col.r, p.col.g, p.col.b, 0.6f));
                bool dead = p.life <= 0 || p.pos.y < 0.05f || world.Blocked(p.pos, 0.05f) && p.pos.y < 3f;
                if (!dead && (p.pos - chest).sqrMagnitude < (p.radius + 0.5f) * (p.radius + 0.5f) && Mathf.Abs(p.pos.y - chest.y) < 1.2f)
                {
                    onPlayerHit?.Invoke(p.dmg, p.pos - p.vel.normalized, false);
                    dead = true;
                }
                if (dead) { fx.Sparks(p.pos, 6, p.col, 3f); projectiles.RemoveAt(i); }
            }
        }

        void UpdateHazards(float dt)
        {
            for (int i = hazards.Count - 1; i >= 0; i--)
            {
                var h = hazards[i];
                h.t += dt;
                fx.GroundDisc(h.pos + Vector3.up * 0.05f, h.radius, h.col, h.t / h.delay);
                if (h.t < h.delay) continue;
                hazards.RemoveAt(i);
                fx.AddRing(h.pos + Vector3.up * 0.08f, h.radius * 0.3f, h.radius, new Color(h.col.r, h.col.g, h.col.b, 1f), 0.35f, 0.6f);
                fx.Sparks(h.pos + Vector3.up * 0.3f, 14, new Color(h.col.r, h.col.g, h.col.b, 1f), 6f);
                h.onFire?.Invoke();
                float dx = playerPos.x - h.pos.x, dz = playerPos.z - h.pos.z;
                if (dx * dx + dz * dz < (h.radius + 0.3f) * (h.radius + 0.3f) && playerPos.y < 1.2f) onPlayerHit?.Invoke(h.dmg, h.pos, false);
            }
        }

        // ------------------------------------------------------------ 姿态
        void Apply(Enemy e)
        {
            var d = e.def;
            float y = e.y, pitch = 0, roll = 0, sc = 1f;
            float t = Time.time + e.seed;
            if (e.spawnT > 0) { float k = e.spawnT / (d.boss ? 1.6f : 0.8f); y = -e.height * k; roll = Mathf.Sin(t * 30f) * 3f * k; }
            else if (e.dying) { float k = e.dyingT / 0.6f; y -= e.height * 0.5f * k * k; pitch = -70f * k; sc = 1f - k * 0.5f; }
            else
            {
                if (e.atkT >= 0) { float k = Mathf.Sin(Mathf.Clamp01(e.atkT / Mathf.Max(0.1f, d.atkTime)) * Mathf.PI); pitch = 26f * k; }
                if (d.ai == AI.Hop || d.ai == AI.Drought) pitch += e.y > 0.02f ? 7f : 0;
                if (d.ai == AI.Run) roll = Mathf.Sin(e.cycle * 2.2f) * 10f;
                if (d.ai == AI.Walk) roll = Mathf.Sin(t * 3.2f) * 7f;
                if (d.ai == AI.Caster || d.ai == AI.WuWhite || d.ai == AI.Sorcerer) roll = Mathf.Sin(t * 1.3f) * 3f;
                if (e.stun > 0) { roll += Mathf.Sin(t * 26f) * 5f; pitch -= 8f; }
                if (e.state == 1) pitch = -12f;
                if (e.state == 2) pitch = 22f;
            }
            e.tf.localPosition = new Vector3(e.pos.x, y, e.pos.z);
            e.tf.localRotation = Quaternion.Euler(pitch, e.yaw, roll);
            if (sc != 1f || e.dying) e.tf.localScale = Vector3.one * (e.scale * sc);
            Color flash = e.flashT > 0 ? new Color(0.9f, 0.9f, 0.9f) * (e.flashT / 0.12f) : Color.black;
            if (e.burnT > 0) flash += new Color(0.5f, 0.18f, 0.02f);
            if (e.lost) flash += new Color(-0.1f, -0.05f, 0.08f);
            if (e.dying) flash += new Color(0.5f, 0.3f, 0.1f) * (e.dyingT / 0.6f);
            e.mpb.SetColor("_Flash", flash);
            e.mpb.SetColor("_Rim", e.rim);
            e.rend.SetPropertyBlock(e.mpb);
        }
    }
}
