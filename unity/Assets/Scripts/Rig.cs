using System.Collections.Generic;
using UnityEngine;
using UnityEngine.XR;

namespace ZS
{
    /// <summary>一只手柄的状态（含按下沿检测）。</summary>
    public class Hand
    {
        public XRNode node;
        public Transform tf;            // 握持位姿
        public Transform aim;           // 指向（枪口 / 射线）
        public bool tracked;
        public float trigger, grip;
        public Vector2 stick;
        public bool triggerDown, gripDown, primary, secondary, stickClick, menu;
        public bool triggerHit, gripHit, primaryHit, secondaryHit, stickClickHit, menuHit;
        public bool flickL, flickR, flickU, flickD;
        bool pT, pG, pP, pS, pC, pM; Vector2 pStick;
        InputDevice dev;

        public void Poll()
        {
            if (!dev.isValid) dev = InputDevices.GetDeviceAtXRNode(node);
            tracked = dev.isValid;
            trigger = grip = 0; stick = Vector2.zero;
            bool p = false, s = false, c = false, m = false;
            if (tracked)
            {
                dev.TryGetFeatureValue(CommonUsages.trigger, out trigger);
                dev.TryGetFeatureValue(CommonUsages.grip, out grip);
                dev.TryGetFeatureValue(CommonUsages.primary2DAxis, out stick);
                dev.TryGetFeatureValue(CommonUsages.primaryButton, out p);
                dev.TryGetFeatureValue(CommonUsages.secondaryButton, out s);
                dev.TryGetFeatureValue(CommonUsages.primary2DAxisClick, out c);
                dev.TryGetFeatureValue(CommonUsages.menuButton, out m);
                if (dev.TryGetFeatureValue(CommonUsages.devicePosition, out Vector3 pos)) tf.localPosition = pos;
                if (dev.TryGetFeatureValue(CommonUsages.deviceRotation, out Quaternion rot)) tf.localRotation = rot;
            }
            triggerDown = trigger > 0.55f; gripDown = grip > 0.55f;
            primary = p; secondary = s; stickClick = c; menu = m;
            triggerHit = triggerDown && !pT; gripHit = gripDown && !pG; primaryHit = p && !pP; secondaryHit = s && !pS; stickClickHit = c && !pC; menuHit = m && !pM;
            flickR = stick.x > 0.7f && pStick.x <= 0.7f; flickL = stick.x < -0.7f && pStick.x >= -0.7f;
            flickU = stick.y > 0.7f && pStick.y <= 0.7f; flickD = stick.y < -0.7f && pStick.y >= -0.7f;
            pT = triggerDown; pG = gripDown; pP = p; pS = s; pC = c; pM = m; pStick = stick;
        }

        public void Pulse(float amp, float dur)
        {
            if (dev.isValid) dev.SendHapticImpulse(0, Mathf.Clamp01(amp), dur);
        }

        public Vector3 AimPos => aim.position;
        public Vector3 AimDir => aim.forward;
    }

    /// <summary>
    /// 头显 / 手柄追踪与玩家「身体」位置。
    /// origin 是游玩空间原点（脚下），玩家在游戏里的位置 = 头部在地面上的投影；
    /// 摇杆移动 / 分段转身都是移动 origin，使头部落到目标位置。
    /// </summary>
    public class Rig : MonoBehaviour
    {
        public Transform origin, head;
        public Camera cam;
        public Hand left, right;
        public float heightOffset;
        public bool hasXR;
        static readonly List<XRInputSubsystem> subs = new List<XRInputSubsystem>();
        static readonly List<XRDisplaySubsystem> displays = new List<XRDisplaySubsystem>();
        InputDevice headDev;
        float trackingT;

        public static Rig Create()
        {
            var root = new GameObject("Rig");
            var r = root.AddComponent<Rig>();
            r.origin = root.transform;
            var camGo = new GameObject("Head");
            camGo.transform.SetParent(root.transform, false);
            camGo.transform.localPosition = new Vector3(0, Data.EyeHeight, 0);
            r.head = camGo.transform;
            r.cam = camGo.AddComponent<Camera>();
            r.cam.nearClipPlane = 0.06f; r.cam.farClipPlane = 600f;
            r.cam.clearFlags = CameraClearFlags.SolidColor; r.cam.backgroundColor = Color.black;
            r.cam.allowHDR = false; r.cam.allowMSAA = true;
            camGo.tag = "MainCamera";
            camGo.AddComponent<AudioListener>();
            r.left = MakeHand(root.transform, XRNode.LeftHand);
            r.right = MakeHand(root.transform, XRNode.RightHand);
            Application.onBeforeRender += r.UpdateHeadPose;
            return r;
        }

