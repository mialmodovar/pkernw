import { useState } from "react";
import useAuthStore from "../../store/authStore";
import EmojiPicker from "./EmojiPicker";

export default function ProfileCard() {
  const { user, updateAvatar } = useAuthStore();
  const [pickerOpen, setPickerOpen] = useState(false);

  return (
    <div className={`panel rounded-lg p-4 relative shadow-lg shadow-black/40 ${pickerOpen ? "z-20" : ""}`}>
      <div className="flex items-center gap-3">
        <button
          onClick={() => setPickerOpen((v) => !v)}
          title="Change avatar"
          className="w-14 h-14 flex items-center justify-center text-3xl rounded-full panel-raised hover:border-(--color-accent-hover) transition-colors"
        >
          {user?.profile?.avatar_emoji || "🃏"}
        </button>
        <div>
          <p className="font-semibold text-(--color-silver)">{user?.username}</p>
          <button
            onClick={() => setPickerOpen((v) => !v)}
            className="text-xs text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
          >
            Change avatar
          </button>
        </div>
      </div>
      {pickerOpen && (
        <EmojiPicker onSelect={updateAvatar} onClose={() => setPickerOpen(false)} />
      )}
    </div>
  );
}
