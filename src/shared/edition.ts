// Build edition. Default (full) = your personal build with the autonomous
// Autopilot cockpit. The friend/"lite" build flips this to true at build time
// (scripts/build-friend.sh) to ship a barebones Autopilot — just the LinkedIn
// Easy Apply setup (Profile / Resume / Answers / Voice / Letters) that the Chrome
// extension + cover letters use — with NO in-app autonomous applier.
export const LITE = false;
