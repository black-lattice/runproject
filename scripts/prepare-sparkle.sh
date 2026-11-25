#!/usr/bin/env bash
# Run before Tauri bundles/signs the app, from the repository root.
set -euo pipefail
arch=$1
sdk="$RUNNER_TEMP/sparkle"
mkdir -p "$sdk"
curl --fail --location --silent --show-error --retry 3 \
  https://github.com/sparkle-project/Sparkle/releases/download/2.10.1/Sparkle-2.10.1.tar.xz -o "$sdk/sdk.tar.xz"
(cd "$sdk" && echo '1a856d2a9edb8e628de88121d7be04cf0e2167f8641650b78fca00b14244cf27  sdk.tar.xz' | shasum -a 256 -c - && tar -xf sdk.tar.xz)

# Tauri signs standard Frameworks/XPCServices subdirectories. Sparkle also
# ships these two executables directly under the framework version directory.
identity=${SIGNING_IDENTITY:--}
framework="$sdk/Sparkle.framework/Versions/Current"
if [[ "$identity" != "-" ]]; then
  codesign --force --options runtime --timestamp --sign "$identity" "$framework/Autoupdate"
  codesign --force --options runtime --timestamp --sign "$identity" "$framework/Updater.app"
fi

python3 - "$sdk" "$arch" "$identity" <<'PY'
import base64, json, os, pathlib, plistlib, sys
sdk = pathlib.Path(sys.argv[1])
arch, identity = sys.argv[2:]
assert arch in ("x64", "aarch64")
key = pathlib.Path("src-tauri/sparkle-public-key.txt").read_text().strip()
assert len(base64.b64decode(key, validate=True)) == 32
info = sdk / "Info.plist"
with info.open("wb") as f:
    plistlib.dump({
        "SUFeedURL": f"https://github.com/{os.environ['GITHUB_REPOSITORY']}/releases/latest/download/appcast-{arch}.xml",
        "SUPublicEDKey": key,
        "SURequireSignedFeed": True,
        "SUVerifyUpdateBeforeExtraction": True,
    }, f)
macos = {"frameworks": [str(sdk / "Sparkle.framework")], "infoPlist": str(info),
         "minimumSystemVersion": "12.0", "signingIdentity": identity}
if identity == "-":
    # Ad-hoc binaries have no Team ID for hardened runtime library validation.
    entitlements = sdk / "adhoc.entitlements"
    with entitlements.open("wb") as f:
        plistlib.dump({"com.apple.security.cs.disable-library-validation": True}, f)
    macos["entitlements"] = str(entitlements)
(sdk / "config.json").write_text(json.dumps({"bundle": {"macOS": macos}}))
PY
echo "args=--config $sdk/config.json" >> "$GITHUB_OUTPUT"
