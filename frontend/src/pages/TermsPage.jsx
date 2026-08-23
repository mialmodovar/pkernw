import LegalDocument, { Points, Section } from "../components/legal/LegalDocument";
import { CONTACT, UPDATED } from "./PrivacyPage";

// The place whose law applies, if it ever came to that. Left as a placeholder
// like the contact address: it is a fact about whoever runs this installation.
const JURISDICTION = "[your country]";

/**
 * What this app is, and what it is not.
 *
 * The second half of that is the part worth writing carefully. Coins are not
 * money and the euro figures are a shared notebook rather than a balance — an
 * app that blurred either of those would be describing something with rather
 * more paperwork attached to it.
 */
export default function TermsPage() {
  return (
    <LegalDocument title="Terms of service" updated={UPDATED}>
      <p>
        HomeGame is a poker app for a group of friends, run by one person for
        that group. Using it means agreeing to what is below, which is short
        because there is not much to it.
      </p>

      <Section title="No money is played for here">
        <p>
          Nothing on this app is real-money gambling. Coins are points: they are
          given away daily, earned by playing, cannot be bought, cannot be
          cashed out, and are worth nothing anywhere. No stake is ever taken and
          no winnings are ever paid.
        </p>
        <p>
          Where a game shows euros, the app is a notebook and nothing else. It
          records what players have agreed among themselves that a night was
          worth, so they can settle it between them, in person, however they
          like. No money passes through this app, no payment is processed, and
          nobody here is holding anybody's funds. What people do or do not pay
          each other is between them.
        </p>
      </Section>

      <Section title="Your account">
        <Points items={[
          "One account per person.",
          "Keep your recovery code. It is shown once and it is the way back in — losing it and your password together means losing the account.",
          "What happens under your account is yours, so do not hand it to anybody.",
          "You must be over eighteen.",
        ]} />
      </Section>

      <Section title="Playing fairly">
        <p>
          This is a game between people who know each other, and the rules are
          the ones you would expect at a kitchen table: no bots, no second
          accounts, no agreeing hands with another player, no showing your cards
          to somebody still in the pot. Whoever runs a tournament, or helps run a
          club, can remove a player from it. Whoever runs the app can close an
          account that spoils the game for everybody else.
        </p>
      </Section>

      <Section title="What you put in it">
        <p>
          Display names, avatars, chat and anything else you type or upload stays
          yours, and you are responsible for it. Nothing illegal, nothing
          abusive, and nothing you do not have the right to use. Any of it can be
          removed.
        </p>
      </Section>

      <Section title="It might break">
        <p>
          This is a free app maintained in somebody's spare time. It may be
          unavailable, may lose a hand, may lose a tournament, and may lose data.
          It is provided as it is, with no warranty of any kind, and nobody is
          liable for anything that comes of using it — including anything anybody
          believes they are owed as a result of a game played on it.
        </p>
      </Section>

      <Section title="Ending it">
        <p>
          Stop using it whenever you like, and write to {CONTACT} to have your
          account removed. An account may be closed for breaking the rules above.
        </p>
      </Section>

      <Section title="Changes and law">
        <p>
          If these change, the date at the top changes with them. The law of{" "}
          {JURISDICTION} applies to anything that cannot be settled by talking
          about it.
        </p>
      </Section>

      <Section title="Contact">
        <p>{CONTACT}</p>
      </Section>
    </LegalDocument>
  );
}
