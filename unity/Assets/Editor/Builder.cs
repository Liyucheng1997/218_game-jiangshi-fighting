using System;
using System.IO;
using UnityEditor;
using UnityEditor.Build;
using UnityEditor.SceneManagement;
using UnityEditor.XR.Management;
using UnityEditor.XR.Management.Metadata;
using UnityEditor.XR.OpenXR.Features;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.XR.Management;
using UnityEngine.XR.OpenXR;
using UnityEngine.XR.OpenXR.Features;

/// <summary>
/// 命令行构建（不开编辑器界面）：
///   Unity.exe -batchmode -quit -projectPath unity -buildTarget android -executeMethod Builder.Configure
///   Unity.exe -batchmode -quit -projectPath unity -buildTarget android -executeMethod Builder.Build
/// Configure 写工程设置 + 启用 OpenXR / PICO；Build 出 APK。分两次跑，让设置资产先落盘。
/// </summary>
public static class Builder
{
    const string Scene = "Assets/Scenes/Main.unity";
    const string XrKey = "com.unity.xr.management.loader_settings";
    const BuildTargetGroup G = BuildTargetGroup.Android;

    public static void Configure()
    {
        try
        {
            PlayerSettings.companyName = "liyucheng";
            PlayerSettings.productName = "真理斗僵尸 VR";
            PlayerSettings.bundleVersion = "0.1.0";
            PlayerSettings.SetApplicationIdentifier(NamedBuildTarget.Android, "com.liyucheng.zombiestrike.unity");
            PlayerSettings.SetScriptingBackend(NamedBuildTarget.Android, ScriptingImplementation.IL2CPP);
            PlayerSettings.Android.targetArchitectures = AndroidArchitecture.ARM64;
            PlayerSettings.Android.minSdkVersion = (AndroidSdkVersions)29;
            PlayerSettings.Android.applicationEntry = AndroidApplicationEntry.Activity;
            PlayerSettings.defaultInterfaceOrientation = UIOrientation.LandscapeLeft;
            PlayerSettings.colorSpace = ColorSpace.Gamma;
            PlayerSettings.SetUseDefaultGraphicsAPIs(BuildTarget.Android, false);
            PlayerSettings.SetGraphicsAPIs(BuildTarget.Android, new[] { GraphicsDeviceType.OpenGLES3 });
            PlayerSettings.SetManagedStrippingLevel(NamedBuildTarget.Android, ManagedStrippingLevel.Low);
            PlayerSettings.stripEngineCode = false;
            QualitySettings.antiAliasing = 4;
            QualitySettings.shadows = ShadowQuality.Disable;
            QualitySettings.vSyncCount = 0;

            // 新输入系统（OpenXR 插件要求）；游戏本身只用 UnityEngine.XR.InputDevices
            var ps = AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0];
            var so = new SerializedObject(ps);
            var aih = so.FindProperty("activeInputHandler");
            if (aih != null) { aih.intValue = 1; so.ApplyModifiedPropertiesWithoutUndo(); }

            // 空场景：所有东西由 Boot 在运行时用代码搭出来
            if (!File.Exists(Scene))
            {
                Directory.CreateDirectory("Assets/Scenes");
                var s = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                EditorSceneManager.SaveScene(s, Scene);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(Scene, true) };

            // XR：OpenXR 加载器 + PICO 功能
            if (!EditorBuildSettings.TryGetConfigObject(XrKey, out XRGeneralSettingsPerBuildTarget per) || per == null)
            {
                per = ScriptableObject.CreateInstance<XRGeneralSettingsPerBuildTarget>();
                Directory.CreateDirectory("Assets/XR");
                AssetDatabase.CreateAsset(per, "Assets/XR/XRGeneralSettingsPerBuildTarget.asset");
                EditorBuildSettings.AddConfigObject(XrKey, per, true);
            }
            if (!per.HasSettingsForBuildTarget(G)) per.CreateDefaultSettingsForBuildTarget(G);
            if (!per.HasManagerSettingsForBuildTarget(G)) per.CreateDefaultManagerSettingsForBuildTarget(G);
            var gs = per.SettingsForBuildTarget(G);
            gs.InitManagerOnStart = true;
            bool assigned = XRPackageMetadataStore.AssignLoader(gs.Manager, "UnityEngine.XR.OpenXR.OpenXRLoader", G);
            Debug.Log("[Builder] OpenXR loader assigned: " + assigned + " loaders=" + gs.Manager.activeLoaders.Count);

            FeatureHelpers.RefreshFeatures(G);
            var oxr = OpenXRSettings.GetSettingsForBuildTargetGroup(G);
            if (oxr == null) throw new Exception("OpenXRSettings missing for Android");
            oxr.renderMode = OpenXRSettings.RenderMode.SinglePassInstanced;
            foreach (var f in oxr.GetFeatures())
            {
                var info = f.GetType().FullName + " id=" + GetFeatureId(f);
                string id = GetFeatureId(f) ?? "";
                bool want = id == "com.unity.openxr.feature.pico" || id == "com.unity.openxr.pico.features" || id == "com.unity.openxr.feature.input.PICONeo3touch"
                    || id.IndexOf("pico4touch", StringComparison.OrdinalIgnoreCase) >= 0;
                if (want) { f.enabled = true; EditorUtility.SetDirty(f); }
                Debug.Log("[Builder] feature " + info + " enabled=" + f.enabled);
            }
            EditorUtility.SetDirty(oxr); EditorUtility.SetDirty(gs); EditorUtility.SetDirty(gs.Manager); EditorUtility.SetDirty(per);
            AssetDatabase.SaveAssets();
            Debug.Log("[Builder] Configure done");
        }
        catch (Exception e)
        {
            Debug.LogError("[Builder] Configure failed: " + e);
            EditorApplication.Exit(1);
        }
    }

    static string GetFeatureId(OpenXRFeature f)
    {
        foreach (var a in f.GetType().GetCustomAttributes(false))
        {
            var p = a.GetType().GetField("FeatureId");
            if (p != null) return p.GetValue(a) as string;
        }
        return null;
    }

    public static void Build()
    {
        try
        {
            Directory.CreateDirectory("Build");
            var opt = new BuildPlayerOptions
            {
                scenes = new[] { Scene },
                locationPathName = "Build/zombie-strike-vr-native.apk",
                target = BuildTarget.Android,
                options = BuildOptions.None,
            };
            var report = BuildPipeline.BuildPlayer(opt);
            Debug.Log("[Builder] result=" + report.summary.result + " size=" + report.summary.totalSize + " errors=" + report.summary.totalErrors);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
        }
        catch (Exception e)
        {
            Debug.LogError("[Builder] Build failed: " + e);
            EditorApplication.Exit(1);
        }
    }
}