        static Hand MakeHand(Transform parent, XRNode node)
        {
            var go = new GameObject(node.ToString());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = new Vector3(node == XRNode.LeftHand ? -0.25f : 0.25f, 1.2f, 0.35f);
            var aim = new GameObject("Aim");
            aim.transform.SetParent(go.transform, false);
            // 握持位姿的 +Z 沿手柄柄身；指向要再往下压一个角度才和「食指所指」一致
            aim.transform.localRotation = Quaternion.Euler(AimPitch, 0, 0);
            return new Hand { node = node, tf = go.transform, aim = aim.transform };
        }

        /// <summary>握持位姿 → 指向位姿的俯仰修正（度）。可在暂停菜单里微调。</summary>
        public static float AimPitch = 35f;
        public void SetAimPitch(float deg)
        {
            AimPitch = deg;
            left.aim.localRotation = right.aim.localRotation = Quaternion.Euler(deg, 0, 0);
        }

        void OnDestroy() { Application.onBeforeRender -= UpdateHeadPose; }

        void UpdateHeadPose()
        {
            if (!headDev.isValid) headDev = InputDevices.GetDeviceAtXRNode(XRNode.CenterEye);
            if (!headDev.isValid) headDev = InputDevices.GetDeviceAtXRNode(XRNode.Head);
            if (!headDev.isValid) { hasXR = false; return; }
            hasXR = true;
            if (headDev.TryGetFeatureValue(CommonUsages.centerEyePosition, out Vector3 p) || headDev.TryGetFeatureValue(CommonUsages.devicePosition, out p))
                head.localPosition = p + new Vector3(0, heightOffset, 0);
            if (headDev.TryGetFeatureValue(CommonUsages.centerEyeRotation, out Quaternion q) || headDev.TryGetFeatureValue(CommonUsages.deviceRotation, out q))
                head.localRotation = q;
        }

        public void Poll(float dt)
        {
            trackingT -= dt;
            if (trackingT <= 0)
            {
                trackingT = 2f;
                SubsystemManager.GetSubsystems(subs);
                foreach (var s in subs) if (s.GetTrackingOriginMode() != TrackingOriginModeFlags.Floor) s.TrySetTrackingOriginMode(TrackingOriginModeFlags.Floor);
            }
            UpdateHeadPose();
            left.Poll(); right.Poll();
        }

        /// <summary>坐着玩 / 无地面追踪时补到站立视线高度。</summary>
        public void Calibrate()
        {
            float y = head.localPosition.y - heightOffset;
            heightOffset = y < 1.3f ? 1.6f - y : 0f;
            UpdateHeadPose();
        }

        // ---------------- 身体位置（头部在地面的投影）
        public Vector3 Feet
        {
            get { var p = head.position; return new Vector3(p.x, origin.position.y, p.z); }
        }
        public float Yaw => head.eulerAngles.y;
        public Vector3 FlatForward { get { var f = head.forward; f.y = 0; return f.sqrMagnitude > 0.001f ? f.normalized : origin.forward; } }

        public void MoveFeetTo(Vector3 feet)
        {
            var d = feet - Feet;
            origin.position += new Vector3(d.x, feet.y - origin.position.y, d.z);
        }

        /// <summary>把玩家摆到指定位置并朝向指定角度（以头部为准）。</summary>
        public void Teleport(Vector3 feet, float yawDeg)
        {
            origin.RotateAround(head.position, Vector3.up, yawDeg - Yaw);
            MoveFeetTo(feet);
        }

        public void SnapTurn(float deg) { origin.RotateAround(head.position, Vector3.up, deg); }

        /// <summary>设置渲染分辨率比例（动态分辨率）。</summary>
        public static void SetRenderScale(float s)
        {
            if (Mathf.Abs(XRSettings.renderViewportScale - s) > 0.01f) XRSettings.renderViewportScale = s;
        }

        public static float RefreshRate()
        {
            SubsystemManager.GetSubsystems(displays);
            foreach (var d in displays) if (d.running && d.TryGetDisplayRefreshRate(out float hz) && hz > 1) return hz;
            return 72f;
        }
    }
}
