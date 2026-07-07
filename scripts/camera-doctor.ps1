$ErrorActionPreference = "SilentlyContinue"

Write-Host "VITA.IO Camera Doctor"
Write-Host "======================"
Write-Host ""

$webcamHKCU = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam"
$webcamHKLM = Get-ItemProperty -Path "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam"
$nonPackaged = Get-ItemProperty -Path "HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\webcam\NonPackaged"

Write-Host "[1] Windows camera privacy"
$computerSystem = Get-CimInstance Win32_ComputerSystem
Write-Host ("  Computer model:             " + $computerSystem.Manufacturer + " " + $computerSystem.Model)
Write-Host ("  Current user webcam access: " + ($(if ($webcamHKCU.Value) { $webcamHKCU.Value } else { "unknown" })))
Write-Host ("  Machine webcam access:      " + ($(if ($webcamHKLM.Value) { $webcamHKLM.Value } else { "unknown" })))
Write-Host ("  Desktop apps access:        " + ($(if ($nonPackaged.Value) { $nonPackaged.Value } else { "not recorded" })))
Write-Host ""

$cameraDevices = Get-CimInstance Win32_PnPEntity |
  Where-Object {
    $_.Name -match "Camera|Webcam|USB Video|UVC|Image|Imaging|摄像|相机" -or
    $_.Description -match "Camera|Webcam|USB Video|UVC|Image|Imaging|摄像|相机" -or
    $_.PNPClass -match "Camera|Image"
  } |
  Select-Object Name, Description, PNPClass, Status, Present, DeviceID

Write-Host "[2] Windows detected camera devices"
if ($cameraDevices) {
  $cameraDevices | Format-Table -AutoSize
} else {
  Write-Host "  No Camera / Imaging / UVC / USB Video devices detected."
}
Write-Host ""

$connectedMatches = pnputil /enum-devices /connected |
  Select-String -Pattern "Camera|Webcam|USB Video|UVC|Image|Imaging|摄像|相机" -Context 1,3

Write-Host "[3] PnP connected device scan"
if ($connectedMatches) {
  $connectedMatches | ForEach-Object { Write-Host $_.ToString() }
} else {
  Write-Host "  No connected camera-like PnP device found."
}
Write-Host ""

Write-Host "[4] Result"
if (-not $cameraDevices -and -not $connectedMatches) {
  Write-Host "  Windows is not exposing a camera device right now."
  Write-Host "  Browser site permission can be allowed and getUserMedia will still fail with NotFoundError."
  if ($computerSystem.Manufacturer -match "ASUS" -and $computerSystem.Model -match "G533QS") {
    Write-Host ""
    Write-Host "  Note: This ASUS ROG Strix/SCAR G533QS model is commonly sold without a built-in webcam."
    Write-Host "  If Device Manager has no camera entry, use an external USB/UVC webcam or phone-as-webcam."
  }
  Write-Host ""
  Write-Host "  Next checks:"
  Write-Host "  - Open the Windows Camera app and confirm it shows live video."
  Write-Host "  - Check Device Manager for Cameras / Imaging devices / USB Video Device."
  Write-Host "  - Re-enable any physical privacy shutter or Fn camera hotkey."
  Write-Host "  - Reinstall the laptop/vendor camera driver or reconnect the USB camera."
  Write-Host "  - Restart the browser after Windows detects the camera."
} else {
  Write-Host "  Windows sees at least one camera-like device."
  Write-Host "  If the app still shows 0 VIDEO INPUT, restart the browser and refresh http://127.0.0.1:5173/."
}
