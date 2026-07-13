#!/usr/bin/env bash
set -euo pipefail

if [[ ! -d ios ]]; then
  npx cap add ios
fi

npx cap sync ios

PLIST="ios/App/App/Info.plist"
PROJECT="ios/App/App.xcodeproj/project.pbxproj"
ENTITLEMENTS="ios/App/App/App.entitlements"

set_plist_string() {
  local key="$1"
  local value="$2"
  /usr/libexec/PlistBuddy -c "Set :${key} ${value}" "$PLIST" 2>/dev/null || \
    /usr/libexec/PlistBuddy -c "Add :${key} string ${value}" "$PLIST"
}

set_plist_string "NSCameraUsageDescription" "VITA.IO 使用前置摄像头在设备本地分析肤色微变化，用于估算运动与恢复趋势。"
set_plist_string "NSHealthShareUsageDescription" "VITA.IO 在你授权后读取选定的健康指标，用于建立个人恢复基线。"
set_plist_string "NSHealthUpdateUsageDescription" "VITA.IO 在你授权后写入心率、HRV 与呼吸率，不写入原始视频。"

cat > "$ENTITLEMENTS" <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.developer.healthkit</key>
  <true/>
</dict>
</plist>
EOF

if ! grep -q "CODE_SIGN_ENTITLEMENTS = App/App.entitlements" "$PROJECT"; then
  perl -0pi -e 's/CODE_SIGN_STYLE = Automatic;/CODE_SIGN_ENTITLEMENTS = App\/App.entitlements;\n\t\t\t\tCODE_SIGN_STYLE = Automatic;/g' "$PROJECT"
fi

plutil -lint "$PLIST"
plutil -lint "$ENTITLEMENTS"
