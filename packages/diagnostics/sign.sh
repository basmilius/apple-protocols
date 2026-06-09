codesign --deep --force -vvvv --sign "${APPLE_DEVELOPER_ID}" --entitlements entitlements.plist ./dist/ap-diagnostics-macos-arm64
codesign --deep --force -vvvv --sign "${APPLE_DEVELOPER_ID}" --entitlements entitlements.plist ./dist/ap-diagnostics-macos-x64
