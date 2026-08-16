import { useRef, useState } from "react";

import Avatar from "../Avatar";
import AvatarCropper from "./AvatarCropper";
import useAuthStore from "../../store/authStore";

const AVATARS = [
  "🃏", "♠️", "♣️", "♥️", "♦️", "🎲", "🏆", "💰",
  "🔥", "😎", "🤖", "🐸", "🦈", "🐍", "🦁", "🐺",
  "🎩", "🕶️", "💎", "🍀", "🚀", "👑", "🥷", "🦊",
];

// What the file dialog offers. The browser re-encodes whatever comes back
// before it is uploaded, and the server checks the bytes rather than the
// extension, so this is a convenience and not the rule.
const ACCEPTED = "image/png,image/jpeg,image/webp,image/gif";

/**
 * Who you are at the table: one of the emoji, or a picture of your own.
 *
 * The picture wins whenever there is one, so picking an emoji while one is set
 * would otherwise change nothing visible — which is why choosing an emoji also
 * takes the picture down. One avatar, one place to change it.
 */
export default function EmojiPicker({ onSelect, onClose }) {
  const profile = useAuthStore((s) => s.user?.profile);
  const uploadAvatarImage = useAuthStore((s) => s.uploadAvatarImage);
  const removeAvatarImage = useAuthStore((s) => s.removeAvatarImage);
  const fileInput = useRef(null);
  // The file waiting to be cropped. Held rather than uploaded straight away:
  // which part of a photo is your face is a decision only you can make.
  const [chosenFile, setChosenFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const hasPicture = Boolean(profile?.avatar_url);

  const pickEmoji = async (emoji) => {
    setError(null);
    try {
      if (hasPicture) await removeAvatarImage();
      await onSelect(emoji);
      onClose();
    } catch {
      setError("That could not be saved. Try again.");
    }
  };

  const pick = (event) => {
    const file = event.target.files?.[0];
    // Cleared straight away so picking the same file twice still counts as a
    // change — after a failed upload, that is exactly what you would do.
    event.target.value = "";
    if (!file) return;
    setError(null);
    setChosenFile(file);
  };

  const upload = async (blob) => {
    setBusy(true);
    setError(null);
    try {
      await uploadAvatarImage(blob);
      setChosenFile(null);
      onClose();
    } catch (failure) {
      setError(
        failure?.response?.data?.image
        || failure?.message
        || "That picture could not be uploaded.",
      );
      setChosenFile(null);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await removeAvatarImage();
    } catch {
      setError("That picture could not be removed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="absolute z-10 mt-2 p-3 panel-raised panel-solid rounded-lg shadow-xl shadow-black/50 animate-fade-in">
      <div className="flex items-center gap-2 pb-3 mb-3 border-b border-(--color-border)">
        <Avatar
          url={profile?.avatar_url}
          emoji={profile?.avatar_emoji}
          className="w-10 h-10 shrink-0 rounded-full panel-raised"
          emojiClassName="text-xl"
        />
        <div className="flex flex-col gap-1 min-w-0">
          <button
            type="button"
            disabled={busy}
            onClick={() => fileInput.current?.click()}
            className="btn-secondary px-2 py-1 rounded text-xs font-semibold transition-colors disabled:opacity-50"
          >
            {busy ? "Working…" : hasPicture ? "Change picture" : "Upload a picture"}
          </button>
          {hasPicture && (
            <button
              type="button"
              disabled={busy}
              onClick={remove}
              className="text-[11px] text-(--color-text-muted) hover:text-(--color-silver) transition-colors disabled:opacity-50"
            >
              Remove picture
            </button>
          )}
        </div>
        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED}
          onChange={pick}
          className="hidden"
        />
      </div>

      {error && (
        <p role="alert" className="mb-2 text-[11px] text-(--color-accent-link)">{error}</p>
      )}

      {chosenFile && (
        <AvatarCropper
          file={chosenFile}
          busy={busy}
          onCancel={() => setChosenFile(null)}
          onDone={upload}
        />
      )}

      <div className="grid grid-cols-6 gap-1">
        {AVATARS.map((emoji) => (
          <button
            key={emoji}
            type="button"
            disabled={busy}
            onClick={() => pickEmoji(emoji)}
            className="text-xl w-9 h-9 flex items-center justify-center rounded hover:bg-(--color-accent-soft) transition-colors disabled:opacity-50"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
