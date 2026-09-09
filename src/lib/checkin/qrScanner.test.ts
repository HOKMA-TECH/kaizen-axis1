import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  CAMERA_IDEAL_SIZE,
  CHECKIN_DISPLAY_QR_SIZE,
  createScanMutex,
  extractCheckinToken,
  getCameraConstraintFallbacks,
  getScanCanvasSize,
  getScanRoi,
  NATIVE_DETECT_TIMEOUT_MS,
  QR_SCAN_TIMEOUT_MS,
  raceWithTimeout,
  SCAN_MAX_DIMENSION,
  SCAN_ROI_INSET_RATIO,
  shouldFallbackToJsQR,
  waitForVideoReady,
} from './qrScanner.ts';

describe('extractCheckinToken', () => {
  it('reads the token query param from a check-in URL', () => {
    assert.equal(
      extractCheckinToken('https://kaizen-axis.space/checkin?token=abc-123'),
      'abc-123',
    );
  });

  it('accepts a raw token and rejects empty or tokenless URLs', () => {
    assert.equal(extractCheckinToken('raw-token-value'), 'raw-token-value');
    assert.equal(extractCheckinToken('https://kaizen-axis.space/checkin'), null);
    assert.equal(extractCheckinToken('   '), null);
  });
});

describe('QR scanner fallback and timeout', () => {
  it('falls back to jsQR when the native detector has no usable rawValue', () => {
    assert.equal(shouldFallbackToJsQR(true, ''), true);
    assert.equal(shouldFallbackToJsQR(true, '   '), true);
    assert.equal(shouldFallbackToJsQR(false, ''), true);
    assert.equal(shouldFallbackToJsQR(false, 'token'), true);
  });

  it('does not fall back to jsQR when the native detector already decoded text', () => {
    assert.equal(shouldFallbackToJsQR(true, 'https://app.imobkaizen.com.br/checkin?token=abc'), false);
  });

  it('times out after 45 seconds without a successful read', () => {
    assert.equal(QR_SCAN_TIMEOUT_MS, 45_000);
  });

  it('keeps the camera running after the timeout warning', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../pages/CheckIn.tsx'), 'utf8');
    const start = source.indexOf('scanTimeoutRef.current = window.setTimeout');
    const end = source.indexOf('}, QR_SCAN_TIMEOUT_MS)');
    assert.ok(start >= 0 && end > start);
    const timeoutBlock = source.slice(start, end);
    assert.match(timeoutBlock, /setScannerError/);
    assert.doesNotMatch(timeoutBlock, /stopScanner\(/);
  });

  it('hints to keep scanning or use the native phone camera after the timeout', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../pages/CheckIn.tsx'), 'utf8');
    assert.match(
      source,
      /Aproxime, foque no QR ou feche e use a Câmera do celular/,
    );
  });

  it('caps native BarcodeDetector at 250ms so jsQR is never blocked', () => {
    assert.equal(NATIVE_DETECT_TIMEOUT_MS, 250);
  });
});

describe('getScanCanvasSize', () => {
  it('downscales 1280x720 so the longest edge is 960', () => {
    assert.equal(SCAN_MAX_DIMENSION, 960);
    const size = getScanCanvasSize(1280, 720);
    assert.equal(size.width, 960);
    assert.equal(size.height, 540);
  });

  it('keeps frames already within the cap unchanged', () => {
    assert.deepEqual(getScanCanvasSize(480, 640), { width: 480, height: 640 });
  });
});

describe('createScanMutex', () => {
  it('does not re-enter while a scan frame is already running', () => {
    const mutex = createScanMutex();
    assert.equal(mutex.tryEnter(), true);
    assert.equal(mutex.tryEnter(), false);
    mutex.leave();
    assert.equal(mutex.tryEnter(), true);
  });
});

describe('raceWithTimeout', () => {
  it('returns null when the native detector hangs past the timeout', async () => {
    const hung = new Promise<string>(() => {});
    const result = await raceWithTimeout(hung, 20);
    assert.equal(result, null);
  });
});

describe('waitForVideoReady', () => {
  it('waits until the video has a non-zero frame size', async () => {
    const video = { videoWidth: 0, videoHeight: 0 };
    setTimeout(() => {
      video.videoWidth = 640;
      video.videoHeight = 480;
    }, 30);

    const ready = await waitForVideoReady(video, 500);
    assert.equal(ready.videoWidth, 640);
    assert.equal(ready.videoHeight, 480);
  });
});

describe('camera constraints', () => {
  it('asks for environment camera, 1280px, and continuous focus first', () => {
    assert.equal(CAMERA_IDEAL_SIZE, 1280);
    const [preferred, withoutFocus, basic] = getCameraConstraintFallbacks();
    assert.equal((preferred as { facingMode?: { ideal?: string } }).facingMode?.ideal, 'environment');
    assert.equal((preferred as { width?: { ideal?: number } }).width?.ideal, 1280);
    assert.equal((preferred as { height?: { ideal?: number } }).height?.ideal, 1280);
    const advanced = (preferred as { advanced?: Array<{ focusMode?: string }> }).advanced;
    assert.equal(advanced?.[0]?.focusMode, 'continuous');
    assert.equal((withoutFocus as { advanced?: unknown }).advanced, undefined);
    assert.ok(withoutFocus);
    assert.deepEqual(basic, { facingMode: 'environment' });
  });
});

describe('scan ROI', () => {
  it('crops the gold-frame inset from a 1280x720 video', () => {
    assert.equal(SCAN_ROI_INSET_RATIO, 0.08);
    assert.deepEqual(getScanRoi(1280, 720), {
      sx: 102,
      sy: 58,
      sw: 1076,
      sh: 604,
    });
  });
});

describe('reception display QR', () => {
  it('renders at 512px with high error correction and a wide quiet zone', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../pages/CheckInDisplay.tsx'),
      'utf8',
    );
    assert.equal(CHECKIN_DISPLAY_QR_SIZE, 512);
    assert.match(source, /size=\{CHECKIN_DISPLAY_QR_SIZE\}/);
    assert.match(source, /level="H"/);
    assert.match(source, /className="bg-white p-12 rounded-2xl/);
    assert.match(source, /w-\[32rem\] h-\[32rem\]/);
  });

  it('tells reception to use the native phone camera if the in-app scanner fails', () => {
    const source = readFileSync(
      join(dirname(fileURLToPath(import.meta.url)), '../../pages/CheckInDisplay.tsx'),
      'utf8',
    );
    assert.match(source, /Câmera do celular/);
    assert.match(source, /Se o app não ler/);
  });
});

describe('in-app scanner canvas pipeline', () => {
  it('runs BarcodeDetector on the canvas, not the live video element', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../pages/CheckIn.tsx'), 'utf8');
    assert.match(source, /detector\.detect\(canvas\)/);
    assert.doesNotMatch(source, /detector\.detect\(liveVideo\)/);
  });

  it('falls back to jsQR using the native rawValue string, not a barcode count', () => {
    const source = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '../../pages/CheckIn.tsx'), 'utf8');
    assert.match(source, /shouldFallbackToJsQR\(Boolean\(detector\),\s*nativeRawValue\)/);
  });
});
