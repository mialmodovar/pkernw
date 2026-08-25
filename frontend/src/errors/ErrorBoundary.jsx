import { Component } from "react";

import { crashReport, noteCrash } from "./crashLog";

/**
 * What happens when something throws while the page is being drawn.
 *
 * Without one of these, React 19 answers a throw in any component by throwing
 * the whole tree away — every panel, the felt, the buttons, the header — and
 * what a player is left looking at is a white screen. That is what "the browser
 * crashed" has meant in most of the reports: not the tab dying, one line of
 * render code failing and taking the application with it. Reloading appears to
 * fix it because reloading is the only thing left to do.
 *
 * So: catch it, say so, and offer the reload rather than requiring the player
 * to work out that it is needed. And write it down — see crashLog.js — because
 * the useful half of a crash report is the half that is otherwise gone by the
 * time anybody is asked about it.
 *
 * `children` is what it is guarding. `label` names it, so the message can say
 * which part of the page stopped rather than "something".
 */
export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    noteCrash(error, this.props.label || "render");
    // React's own trace, which names the component that threw — the one piece
    // of the picture the error itself does not carry.
    if (info?.componentStack) console.error(info.componentStack);
  }

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    const details = crashReport();

    return (
      <div className="min-h-full flex items-center justify-center p-6">
        <div className="panel rounded-lg max-w-md w-full p-5 space-y-3 text-center">
          <h1 className="text-base font-semibold text-(--color-silver)">
            {this.props.label ? `The ${this.props.label} stopped` : "Something stopped"}
          </h1>
          {/* Said plainly, because the first thing a player wants to know at a
              table is whether their chips are in danger. They are not: the hand
              is played on the server and the seat is still there. */}
          <p className="text-xs text-(--color-text-muted) leading-relaxed">
            This page hit a problem and could not carry on drawing. Your seat and
            your chips are safe — the game is running on the server. Reloading
            puts you back at the table.
          </p>
          <p className="text-[11px] font-mono break-words text-[#c76b7a]">
            {String(error.message || error)}
          </p>
          <div className="flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-accent px-3 py-1.5 rounded text-xs font-semibold"
            >
              Reload the table
            </button>
            {/* So a report from a player is worth reading. Without it the
                message we get is "it crashed again", which is what we have
                been trying to chase. */}
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(details).catch(() => {})}
              className="btn-secondary px-3 py-1.5 rounded text-xs font-semibold"
            >
              Copy details
            </button>
          </div>
        </div>
      </div>
    );
  }
}
