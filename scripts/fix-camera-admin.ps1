$ErrorActionPreference = "Continue"

Write-Host "VITA.IO Camera Admin Repair"
Write-Host "==========================="
Write-Host ""

$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Write-Host "This script must run as Administrator."
  Write-Host "Close this window and run:"
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts\fix-camera-admin.ps1"
  Pause
  exit 1
}

Write-Host "[1] Starting camera-related Windows services..."
$services = @("camsvc", "FrameServer", "FrameServerMonitor", "StiSvc")
foreach ($service in $services) {
  try {
    Set-Service -Name $service -StartupType Manual -ErrorAction SilentlyContinue
    Start-Service -Name $service -ErrorAction SilentlyContinue
  } catch {
    Write-Host ("  " + $service + ": " + $_.Exception.Message)
  }
}

Get-CimInstance Win32_Service |
  Where-Object { $_.Name -in $services } |
  Select-Object Name, DisplayName, State, StartMode |
  Format-Table -AutoSize

Write-Host ""
Write-Host "[2] Scanning Plug and Play hardware..."
pnputil /scan-devices

Write-Host ""
Write-Host "[3] Camera-like devices after scan..."
$cameraDevices = Get-CimInstance Win32_PnPEntity |
  Where-Object {
    $_.Name -match "Camera|Webcam|USB Video|UVC|Image|Imaging|摄像|相机" -or
    $_.Description -match "Camera|Webcam|USB Video|UVC|Image|Imaging|摄像|相机" -or
    $_.PNPClass -match "Camera|Image"
  } |
  Select-Object Name, Description, PNPClass, Status, Present, DeviceID

if ($cameraDevices) {
  $cameraDevices | Format-Table -AutoSize
  Write-Host ""
  Write-Host "Camera-like device detected. Restart Edge/Chrome, then refresh http://127.0.0.1:5173/"
} else {
  Write-Host "No Camera / Imaging / UVC / USB Video device detected after admin scan."
  Write-Host ""
  Write-Host "This points to hardware/driver/BIOS/privacy-shutter state, not browser permission."
  Write-Host "Open Device Manager and install/re-enable the camera driver, or reconnect a USB camera."
}

Write-Host ""
Pause
