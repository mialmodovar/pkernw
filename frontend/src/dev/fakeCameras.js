import useMediaStore from "../store/mediaStore";

/** Dummy cameras, drawn on a canvas and captured as a real MediaStream.
 *
 * Not a coloured rectangle: `captureStream` gives back the same kind of stream a
 * webcam does, so `SeatVideo` mounts a real <video>, plays real frames, and the
 * seat has to make room for a picture that is genuinely moving. Nothing here
 * asks for a device permission, so a table full of cameras costs nothing.
 */

const WIDTH = 320;
const HEIGHT = 180;
const FPS = 10;

let painters = [];
let timer = null;
let frame = 0;

function makePainter(userId, name, hue) {
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext("2d");
  const stream = canvas.captureStream(FPS);
  return { userId, name, hue, canvas, ctx, stream };
}

function paint(painter) {
  const { ctx, hue, name } = painter;
  const t = frame / 10;

  ctx.fillStyle = `hsl(${(hue + frame) % 360} 45% 22%)`;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // A shape that moves, so a frozen stream is obvious at a glance.
  const x = WIDTH / 2 + Math.sin(t) * (WIDTH / 3);
  const y = HEIGHT / 2 + Math.cos(t * 1.4) * (HEIGHT / 4);
  ctx.beginPath();
  ctx.arc(x, y, 26, 0, Math.PI * 2);
  ctx.fillStyle = `hsl(${(hue + 180) % 360} 70% 60%)`;
  ctx.fill();

  ctx.fillStyle = "rgba(0,0,0,0.45)";
  ctx.fillRect(0, HEIGHT - 34, WIDTH, 34);
  ctx.fillStyle = "#f0e2d6";
  ctx.font = "bold 18px system-ui, sans-serif";
  ctx.fillText(name.slice(0, 18), 10, HEIGHT - 12);
}

/** `specs` is [{ userId, name, video, audio, status, videoFlowing }]. */
export function startFakeCameras(specs) {
  stopFakeCameras();
  if (!specs.length) return;

  const store = useMediaStore.getState();
  painters = specs
    .filter((spec) => spec.video && spec.status !== "failed")
    .map((spec, index) => makePainter(spec.userId, spec.name, (index * 47) % 360));

  const streamFor = (userId) => painters.find((p) => p.userId === userId)?.stream || null;

  specs.forEach((spec) => {
    store.setPeer(spec.userId, {
      stream: spec.video ? streamFor(spec.userId) : null,
      status: spec.status,
      audio: spec.audio,
      video: spec.video,
      videoFlowing: spec.videoFlowing,
    });
  });

  painters.forEach(paint);
  timer = setInterval(() => {
    frame += 1;
    painters.forEach(paint);
  }, 1000 / FPS);
}

export function stopFakeCameras() {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
  painters.forEach((painter) => {
    painter.stream.getTracks().forEach((track) => track.stop());
  });
  painters = [];
  useMediaStore.getState().clearPeers();
}

/** Who gets a camera, given the seats and how much of the table should have one. */
export function cameraSpecs(players, mode, faults, micOnly) {
  if (mode === "none") return [];
  const chosen = mode === "all" ? players : players.filter((p, index) => index % 2 === 0);

  return players
    .filter((p) => !p.is_eliminated)
    .map((p) => {
      const hasCamera = chosen.includes(p);
      if (!hasCamera) {
        // A microphone with no camera is its own layout case: a mic badge on the
        // nameplate and not a pixel of extra height.
        return micOnly
          ? { userId: p.user_id, name: p.name, video: false, audio: true, status: "connected", videoFlowing: undefined }
          : null;
      }
      // Every failure mode SeatVideo can draw, spread across the table.
      const fault = faults ? p.seat % 4 : 0;
      return {
        userId: p.user_id,
        name: p.name,
        video: true,
        audio: micOnly || p.seat % 3 === 0,
        status: fault === 1 ? "connecting" : fault === 2 ? "failed" : "connected",
        videoFlowing: fault === 3 ? false : true,
      };
    })
    .filter(Boolean);
}
