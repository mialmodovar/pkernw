import { useEffect, useState } from "react";
import { Suit } from "../game/PlayingCard";
import BetSizeSettings from "./BetSizeSettings";
import { deckFace, parseCard } from "../game/cardStyles";
import Icon from "../icons/Icon";
import useGameStore from "../../store/gameStore";
import useThemeStore from "../../store/themeStore";
import GifPicker from "../game/GifPicker";
import { gifPreviewUrl } from "../../api/giphy";
import { playFinisherSound } from "../game/sounds";
import {
  ACCENT_SWATCHES,
  FINISHER_SOUNDS,
  MAX_FINISHERS,
  PATTERNS,
  PATTERN_NAMES,
  PRESETS,
  PRESET_NAMES,
  cardBackImage,
  effectiveAccent,
  resolveTokens,
} from "../../theme/themes";

/** What each sting is called, for people who are not going to guess from the
 *  name of a waveform. */
const SOUND_LABELS = {
  airhorn: "Air horn",
  boom: "Boom",
  fanfare: "Fanfare",
  sting: "Sad trombone",
  slam: "Slam",
};

/** A miniature of what the preset does to the table: the actual felt gradient
 *  with the actual card back lying on it. Cheaper to read than three colour
 *  chips, and it is the real values rather than an approximation of them. */
// Card-back colours worth offering, with the theme's own first. Six, to match
// the row of patterns above them — a colour picker would allow all sixteen
// million and help with none of them.
const CARD_BACK_COLOURS = [null, "#3f4a63", "#1d4b3a", "#5b2333", "#2f2a45", "#6b5636"];

// The two ways a card can be printed. The keys match DECKS in theme/themes.js
// and AVAILABLE_CARD_DECKS on the server.
const DECK_CHOICES = [
  { key: "classic", label: "Classic", hint: "Ink on ivory, four colours" },
  { key: "inverted", label: "Inverted", hint: "The suit's colour across the card, rank in white" },
];

/** One card at swatch size, printed in whichever deck is being offered. */
function DeckSample({ card, deck }) {
  const parsed = parseCard(card);
  const printed = deckFace(deck, parsed.suit);
  return (
    <span
      style={printed.style}
      className={`inline-flex flex-col items-center justify-center w-6 h-8 rounded font-bold
                  text-[10px] leading-none ${printed.face}`}
    >
      {parsed.rank}
      <Suit suit={parsed.suit} className="w-2 h-2 mt-px" />
    </span>
  );
}

function PresetPreview({ preset, pattern, cardBack = null }) {
  // Resolved rather than declared, so the dot shows the accent after the
  // readability correction — the colour that will actually be on screen.
  const tokens = resolveTokens({ preset, pattern, cardBack });
  return (
    <span
      className="w-10 h-7 rounded relative overflow-hidden shrink-0 border border-black/40"
      style={{ background: tokens["--felt-bg"] }}
    >
      <span
        className="absolute right-[4px] bottom-[4px] w-[9px] h-[13px] rounded-[2px] border"
        style={{
          backgroundImage: cardBackImage(preset, pattern, cardBack),
          borderColor: tokens["--card-back-edge"],
        }}
      />
      <span
        className="absolute left-[4px] top-[4px] w-[7px] h-[7px] rounded-full"
        style={{ background: tokens["--color-accent"] }}
      />
    </span>
  );
}

function SectionLabel({ children, action }) {
  return (
    <div className="flex items-center justify-between mb-2">
      <p className="text-xs font-semibold uppercase tracking-wide text-(--color-text-muted)">
        {children}
      </p>
      {action}
    </div>
  );
}

