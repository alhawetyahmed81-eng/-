#!/usr/bin/env bash
set -euo pipefail

# Build InteriorX Android Release APK & Play Store AAB
# Requirements on build machine: Node.js 20+, Java JDK 17 or 21, Android SDK (ANDROID_HOME)

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

echo "==> 1. Building production web bundle (dist/) & syncing Capacitor Android..."
npm run build
npx cap sync android

echo "==> 2. Checking signing keystore..."
KEYSTORE_PROPS="$ROOT_DIR/android/keystore.properties"
KEYSTORE_FILE="$ROOT_DIR/android/interiorx-release.jks"

if [ ! -f "$KEYSTORE_PROPS" ] && [ ! -f "$KEYSTORE_FILE" ]; then
  echo "No release keystore found. Generating a new upload keystore at android/interiorx-release.jks..."
  read -r -p "Enter keystore password (min 6 chars): " KS_PASS
  read -r -p "Enter key alias [interiorx-key]: " KS_ALIAS
  KS_ALIAS="${KS_ALIAS:-interiorx-key}"
  keytool -genkeypair -v \
    -keystore "$KEYSTORE_FILE" \
    -alias "$KS_ALIAS" \
    -keyalg RSA -keysize 2048 -validity 10000 \
    -storepass "$KS_PASS" -keypass "$KS_PASS" \
    -dname "CN=InteriorX, OU=Mobile, O=InteriorX, L=Cairo, S=Cairo, C=EG"

  cat > "$KEYSTORE_PROPS" <<EOF
storeFile=interiorx-release.jks
storePassword=$KS_PASS
keyAlias=$KS_ALIAS
keyPassword=$KS_PASS
EOF
  echo "Saved signing config to android/keystore.properties (keep this file & .jks safe and backed up!)."
fi

echo "==> 3. Building signed Release APK & AAB via Gradle..."
cd "$ROOT_DIR/android"
chmod +x ./gradlew
./gradlew assembleRelease bundleRelease

echo ""
echo "✅ Build Complete!"
echo "   Signed APK : android/app/build/outputs/apk/release/app-release.apk"
echo "   Signed AAB : android/app/build/outputs/bundle/release/app-release.aab"
