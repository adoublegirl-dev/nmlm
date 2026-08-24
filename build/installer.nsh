!include LogicLib.nsh

!macro customInit
  nsExec::ExecToStack 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "if (Get-Process -Name ''牛马联盟'' -ErrorAction SilentlyContinue) { exit 0 } else { exit 1 }"'
  Pop $0
  Pop $1
  ${If} $0 == 0
    MessageBox MB_YESNO|MB_ICONEXCLAMATION "检测到 牛马联盟 正在运行。安装/升级前需要先关闭正在运行的程序。\r\n\r\n是否由安装程序自动停止它并继续？" IDYES stopNiuma IDNO abortInstall
    abortInstall:
      Abort "请先关闭 牛马联盟 后再运行安装程序。"
    stopNiuma:
      DetailPrint "Stopping running 牛马联盟 processes..."
      nsExec::ExecToLog 'powershell.exe -NoProfile -ExecutionPolicy Bypass -Command "Get-Process -Name ''牛马联盟'' -ErrorAction SilentlyContinue | Stop-Process -Force"'
      Sleep 1200
  ${EndIf}
!macroend

!macro customInstall
  DetailPrint "Installing Niuma Union core files..."
  DetailPrint "Configuring local data directories and shortcuts..."
  DetailPrint "User ledger and evidence data are stored outside the installation directory."
  DetailPrint "Shortcut icons are recreated by the installer when possible."
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Remove local settings and ledger database? External evidence library files will never be deleted." /SD IDNO IDNO keepUserData
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    keepUserData:
  ${endIf}
!macroend
