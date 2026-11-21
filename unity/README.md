# 真理斗僵尸 VR · 原生版（Unity）

原生 VR 版本，不经过浏览器。Unity 6000.6 + OpenXR + PICO OpenXR 插件，目标设备 Pico Neo 3。

场景、模型、着色器、音效全部由代码在运行时生成，工程里没有美术素材，也不需要打开编辑器界面。

## 实测（Pico Neo 3，PICO OS 5.13.3）

- 稳定 90 帧，每帧 CPU 约 1.2 ms、GPU 约 2.3 ms
- 头显必须先登录 PICO 账号：未登录时系统会在启动瞬间关闭 VR 类应用并弹出登录窗口

## 构建

安卓构建工具不支持中文路径，先给本目录建一个纯英文路径的目录联接，之后都从联接路径构建：

```powershell
cmd /c mklink /J F:\zsvr-unity "F:\我的编程项目\208_真理斗僵尸\unity"
```

第一次（或改了工程设置后）先跑 Configure，再跑 Build：

```powershell
& "F:\Unity\Editor\6000.6.0f1\Editor\Unity.exe" -batchmode -quit -projectPath F:\zsvr-unity -buildTarget android -executeMethod Builder.Configure -logFile F:\zsvr-unity\Logs\configure.log
```

```powershell
& "F:\Unity\Editor\6000.6.0f1\Editor\Unity.exe" -batchmode -quit -projectPath F:\zsvr-unity -buildTarget android -executeMethod Builder.Build -logFile F:\zsvr-unity\Logs\build.log
```

产物在 `Build/zombie-strike-vr-native.apk`，安装：

```powershell
adb install -r F:\zsvr-unity\Build\zombie-strike-vr-native.apk
```

构建日志里 `Pico.Platform.Editor.PlatformPreprocessor` 的 NullReferenceException 来自 PICO 插件（没填平台 App ID），不影响构建结果。

## 已有内容

义庄场景、15 种邪祟与 5 个首领、6 把武器、火符与天师降魔、9 种道术、14 种修身被动、四章波次与无尽轮回、四档难度、局外修行与存档、菜单与随头显示。

## 尚未移植

剧情对白与过场、残卷、成就、图鉴、法宝与进阶道法、首领破绽槽。模型是重新做的简化版，没有沿用网页版的骨骼模型。

## 代码结构

`Assets/Scripts`（命名空间 `ZS`）：`Game` 状态机与界面、`Director` 波次、`Enemies` / `EnemyModels` 敌人、`Player` 与武器、`Skills` 道术与卡牌、`World` 场景、`Rig` 头显与手柄、`UI`、`Fx` 粒子、`Sfx` 合成音效、`Gfx` 网格与材质、`Data` 数值表。

`Assets/Editor/Builder.cs` 是命令行构建入口。
