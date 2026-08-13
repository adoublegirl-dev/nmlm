!macro customInstall
  DetailPrint "Installing Niuma Union core files..."
  DetailPrint "Configuring local data directories and shortcuts..."
  DetailPrint "User ledger and evidence data are stored outside the installation directory."
!macroend

!macro customUnInstall
  ${ifNot} ${isUpdated}
    MessageBox MB_YESNO|MB_ICONQUESTION "Remove local settings and ledger database? External evidence library files will never be deleted." /SD IDNO IDNO keepUserData
    RMDir /r "$APPDATA\${APP_PRODUCT_FILENAME}"
    keepUserData:
  ${endIf}
!macroend
