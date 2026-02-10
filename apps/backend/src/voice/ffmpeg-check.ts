import { spawnSync } from 'child_process';

const FFMPEG_INSTALL_HINT =
  'Install ffmpeg and ensure it is on PATH: https://ffmpeg.org/download.html ' +
  '(Windows: choco install ffmpeg; macOS: brew install ffmpeg; Linux: apt install ffmpeg). ' +
  'On Render: add ffmpeg to your Dockerfile or use a buildpack that installs it.';

/**
 * Check if ffmpeg is available. Returns true if found, false otherwise.
 */
export function isFfmpegAvailable(): boolean {
  const r = spawnSync('ffmpeg', ['-version'], {
    encoding: 'utf-8',
    timeout: 5000,
    windowsHide: true,
  });
  return r.status === 0 && !r.error;
}

/**
 * Get a user-friendly error message when ffmpeg fails (e.g. ENOENT).
 */
export function getFfmpegErrorMessage(spawnError: Error | undefined, stderr: string): string {
  const msg = spawnError?.message ?? stderr;
  if (msg && (msg.includes('ENOENT') || msg.includes('not found'))) {
    return `ffmpeg is not installed or not on PATH. ${FFMPEG_INSTALL_HINT}`;
  }
  return stderr || msg || 'ffmpeg failed';
}

export const FFMPEG_INSTALL_HINT_EXPORT = FFMPEG_INSTALL_HINT;
