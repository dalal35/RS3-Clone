; Rename only shortcuts belonging to the executable being upgraded.
; Existing shortcuts are migrated even in /UPDATE or /NS mode; absent ones stay absent.
!macro TTT_RENAME_LEGACY_SHORTCUT ROOT
  !insertmacro IsShortcutTarget "${ROOT}\Apex Telemetry.lnk" "$INSTDIR\${MAINBINARYNAME}.exe"
  Pop $0
  ${If} $0 = 1
    !insertmacro UnpinShortcut "${ROOT}\Apex Telemetry.lnk"
    ${If} ${FileExists} "${ROOT}\${PRODUCTNAME}.lnk"
      Delete "${ROOT}\Apex Telemetry.lnk"
    ${Else}
      Rename "${ROOT}\Apex Telemetry.lnk" "${ROOT}\${PRODUCTNAME}.lnk"
      !insertmacro SetLnkAppUserModelId "${ROOT}\${PRODUCTNAME}.lnk"
    ${EndIf}
  ${EndIf}
!macroend

!macro NSIS_HOOK_POSTINSTALL
  !insertmacro TTT_RENAME_LEGACY_SHORTCUT "$SMPROGRAMS"
  !insertmacro TTT_RENAME_LEGACY_SHORTCUT "$DESKTOP"
!macroend
