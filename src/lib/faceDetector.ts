import { FaceDetector, FilesetResolver, type Detection } from "@mediapipe/tasks-vision";
import type { Rect } from "./roi";

const assetUrl = (path: string) => new URL(path, document.baseURI).toString();
const WASM_ROOT = assetUrl("mediapipe/wasm");
const MODEL_URL = assetUrl("mediapipe/models/blaze_face_short_range.tflite");

export interface FaceDetection {
  box: Rect;
  score: number;
}

function detectionScore(detection: Detection): number {
  return detection.categories?.[0]?.score ?? 0;
}

function detectionBox(detection: Detection): Rect | null {
  const box = detection.boundingBox;
  if (!box) return null;

  return {
    x: box.originX ?? 0,
    y: box.originY ?? 0,
    width: box.width ?? 0,
    height: box.height ?? 0,
  };
}

export class BrowserFaceDetector {
  private constructor(private readonly detector: FaceDetector) {}

  static async create(): Promise<BrowserFaceDetector> {
    const vision = await FilesetResolver.forVisionTasks(WASM_ROOT);

    try {
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "GPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.55,
      });
      return new BrowserFaceDetector(detector);
    } catch {
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: MODEL_URL,
          delegate: "CPU",
        },
        runningMode: "VIDEO",
        minDetectionConfidence: 0.55,
      });
      return new BrowserFaceDetector(detector);
    }
  }

  detect(video: HTMLVideoElement, timestampMs: number): FaceDetection | null {
    const result = this.detector.detectForVideo(video, timestampMs);
    const detections = [...result.detections].sort((a, b) => detectionScore(b) - detectionScore(a));
    const best = detections[0];
    if (!best) return null;

    const box = detectionBox(best);
    if (!box || box.width <= 0 || box.height <= 0) return null;

    return {
      box,
      score: detectionScore(best),
    };
  }

  dispose(): void {
    this.detector.close();
  }
}
