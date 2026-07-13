# VITA.IO 发布清单

## Android

- 包名：`io.vita.rppg`
- 当前版本：`1.0.0`，`versionCode 1`
- 最低系统：Android 9 / API 28（Health Connect 基线）
- 调试 APK：已通过 GitHub Actions 构建
- 发布流水线：`.github/workflows/android-release.yml`
- 商店产物：签名 Android App Bundle (`.aab`)

发布前必须完成：

1. 创建并离线备份 upload keystore。
2. 在 GitHub 配置 `ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`、`ANDROID_KEYSTORE_TYPE`。
3. 手动运行 `Build Android Release`，递增 `version_code`。
4. 在 Play Console 启用 Play App Signing 并上传签名 AAB。
5. 填写 Data Safety、Health apps declaration、内容分级和隐私政策 URL。
6. 先发布到 Internal testing，完成至少两台真机的相机和性能验收。

## iOS

- Bundle ID：`io.vita.rppg`
- 需要 macOS 26、Xcode 26、Apple Developer Program 和 App Store Connect 权限
- 必须配置相机用途说明、HealthKit capability、Health Share/Update 用途说明
- App Store Connect 必须提供隐私政策 URL、App Privacy 回答、截图和审核说明
- 先经 TestFlight 内部测试，再提交 App Review

## 真机验收

1. 室内均匀光、窗边自然光、户外阴影三类环境各测 5 次。
2. 与胸带或经验证的指夹设备同步对照，记录 MAE、掉线率和首次稳定时间。
3. 覆盖至少一台中端 Android、一台旗舰 Android 和一台 iPhone。
4. 验证拒绝权限、撤销权限、后台恢复、锁屏、横竖屏、无网络和低电量状态。
5. 验证导出、清除、卸载重装和系统健康库撤权。

## 商店文案边界

- 定位为运动与恢复趋势工具，不宣称诊断、治疗或医疗级精度。
- 展示“视频仅在本机处理”，但不得暗示所有结构化数据永远不会同步；开启健康平台或云同步时需单独说明。
- HRV 与呼吸率仅在满足时长和信号质量阈值时展示，并标注趋势参考。
