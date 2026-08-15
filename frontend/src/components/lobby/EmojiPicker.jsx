const AVATARS = [
  "🃏", "♠️", "♣️", "♥️", "♦️", "🎲", "🏆", "💰",
  "🔥", "😎", "🤖", "🐸", "🦈", "🐍", "🦁", "🐺",
  "🎩", "🕶️", "💎", "🍀", "🚀", "👑", "🥷", "🦊",
];

export default function EmojiPicker({ onSelect, onClose }) {
  return (
    <div className="absolute z-10 mt-2 p-3 panel-raised bg-(--panel-floating-bg) rounded-lg shadow-xl shadow-black/50 animate-fade-in">
      <div className="grid grid-cols-6 gap-1">
        {AVATARS.map((emoji) => (
          <button
            key={emoji}
            onClick={() => { onSelect(emoji); onClose(); }}
            className="text-xl w-9 h-9 flex items-center justify-center rounded hover:bg-(--color-accent-soft) transition-colors"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