export default function ThemeSettings({ onClose }) {
  const { preset, accent, pattern, deck, cardBack, finishers, update } = useThemeStore();
  // The one setting here that stays in this browser rather than on the account.
  const hideHand = useGameStore((s) => s.hideHand);
  const toggleHideHand = useGameStore((s) => s.toggleHideHand);
  const [listOpen, setListOpen] = useState(false);
  // Which slot the picker is filling, or null for closed. A number rather than
  // a flag because "add another" and "choose your first" open the same picker.
  const [finisherOpen, setFinisherOpen] = useState(null);
  const currentAccent = effectiveAccent({ preset, accent });

  // The list is always saved whole, and the single id goes with it so a client
  // that has not been updated still finds a finisher where it looks for one.
  const saveFinishers = (next) => update({
    finishers: next,
    finisherGifId: next[0]?.gifId ?? null,
  });
  const addFinisher = (gifId) => {
    if (finishers.some((one) => one.gifId === gifId)) return;
    saveFinishers([...finishers, { gifId, sound: "none" }].slice(0, MAX_FINISHERS));
  };
  const removeFinisher = (index) => saveFinishers(finishers.filter((_, i) => i !== index));
  const setFinisherSound = (index, sound) => {
    saveFinishers(finishers.map((one, i) => (i === index ? { ...one, sound } : one)));
    // Played as you pick it: choosing a sound blind from a list of five names
    // is choosing at random.
    playFinisherSound(sound);
  };
  const previewFinisherSound = (sound) => playFinisherSound(sound);

  // A settings panel that cannot be dismissed from the keyboard is a trap.
  // Escape backs out one level at a time, so it closes the open dropdown rather
  // than the whole panel underneath it.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      if (listOpen) setListOpen(false);
      else if (finisherOpen !== null) setFinisherOpen(null);
      else onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [listOpen, finisherOpen, onClose]);

  const choosePreset = (name) => {
    update({ preset: name });
    setListOpen(false);
  };

  return (
    <div className="absolute left-0 right-0 top-full z-10 mt-2 p-3 panel-raised panel-solid rounded-lg shadow-xl shadow-black/50 animate-fade-in">
      <SectionLabel
        action={
          <button
            onClick={onClose}
            title="Close"
            className="text-(--color-text-muted) hover:text-(--color-silver) text-sm leading-none px-1 transition-colors"
          >
            <Icon name="close" className="w-3.5 h-3.5" />
          </button>
        }
      >
        Theme
      </SectionLabel>

      <div className="relative">
        <button
          onClick={() => setListOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={listOpen}
          className="w-full flex items-center gap-2 p-1.5 rounded panel-raised panel-solid text-left"
        >
          <PresetPreview preset={preset} pattern={pattern} cardBack={cardBack} />
          <span className="text-sm text-(--color-silver) flex-1 truncate">
            {PRESETS[preset].label}
          </span>
          <svg viewBox="0 0 24 24" aria-hidden="true"
            className={`w-3.5 h-3.5 mr-1 shrink-0 text-(--color-text-muted) transition-transform ${
              listOpen ? "rotate-180" : ""
            }`}
            fill="none" stroke="currentColor" strokeWidth="2.5"
            strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>

        {listOpen && (
          <>
            {/* Catches the click that dismisses the list. Cheaper and more
                reliable than a document listener that has to not fire on the
                same click that opened it. */}
            <div className="fixed inset-0 z-10" onClick={() => setListOpen(false)} />
            <div
              role="listbox"
              className="absolute left-0 right-0 top-full z-20 mt-1 p-1 space-y-1 rounded panel-raised panel-solid shadow-xl shadow-black/50 animate-fade-in"
            >
              {PRESET_NAMES.map((name) => {
                const active = name === preset;
                return (
                  <button
                    key={name}
                    role="option"
                    aria-selected={active}
                    onClick={() => choosePreset(name)}
                    className={`w-full flex items-center gap-2 p-1.5 rounded text-left transition-colors ${
                      active ? "bg-(--color-accent-soft)" : "hover:bg-white/5"
                    }`}
                  >
                    <PresetPreview preset={name} pattern={pattern} />
                    <span className="text-sm text-(--color-silver) flex-1 truncate">
                      {PRESETS[name].label}
                    </span>
                    {active && <Icon name="check" className="w-3.5 h-3.5 text-(--color-silver) mr-1" />}
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel
          action={
            accent && (
              <button
                onClick={() => update({ accent: null })}
                className="text-[0.65rem] text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
              >
                Match theme
              </button>
            )
          }
        >
          Accent
        </SectionLabel>

        <div className="grid grid-cols-8 gap-1">
          {ACCENT_SWATCHES.map((hex) => (
            <button
              key={hex}
              onClick={() => update({ accent: hex })}
              title={hex}
              aria-label={`Accent ${hex}`}
              aria-pressed={currentAccent === hex}
              style={{ background: hex }}
              className={`aspect-square rounded transition-transform hover:scale-110 ${
                currentAccent === hex
                  ? "ring-2 ring-(--color-silver) ring-offset-1 ring-offset-black/60"
                  : "border border-black/40"
              }`}
            />
          ))}
        </div>

        <label className="mt-2 flex items-center gap-2 text-xs text-(--color-text-muted) cursor-pointer">
          <input
            type="color"
            value={currentAccent}
            // Repaints on every step of the drag; themeStore holds the save back
            // until you stop moving.
            onChange={(e) => update({ accent: e.target.value })}
            className="w-7 h-7 rounded bg-transparent border border-(--color-border) cursor-pointer p-0"
          />
          Custom colour
        </label>
      </div>

      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel>At the table</SectionLabel>

        {/* Not part of the theme: this one is remembered by the browser rather
            than by the account, because it is a fact about the room you are
            sitting in and not about you. */}
        <label className="mt-2 flex items-center gap-2 text-xs text-(--color-silver) cursor-pointer">
          <input
            type="checkbox"
            checked={hideHand}
            onChange={toggleHideHand}
          />
          Hide my hand until I hover it
        </label>
        <p className="mt-1 text-[11px] text-(--color-text-muted)">
          Your two cards sit face down and lift when you point at them — for
          playing with somebody looking over your shoulder.
        </p>

        <BetSizeSettings />
      </div>

      {/* One section for the deck rather than two.
          It was a grid of patterns, then a colour picker with a reset link
          beside it, then two large card previews — three controls and a
          paragraph for a decision nobody makes twice. Now: the back, in a row
          of patterns and a row of colours that each show the other's choice,
          and the face as two small samples. Everything visible, nothing to
          drag, no free colour input whose value nobody can name. */}
      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel>Cards</SectionLabel>

        <div className="grid grid-cols-6 gap-1">
          {PATTERN_NAMES.map((name) => (
            <button
              key={name}
              onClick={() => update({ pattern: name })}
              title={PATTERNS[name].label}
              aria-label={`Card back ${PATTERNS[name].label}`}
              aria-pressed={pattern === name}
              style={{ backgroundImage: cardBackImage(preset, name, cardBack) }}
              className={`aspect-square rounded transition-transform hover:scale-110 ${
                pattern === name
                  ? "ring-2 ring-(--color-silver) ring-offset-1 ring-offset-black/60"
                  : "border border-black/40"
              }`}
            />
          ))}
        </div>

        {/* The same six squares again, in colours instead of patterns — each
            one drawn in the pattern you just chose, so the two rows are one
            decision seen from both sides. The first follows the theme, which
            is what everybody starts on. */}
        <div className="grid grid-cols-6 gap-1 mt-1">
          {CARD_BACK_COLOURS.map((colour) => (
            <button
              key={colour ?? "theme"}
              onClick={() => update({ cardBack: colour })}
              title={colour ? `Card back in ${colour}` : "Card back in the theme's own colour"}
              aria-label={colour ? `Card back colour ${colour}` : "Card back colour from the theme"}
              aria-pressed={(cardBack || null) === colour}
              style={{ backgroundImage: cardBackImage(preset, pattern, colour) }}
              className={`aspect-square rounded transition-transform hover:scale-110 ${
                (cardBack || null) === colour
                  ? "ring-2 ring-(--color-silver) ring-offset-1 ring-offset-black/60"
                  : "border border-black/40"
              }`}
            />
          ))}
        </div>

        {/* The face. Two samples and their names, on one line. */}
        <div className="grid grid-cols-2 gap-2 mt-2">
          {DECK_CHOICES.map((choice) => (
            <button
              key={choice.key}
              onClick={() => update({ deck: choice.key })}
              aria-pressed={deck === choice.key}
              title={choice.hint}
              className={`flex items-center justify-center gap-2 rounded-lg px-2 py-1.5 border
                          transition-colors ${
                deck === choice.key
                  ? "border-(--color-highlight-text) bg-black/40"
                  : "border-(--color-border) hover:border-(--color-border-strong)"
              }`}
            >
              <span className="flex items-center gap-0.5">
                {["A♠", "K♥"].map((card) => (
                  <DeckSample key={card} card={card} deck={choice.key} />
                ))}
              </span>
              <span className="text-[11px] font-semibold text-(--color-silver)">
                {choice.label}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-2 text-[0.65rem] leading-snug text-(--color-text-muted)">
          The back is a pattern and a colour; the face is how the suits are
          printed. Felt and accent come from the theme.
        </p>
      </div>

      {/* Your finishers. Not a colour, but they belong with the rest of how you
          show up at a table, and this is where a player already comes to set
          that. Three of them, because the same clip every single time is funny
          twice — the table picks between them on each knockout. */}
      <div className="mt-3 pt-3 border-t border-(--color-border)">
        <SectionLabel
          action={
            finishers.length < MAX_FINISHERS && (
              <button
                onClick={() => setFinisherOpen(finishers.length)}
                className="text-[0.65rem] text-(--color-text-muted) hover:text-(--color-silver) transition-colors"
              >
                {finishers.length ? "Add another" : "Choose one"}
              </button>
            )
          }
        >
          Finishers {finishers.length > 0 && `(${finishers.length}/${MAX_FINISHERS})`}
        </SectionLabel>

        <div className="space-y-1.5">
          {finishers.map((one, index) => (
            <div key={one.gifId} className="flex items-center gap-2">
              <img
                src={gifPreviewUrl(one.gifId)}
                alt=""
                className="w-10 h-7 object-cover rounded shrink-0 border border-black/40"
              />
              {/* The sound that goes with this one. A name, never a file: the
                  table synthesises all of them, so choosing one costs nothing
                  to load and cannot arrive late. */}
              <select
                value={one.sound}
                onChange={(event) => setFinisherSound(index, event.target.value)}
                aria-label={`Sound for finisher ${index + 1}`}
                className="input-field rounded px-1.5 py-1 text-xs flex-1 min-w-0 transition-colors"
              >
                {FINISHER_SOUNDS.map((name) => (
                  <option key={name} value={name}>
                    {name === "none" ? "No sound" : SOUND_LABELS[name] || name}
                  </option>
                ))}
              </select>
              <button
                onClick={() => previewFinisherSound(one.sound)}
                disabled={one.sound === "none"}
                title="Hear it"
                aria-label={`Hear the sound for finisher ${index + 1}`}
                className="px-1.5 py-1 rounded panel-raised text-xs text-(--color-text-muted)
                           hover:text-(--color-silver) transition-colors disabled:opacity-30"
              >
                {"▶"}
              </button>
              <button
                onClick={() => removeFinisher(index)}
                title="Remove this finisher"
                aria-label={`Remove finisher ${index + 1}`}
                className="px-1.5 py-1 rounded text-xs text-(--color-text-muted)
                           hover:text-(--color-accent-link) transition-colors"
              >
                <Icon name="close" className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}

          {finishers.length === 0 && (
            <button
              onClick={() => setFinisherOpen(0)}
              className="flex items-center gap-2 p-1.5 rounded panel-raised panel-solid text-left w-full"
            >
              <span className="w-10 h-7 rounded shrink-0 border border-dashed border-(--color-border)
                               flex items-center justify-center text-[0.6rem] text-(--color-text-muted)">
                none
              </span>
              <span className="text-sm text-(--color-silver) flex-1 truncate">Choose a GIF</span>
            </button>
          )}
        </div>

        {finisherOpen !== null && (
          <div className="relative">
            <div className="fixed inset-0 z-10" onClick={() => setFinisherOpen(null)} />
            <div className="absolute right-0 top-full z-20 mt-1">
              <GifPicker
                title="Search for a finisher"
                onPick={(id) => { addFinisher(id); setFinisherOpen(null); }}
                onClose={() => setFinisherOpen(null)}
              />
            </div>
          </div>
        )}

        <p className="mt-2 text-[0.65rem] leading-snug text-(--color-text-muted)">
          {finishers.length > 1
            ? "One of these plays in the middle of the table whenever you knock somebody out — whichever the table picks."
            : "Plays in the middle of the table whenever you knock somebody out."}
        </p>
      </div>
    </div>
  );
}
