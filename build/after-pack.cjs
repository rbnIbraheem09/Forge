// electron-builder afterPack hook — macOS ad-hoc code signing.
//
// WHY THIS EXISTS:
// With `mac.identity: null`, electron-builder skips its code-signing pass
// entirely. After it assembles + renames the bundle (Electron -> Forge, and
// the renamed "Forge Helper*.app" bundles), the only signature left is the
// linker's ad-hoc signature on the main Mach-O binary. That signature's
// CodeDirectory claims the bundle has sealed resources, but no
// _CodeSignature/CodeResources file exists — an internally INCONSISTENT seal.
// macOS reports this as: "code has no resources but signature indicates they
// must be present". On Apple Silicon, a quarantined app (any browser download
// sets com.apple.quarantine) whose seal fails validation is shown to the user
// as "Forge is damaged and can't be opened" — with no "Open Anyway" escape.
//
// FIX: ad-hoc re-sign the WHOLE bundle so a valid _CodeSignature seal is
// written across the app + every nested helper/framework. This makes the
// signature self-consistent (`codesign --verify` passes), which eliminates the
// "damaged" dialog. The app is still un-notarized, so a *bypassable* Gatekeeper
// prompt ("unidentified developer") may still appear on download — that is a
// separate, expected step, not the "damaged" failure. For a zero-prompt
// experience, replace this with Developer ID signing + notarization.
const { execFileSync } = require('node:child_process');
const path = require('node:path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[after-pack] ad-hoc signing bundle: ${appPath}`);
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });

  // Fail the build loudly if the seal is somehow still invalid, rather than
  // shipping another "damaged" dmg.
  execFileSync('codesign', ['--verify', '--deep', '--strict', appPath], {
    stdio: 'inherit',
  });
  console.log('[after-pack] signature verified OK');
};
