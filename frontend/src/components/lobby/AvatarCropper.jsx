import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { cropToBlob } from "./avatarImage";

// The window you are choosing through. Fixed and square, because the thing
// being chosen is a square — dragging the picture under a fixed hole is a much
// smaller idea than dragging a resizable box over a picture, and it is the same
// gesture on a phone as with a mouse.
const BOX = 224;
const MAX_ZOOM = 4;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

/**
 * Choose which part of a picture becomes your avatar.
 *
 * Deliberately two controls: drag to move, slider to zoom. It opens on the
 * middle of the image at the size that just fills the window, so pressing the
 * button without touching anything gives exactly the centre crop this used to
 * do silently — the choosing is there for the photo where your face is off to
 * one side, which is most of them.
 *
 * The circle drawn over the square is not the crop. It is where the crop is
 * going: avatars are round at the table, and the corners of the square you
 * choose will not be seen.
 */
export default function AvatarCropper({ file, onCancel, onDone, busy = false }) {
  const [image, setImage] = useState(null);
  const [error, setError] = useState(null);
  const [zoom, setZoom] = useState(1);
  // Where the image's top-left sits relative to the window's, in screen pixels.
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const drag = useRef(null);

  // The object URL is the component's, not the loader's: the picture stays on
  // screen for as long as this is open, so the URL has to outlive the decode
  // and is only released when the dialog goes away.
  useEffect(() => {
    const url = URL.createObjectURL(file);
    const loading = new Image();
    loading.onload = () => setImage(loading);
    loading.onerror = () => setError("That file could not be read as an image.");
    loading.src = url;
    return () => URL.revokeObjectURL(url);
  }, [file]);

  // The scale at which the image just covers the window — the smallest it is
  // allowed to be, since a gap at the edge would crop in blank space.
  const cover = image
    ? Math.max(BOX / image.naturalWidth, BOX / image.naturalHeight)
    : 1;
  const shownWidth = image ? image.naturalWidth * cover * zoom : BOX;
  const shownHeight = image ? image.naturalHeight * cover * zoom : BOX;

  // Never further than the edges: the window always shows picture.
  const clampOffset = useCallback((next, width, height) => ({
    x: clamp(next.x, BOX - width, 0),
    y: clamp(next.y, BOX - height, 0),
  }), []);

  // Open centred, which is the crop you would have got without asking.
  useEffect(() => {
    if (!image) return;
    setZoom(1);
    setOffset({
      x: (BOX - image.naturalWidth * cover) / 2,
      y: (BOX - image.naturalHeight * cover) / 2,
    });
  }, [image, cover]);

  const onPointerDown = (event) => {
    if (!image) return;
    drag.current = { x: event.clientX, y: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const onPointerMove = (event) => {
    if (!drag.current) return;
    const dx = event.clientX - drag.current.x;
    const dy = event.clientY - drag.current.y;
    drag.current = { x: event.clientX, y: event.clientY };
    setOffset((current) => clampOffset(
      { x: current.x + dx, y: current.y + dy }, shownWidth, shownHeight,
    ));
  };

  const endDrag = (event) => {
    drag.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  // Zooming holds the middle of the window still. Zooming about the top-left
  // instead would send whatever you had lined up sliding out of frame.
  const changeZoom = (next) => {
    const factor = next / zoom;
    setOffset((current) => clampOffset(
      {
        x: BOX / 2 - (BOX / 2 - current.x) * factor,
        y: BOX / 2 - (BOX / 2 - current.y) * factor,
      },
      image ? image.naturalWidth * cover * next : BOX,
      image ? image.naturalHeight * cover * next : BOX,
    ));
    setZoom(next);
  };

  const confirm = async () => {
    if (!image) return;
    // Screen pixels back into the image's own: what the window shows is what
    // gets cut out.
    const scale = cover * zoom;
    try {
      onDone(await cropToBlob(image, {
        sx: -offset.x / scale,
        sy: -offset.y / scale,
        side: BOX / scale,
      }));
    } catch (failure) {
      setError(failure.message || "That picture could not be prepared.");
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 px-4"
      onClick={busy ? undefined : onCancel}>
      <div className="panel panel-solid rounded-xl p-4 shadow-2xl shadow-black/70"
        onClick={(event) => event.stopPropagation()}>
        <h2 className="text-sm font-semibold text-(--color-silver) mb-1">Choose your avatar</h2>
        <p className="text-[11px] text-(--color-text-muted) mb-3">Drag the picture, zoom to fit.</p>

        {error ? (
          <p role="alert" className="text-xs text-(--color-accent-link) w-56">{error}</p>
        ) : (
          <>
            <div
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={endDrag}
              onPointerCancel={endDrag}
              style={{ width: BOX, height: BOX }}
              className="relative overflow-hidden rounded-lg bg-black/60 border border-(--color-border)
                         cursor-grab active:cursor-grabbing touch-none select-none"
            >
              {image && (
                <img
                  src={image.src}
                  alt=""
                  draggable="false"
                  style={{
                    width: shownWidth,
                    height: shownHeight,
                    transform: `translate(${offset.x}px, ${offset.y}px)`,
                  }}
                  className="absolute top-0 left-0 max-w-none origin-top-left"
                />
              )}
              {/* Where the square is going: round, at the table. */}
              <span aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full
                           shadow-[0_0_0_9999px_rgba(0,0,0,0.45)] border border-white/40" />
            </div>

            <label className="flex items-center gap-2 mt-3 text-[11px] text-(--color-text-muted)">
              Zoom
              <input
                type="range"
                min={1}
                max={MAX_ZOOM}
                step={0.01}
                value={zoom}
                onChange={(event) => changeZoom(Number(event.target.value))}
                aria-label="Zoom"
                className="flex-1 accent-(--color-highlight-bright) cursor-pointer"
              />
            </label>
          </>
        )}

        <div className="flex gap-2 mt-4">
          <button type="button" onClick={onCancel} disabled={busy}
            className="btn-secondary flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={confirm} disabled={busy || !image || Boolean(error)}
            className="btn-accent flex-1 px-3 py-1.5 rounded text-xs font-semibold transition-colors disabled:opacity-50">
            {busy ? "Uploading…" : "Use this"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
