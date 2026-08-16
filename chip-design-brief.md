# Prompt: poker chips and betting motion

Paste everything below the line into a fresh Claude session. It is written to be
self-contained — the designer needs no access to this repo.

---

I'm designing the chips for a multiplayer online poker table. I want two things:
a **set of chip faces** that read as denominations at a glance, and a **betting
animation** that makes chips feel like objects moving across a table rather than
numbers appearing and disappearing.

Build me a **single self-contained HTML artifact** that shows the designs and the
motion running, and from which I can lift the CSS and the markup directly.

## The table this has to live on

A dark, low-contrast felt. Three themes ship, and a player picks one — so every
chip has to read on all three:

| Theme | Felt (radial over a base) | Accent |
|---|---|---|
| Burgundy | `rgba(134,34,47,.6)` → `rgba(58,16,23,.92)` → `rgba(12,7,9,.99)` over `#2a1015` → `#120809` | `#8a1c2b` |
| Midnight Green | `rgba(34,120,74,.58)` → `rgba(14,58,36,.92)` → `rgba(6,14,10,.99)` over `#0e3122` → `#050f0a` | `#1e6b45` |
| Slate Blue | `rgba(58,86,148,.55)` → `rgba(26,40,72,.92)` → `rgba(7,10,18,.99)` over `#16203a` → `#080b14` | `#2f4b8a` |

The gold used for money and highlights across the whole app is `#c8a227`, with
`#d8c175` for text on dark and `#14100f` for text on gold.

## The single hardest constraint: size

**Chips render at 9px and 14px across.** That is not a typo. The stack beside a
player's bet is 9px wide; the one by the pot is 14px. Everything on the felt is
sized in container-query units, so on a large monitor these grow — but the phone
and laptop cases are the ones that must work, and there the chip is smaller than
this text.

So: **design for 9–16px first**, then show me how the same design scales up to
24px and 48px. Anything with a printed value, an inlaid pattern or a fine edge
pattern will turn to mud. What survives at 9px is: overall hue, the value/chroma
contrast between the rim and the face, and the number of rim breaks. Design with
those three and nothing else, and let the detail appear only at larger sizes.

I would rather have seven chips that are instantly distinguishable at 9px and
plain at 48px than seven beautiful chips that are seven grey dots on a phone.

## What exists now, and what is wrong with it

Each chip is one `<span>`: a circle with a 145° linear-gradient face, a 1.5px
solid rim, and a single drop shadow. A stack is up to 6 of them, absolutely
positioned with a 28% vertical overlap.

```
value  rim        face gradient
5000   #c9c3bd    #4a4a52 → #232329   silver
1000   #e0c66b    #7a5f16 → #3d2f0b   gold
500    #8f7ab8    #4b3a6b → #241b34   purple
100    #5b5b64    #2c2c33 → #141418   black
25     #4f8f6d    #27543f → #12261d   green
5      #c3565f    #7a2129 → #3a1014   red
1      #b9b0a7    #5a544d → #2b2724   white
```

Three problems with it:

1. **The faces are all dark.** Every one is a dark gradient with a coloured rim,
   so at 9px on a dark felt the whole set reads as "grey dot with a faint edge".
   Black (100) and silver (5000) are nearly identical; white (1) and silver
   (5000) are both pale rims on grey.
2. **A stack has no thickness.** Six circles overlapping vertically reads as a
   column of rings, not as chips seen slightly from above. There is no edge, no
   lean, no sense of a physical object.
3. **The rim carries all the information and is 1.5px.** At 9px that is a sixth
   of the chip, and it does not scale with the size — a 14px chip has the same
   1.5px rim as a 9px one.

## Deliverable 1 — the chip faces

Seven denominations: **1, 5, 25, 100, 500, 1000, 5000**.

Keep the conventional casino colour associations where they help (red 5, green
25, black 100, purple 500) but you are free to move them if a set reads better.
Tell me if you do, and why.

For each chip show:

- the face at **9, 14, 24 and 48px**, side by side, on all three felts;
- a stack of 6 at 9px and at 24px;
- the same set **desaturated to greyscale**, as a check that hue is not doing all
  the work — about 1 in 12 men has some colour vision deficiency, and a table
  where two denominations differ only in red/green is a table they cannot read.

Techniques that will survive: a light face with a dark rim rather than the other
way round; edge spots as `conic-gradient` breaks rather than drawn pips; a rim
width proportional to the chip. I am not prescribing — surprise me — but say
which of these you used and what you rejected.

## Deliverable 2 — the stack

Chips are seen from slightly above and to the side. I want the stack to have
**thickness**: an edge visible under each face, a slight lean or jitter so a
stack of six is not a perfect cylinder, and a shadow on the felt.

A stack tops out at 6 chips no matter how big the bet is, and the exact number
is always printed next to it in text — the stack is decorative and is marked
`aria-hidden`, so it never has to be readable as an exact amount. It only has to
say *roughly this much, and of these denominations*.

## Deliverable 3 — the betting motion

This is where the table is weakest. Right now there is exactly one animation: the
bet pill fades and rises 8px over 0.22s when a bet appears. Nothing else. In
particular:

- **When a street ends, the bets simply vanish** and the pot number jumps. Nobody
  sees the chips go in. This is the single biggest thing to fix.
- **When a pot is won, it simply disappears** and the winner's stack number
  changes. Nobody sees the chips come back.

Design and demonstrate four moments:

1. **Placing a bet** — chips arrive in front of a player. Currently a fade and an
   8px rise. Should feel like chips being pushed forward, with weight.
2. **Collecting to the pot** — every player's bet travels to the middle at the
   end of a street and merges into the pot stack. Stagger them; they should not
   all arrive at once. This is the money moment and it does not exist yet.
3. **Pushing the pot to a winner** — the pot travels out to the winning seat.
   Bigger, slower, more ceremonial than a collection.
4. **An all-in shove** — the whole stack goes forward at once. Should feel
   different from an ordinary bet without being a different animation.

Constraints on the motion:

- **Duration budget.** A collection has to finish inside ~600ms, because the next
  street is dealt behind it. A pot push can take up to ~1.2s. A bet arriving must
  be under 250ms — it happens on every single action and anything slower makes
  the table feel laggy.
- **Chips travel over a felt with players around the edge.** A path that arcs
  will cross other seats. Say what you do about that.
- **`prefers-reduced-motion`** must be honoured: give me the reduced variant of
  each, not just `animation: none`. Something should still communicate that
  chips moved.
- **Transform and opacity only** where you can. These run on tables with up to
  nine seats animating at once on a laptop.

## What to give me back

A single HTML file, self-contained, no external requests — inline CSS and SVG
only, no image files, no CDN, no webfonts. It should contain:

1. A **theme switcher** (three buttons) so I can see everything on each felt.
2. The **denomination sheet** — every chip at every size, plus the greyscale
   check.
3. A **live table mock-up**: an oval felt, six seat positions, a pot in the
   middle, and buttons that fire each of the four moments so I can watch them.
   Rough seats are fine — this is about the chips, not the seats.
4. The **CSS** for the chips and the keyframes, in a copyable block.
5. A short **note on the decisions**: what you changed about the colour
   assignments and why, what you did about the 9px problem, and what you had to
   give up.

Ask me anything you need before starting, especially if the size constraint
rules out a direction you would otherwise take.
