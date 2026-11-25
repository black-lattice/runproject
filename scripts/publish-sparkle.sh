#!/usr/bin/env bash
# Sign the exact DMG already uploaded by tauri-action.
set -euo pipefail
arch=$1
target=$2
version=${GITHUB_REF_NAME#v}
sdk="$RUNNER_TEMP/sparkle"
out="$RUNNER_TEMP/update"
asset="RunProject_${version}_darwin_${arch}.dmg"
appcast="appcast-${arch}.xml"
base="https://github.com/$GITHUB_REPOSITORY/releases/download/$GITHUB_REF_NAME/"
mkdir -p "$out"

dmg=(src-tauri/target/"$target"/release/bundle/dmg/*.dmg)
[[ ${#dmg[@]} == 1 && -f "${dmg[0]}" ]]
cp "${dmg[0]}" "$out/$asset"
digest=$(gh release view "$GITHUB_REF_NAME" --json assets --jq ".assets[] | select(.name == \"$asset\") | .digest")
[[ "$digest" == "sha256:$(shasum -a 256 "$out/$asset" | cut -d' ' -f1)" ]]
# DMG-only builds remove the intermediate .app. Verify the shipped bundle.
mountpoint=$(mktemp -d "$RUNNER_TEMP/sparkle-dmg.XXXXXXXX")
hdiutil attach -readonly -nobrowse -mountpoint "$mountpoint" "$out/$asset" >/dev/null
trap 'hdiutil detach "$mountpoint" >/dev/null' EXIT
app="$mountpoint/RunProject.app"
codesign --verify --deep --strict "$app"
[[ -L "$app/Contents/Frameworks/Sparkle.framework/Versions/Current" ]]
[[ "$(plutil -extract SUPublicEDKey raw "$app/Contents/Info.plist")" == "$(cat src-tauri/sparkle-public-key.txt)" ]]
[[ "$(plutil -extract SUFeedURL raw "$app/Contents/Info.plist")" == "https://github.com/$GITHUB_REPOSITORY/releases/latest/download/$appcast" ]]
hdiutil detach "$mountpoint" >/dev/null
trap - EXIT
rmdir "$mountpoint" 2>/dev/null || true
if [[ -f "docs/releases/$GITHUB_REF_NAME.md" ]]; then
  cp "docs/releases/$GITHUB_REF_NAME.md" "$out/${asset%.dmg}.md"
fi
printf '%s\n' "${SPARKLE_PRIVATE_KEY:?missing Sparkle signing key}" | "$sdk/bin/generate_appcast" \
  --ed-key-file - --maximum-deltas 0 --embed-release-notes --download-url-prefix "$base" -o "$out/$appcast" "$out"

# Validate the feed actually advertises this asset and verify its signature
# with the embedded *public* key, independently of the injected private key.
python3 - "$out/$appcast" "$base$asset" "$out/$asset" "$version" <<'PY'
import pathlib, sys, xml.etree.ElementTree as ET
feed, url, dmg, version = sys.argv[1:]
ns = {"s": "http://www.andymatuschak.org/xml-namespaces/sparkle"}
item, = ET.parse(feed).findall("./channel/item")
assert item.findtext("s:version", namespaces=ns) == version
assert item.findtext("s:minimumSystemVersion", namespaces=ns).split(".")[:2] == ["12", "0"]
enc = item.find("enclosure")
assert enc.get("url") == url and int(enc.get("length")) == pathlib.Path(dmg).stat().st_size
pathlib.Path(dmg + ".sig").write_text(enc.attrib["{" + ns["s"] + "}edSignature"])
PY
node --input-type=module - "$out/$asset" <<'JS'
import { readFileSync } from 'node:fs';
import { createPublicKey, verify } from 'node:crypto';
const dmg = process.argv[2];
const x = Buffer.from(readFileSync('src-tauri/sparkle-public-key.txt','utf8').trim(),'base64').toString('base64url');
const key = createPublicKey({key: {kty:'OKP', crv:'Ed25519', x}, format:'jwk'});
if (!verify(null, readFileSync(dmg), key, Buffer.from(readFileSync(dmg+'.sig','utf8'),'base64'))) throw Error('Sparkle update signature mismatch');
JS
printf '%s\n' "$SPARKLE_PRIVATE_KEY" | "$sdk/bin/sign_update" --ed-key-file - --verify "$out/$appcast"
gh release upload "$GITHUB_REF_NAME" "$out/$appcast" --clobber
