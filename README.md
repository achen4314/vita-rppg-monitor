# VITA.IO rPPG Monitor

本项目是一个本地 rPPG 心率与运动恢复应用。React、POS/FFT/滤波和 MediaPipe 代码同时服务于 Web/PWA 与 Capacitor 原生应用；视频帧始终在设备本地处理，不上传摄像头画面。

线上地址：<https://achen4314.github.io/>

## 手机安装

Android Chrome / Edge：

1. 打开 <https://achen4314.github.io/>
2. 点浏览器菜单。
3. 选择“安装应用”或“添加到主屏幕”。
4. 安装后从桌面图标打开。

iPhone Safari：

1. 打开 <https://achen4314.github.io/>
2. 点分享按钮。
3. 选择“添加到主屏幕”。
4. 从桌面图标打开。

测量记录会保存在当前手机浏览器/安装应用的本地 IndexedDB 中，不上传服务器。

## 启动

```bash
npm install
npm run dev
```

打开 `http://127.0.0.1:5173/`，点击 `START`，允许摄像头权限。

## 原生 App 路径

当前采用 Capacitor 8 单代码库方案：

```text
React + TypeScript + rPPG
          |
       npm build
          |
        dist
       /    \
Android     iOS
WebView     WKWebView
```

Android 原生工程已位于 `android/`，包名为 `io.vita.rppg`。摄像头权限、前置摄像头能力、深色状态栏、启动页、应用图标、触觉反馈和安全 WebView 已配置。

### Android 本地构建

要求 Node.js 22、Android Studio、JDK 21 与 Android SDK 36：

```bash
npm ci
npm run app:sync
npm run android:open
```

在 Android Studio 中连接手机后点击 Run。也可以直接生成调试 APK：

```bash
npm run android:apk
```

产物位于 `android/app/build/outputs/apk/debug/app-debug.apk`。

仓库同时提供 `.github/workflows/android-apk.yml`。推送到 `main` 后会自动构建 APK，可在 GitHub Actions 的 `vita-io-android-debug` artifact 中下载。

### 商店发布

Android 上架需要创建签名密钥、生成 release AAB、在 Google Play Console 配置隐私政策和数据安全声明。调试 APK 只用于测试，不用于正式上架。

iOS 使用相同 Web 代码，但原生工程必须在 macOS/Xcode 上创建、签名和归档：安装 `@capacitor/ios`、执行 `npx cap add ios` 与 `npx cap sync ios`，然后在 Xcode 配置相机用途说明、开发者团队和 App Store Connect。

### 数据与健康平台

- 当前：档案、测量、HRV、呼吸率与训练日志保存在本机 IndexedDB，可导出 JSON/CSV。
- 下一阶段：Android 接入 Health Connect，iOS 接入 HealthKit；只同步用户授权的指标，不同步原始视频帧。
- 正式版建议将结构化数据迁移到加密 SQLite，并保留用户控制的导入、导出和清除入口。

## 摄像头权限

页面显示 `CAMERA ALLOWED` 但下拉框仍显示未检测到摄像头时，说明浏览器权限不是问题，当前系统/浏览器没有暴露任何视频输入设备。此时点击 `START` 会出现 `NotFoundError: Requested device not found`。

这时按下面顺序检查：

1. 打开 Windows 自带“相机”应用，确认能看到实时画面。
2. 如果相机应用也不可用，检查笔记本摄像头物理遮挡片、摄像头快捷键、BIOS/UEFI 摄像头开关或设备管理器驱动。
3. 如果使用 USB 摄像头，重新插拔到另一个 USB 口，并确认设备管理器中出现 Cameras / Imaging devices / USB Video Device。
4. Windows 设置中确认 `隐私和安全性 -> 相机 -> 相机访问`、`允许应用访问相机`、`允许桌面应用访问相机` 都已打开。
5. 关闭可能占用摄像头的软件，例如 Teams、Zoom、微信、腾讯会议、浏览器其他标签页。

如果页面显示 `CAMERA BLOCKED`：

1. 点击浏览器地址栏左侧的站点权限图标。
2. 将摄像头改为允许。
3. 刷新页面后重新点击 `START`。

如果显示未检测到摄像头：

1. 确认摄像头已连接。
2. 关闭正在占用摄像头的软件。
3. 点击页面顶部刷新按钮重新扫描设备。
4. 在摄像头下拉框中选择正确设备后点击 `START`。

## 验证方式

有摄像头时：

1. 顶部状态应显示 `CAMERA ALLOWED`。
2. 摄像头下拉框应显示至少一个视频输入。
3. 点击 `START` 后，左侧应出现实时画面和 ROI 框。
4. 前 5 秒显示 `CAL · WARMING UP`，之后输出 BPM、皮肤频谱峰和历史趋势。

没有摄像头时：

1. 点击 `DEMO`。
2. 左侧会显示合成脸部和 ROI 框。
3. 5 秒校准后，心率应稳定在约 72 BPM。
4. 皮肤频谱峰应接近 72 BPM，SNR 应明显高于背景对照。

## 使用建议

- 正脸面对摄像头，保持 10-20 秒静止。
- 让额头和双颊处于稳定、均匀的正面光照下。
- 避免强背光、频闪灯、剧烈表情和快速头部运动。
- 本 app 不是医疗器械，不能替代专业医疗设备。
