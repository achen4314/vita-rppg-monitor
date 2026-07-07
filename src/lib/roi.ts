import { clamp, type RgbSample } from "./signal";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FaceRois {
  face: Rect;
  forehead: Rect;
  leftCheek: Rect;
  rightCheek: Rect;
  background: Rect;
}

export type GuidanceCode =
  | "NO_FACE"
  | "MOVE_CLOSER"
  | "MOVE_BACK"
  | "TOO_DARK"
  | "TOO_BRIGHT"
  | "GOOD";

export interface Guidance {
  code: GuidanceCode;
  message: string;
  severity: "neutral" | "warn" | "good";
}

export const DEFAULT_GUIDANCE: Guidance = {
  code: "NO_FACE",
  message: "等待人脸进入画面",
  severity: "neutral",
};

export function clampRect(rect: Rect, width: number, height: number): Rect {
  const x = clamp(rect.x, 0, width);
  const y = clamp(rect.y, 0, height);
  const right = clamp(rect.x + rect.width, 0, width);
  const bottom = clamp(rect.y + rect.height, 0, height);

  return {
    x,
    y,
    width: Math.max(0, right - x),
    height: Math.max(0, bottom - y),
  };
}

export function backgroundRoi(videoWidth: number, videoHeight: number): Rect {
  const width = Math.max(72, videoWidth * 0.16);
  const height = Math.max(54, videoHeight * 0.14);
  const margin = Math.max(16, Math.min(videoWidth, videoHeight) * 0.035);

  return clampRect(
    {
      x: videoWidth - width - margin,
      y: margin,
      width,
      height,
    },
    videoWidth,
    videoHeight,
  );
}

function rectFromFace(face: Rect, x0: number, y0: number, x1: number, y1: number): Rect {
  return {
    x: face.x + face.width * x0,
    y: face.y + face.height * y0,
    width: face.width * (x1 - x0),
    height: face.height * (y1 - y0),
  };
}

export function deriveFaceRois(face: Rect, videoWidth: number, videoHeight: number): FaceRois {
  const clampedFace = clampRect(face, videoWidth, videoHeight);
  return {
    face: clampedFace,
    forehead: clampRect(rectFromFace(clampedFace, 0.34, 0.16, 0.66, 0.32), videoWidth, videoHeight),
    leftCheek: clampRect(rectFromFace(clampedFace, 0.18, 0.48, 0.42, 0.72), videoWidth, videoHeight),
    rightCheek: clampRect(rectFromFace(clampedFace, 0.58, 0.48, 0.82, 0.72), videoWidth, videoHeight),
    background: backgroundRoi(videoWidth, videoHeight),
  };
}

export function averageRgbFromRois(
  context: CanvasRenderingContext2D,
  rois: readonly Rect[],
  timestamp: number,
  stride = 3,
): RgbSample | null {
  let red = 0;
  let green = 0;
  let blue = 0;
  let count = 0;

  for (const roi of rois) {
    const x = Math.round(roi.x);
    const y = Math.round(roi.y);
    const width = Math.round(roi.width);
    const height = Math.round(roi.height);
    if (width <= 1 || height <= 1) continue;

    const image = context.getImageData(x, y, width, height);
    const data = image.data;

    for (let row = 0; row < height; row += stride) {
      for (let col = 0; col < width; col += stride) {
        const offset = (row * width + col) * 4;
        red += data[offset];
        green += data[offset + 1];
        blue += data[offset + 2];
        count += 1;
      }
    }
  }

  if (count === 0) return null;

  const r = red / count;
  const g = green / count;
  const b = blue / count;
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

  return { t: timestamp, r, g, b, luminance };
}

export function assessGuidance(
  face: Rect | null,
  videoWidth: number,
  videoHeight: number,
  luminance: number | null,
): Guidance {
  if (!face) {
    return {
      code: "NO_FACE",
      message: "未检测到人脸",
      severity: "neutral",
    };
  }

  const faceRatio = face.height / Math.max(1, videoHeight);
  if (faceRatio < 0.3) {
    return {
      code: "MOVE_CLOSER",
      message: "请靠近摄像头",
      severity: "warn",
    };
  }

  if (faceRatio > 0.74 || face.width / Math.max(1, videoWidth) > 0.68) {
    return {
      code: "MOVE_BACK",
      message: "请稍微后退",
      severity: "warn",
    };
  }

  if (luminance !== null && luminance < 58) {
    return {
      code: "TOO_DARK",
      message: "环境偏暗，请增加正面光照",
      severity: "warn",
    };
  }

  if (luminance !== null && luminance > 218) {
    return {
      code: "TOO_BRIGHT",
      message: "画面过亮，请避开强光直射",
      severity: "warn",
    };
  }

  return {
    code: "GOOD",
    message: "姿势良好，保持静止",
    severity: "good",
  };
}

function drawRect(
  context: CanvasRenderingContext2D,
  rect: Rect,
  color: string,
  lineWidth = 2,
  dash: number[] = [],
): void {
  context.save();
  context.strokeStyle = color;
  context.lineWidth = lineWidth;
  context.setLineDash(dash);
  context.strokeRect(rect.x, rect.y, rect.width, rect.height);
  context.restore();
}

export function drawRoiOverlay(
  canvas: HTMLCanvasElement,
  rois: FaceRois | null,
  videoWidth: number,
  videoHeight: number,
): void {
  if (canvas.width !== videoWidth) canvas.width = videoWidth;
  if (canvas.height !== videoHeight) canvas.height = videoHeight;

  const context = canvas.getContext("2d");
  if (!context) return;

  context.clearRect(0, 0, videoWidth, videoHeight);
  drawRect(context, backgroundRoi(videoWidth, videoHeight), "rgba(255, 211, 106, 0.85)", 2, [8, 8]);

  if (!rois) return;

  drawRect(context, rois.face, "rgba(255, 94, 112, 0.95)", 3);
  drawRect(context, rois.forehead, "rgba(51, 231, 255, 0.95)", 2);
  drawRect(context, rois.leftCheek, "rgba(51, 231, 255, 0.95)", 2);
  drawRect(context, rois.rightCheek, "rgba(51, 231, 255, 0.95)", 2);

  context.save();
  context.fillStyle = "rgba(51, 231, 255, 0.12)";
  for (const roi of [rois.forehead, rois.leftCheek, rois.rightCheek]) {
    context.fillRect(roi.x, roi.y, roi.width, roi.height);
  }
  context.fillStyle = "rgba(255, 211, 106, 0.1)";
  context.fillRect(rois.background.x, rois.background.y, rois.background.width, rois.background.height);
  context.restore();
}
