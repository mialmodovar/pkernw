import LegalDocument, { Points, Section } from "../components/legal/LegalDocument";

// Whoever runs this installation, and where to reach them. Left as a
// placeholder on purpose: publishing somebody's email address is their decision
// to make, not this file's. Both documents read it from here.
export const CONTACT = "[your contact email]";
export const UPDATED = "23 August 2026";

/**
 * What this app knows about the people who play on it.
 *
 * Written from the code rather than from a template: every paragraph here names
 * something the app actually stores or actually does, and the things it does not
 * do are worth as much space as the things it does. A privacy policy that
 * promises a deletion button this app has never had would be a worse document
 * than one that says "ask me and I will do it by hand".
 */
export default function PrivacyPage() {
  return (
    <LegalDocument title="Privacy policy" updated={UPDATED}>
      <p>
        HomeGame is a poker app for a group of friends. It is run by one person,
        for that group, and it is not a business. There are no adverts, no
        analytics, no trackers and nothing is sold to anybody — this document is
        mostly a list of the small number of things it does keep.
      </p>

      <Section title="What it keeps about you">
        <Points items={[
          "Your username, and your password stored as a hash. Nobody, including whoever runs this, can read your password.",
          "Your recovery code, also as a hash. It is shown to you once, when your account is made, and cannot be read again afterwards.",
          "A display name, an avatar and a theme, if you set them. An uploaded picture is kept in the database as bytes.",
          "Your Google account's identifier and email address, only if you choose to connect one. Connecting is never automatic.",
          "What you have played: tournaments, hands, the actions in them, chips, coins, cash-game results, missions, side bets and knockouts.",
          "Who you play with: the clubs you are in, the leagues and tables they keep, and the players you have chosen to watch.",
          "When you were last online, so a table knows whether to wait for you.",
          "Amounts you and other players record as owed between yourselves — see the terms about what those are and are not.",
        ]} />
      </Section>

      <Section title="What it does not keep">
        <Points items={[
          "No email address, unless you connect a Google account. Nothing is ever emailed to you: password recovery is a code, not a link.",
          "No payment details of any kind. No money passes through this app at all.",
          "No location, no address book, no device identifiers, no advertising profile.",
          "No analytics and no third-party scripts, apart from Google's own sign-in library on the login page, and only where signing in with Google is switched on.",
        ]} />
      </Section>

      <Section title="Your browser">
        <p>
          Signing in stores two tokens in your browser's local storage, which is
          what keeps you signed in; clearing your browser data signs you out.
          Your theme and the tab you were last on are kept the same way, because
          they are about this browser rather than about you. There are no
          tracking cookies.
        </p>
      </Section>

      <Section title="Camera and microphone at the table">
        <p>
          If you turn them on, video and voice go directly between the players at
          your table, peer to peer. They are never recorded and never stored, and
          they do not pass through this app's server — only the messages that let
          two browsers find each other do. Finding each other uses Google's
          public STUN servers, which see the network addresses involved and
          nothing else. Turn them off and none of this happens.
        </p>
      </Section>

      <Section title="What other players can see">
        <p>
          Your display name, your avatar, your results, and whether you are
          online. Inside a club, the league tables it keeps. Your cards are
          yours: the server sends a hand only to the player holding it, and
          anything face up is either a showdown or something you chose to show.
        </p>
      </Section>

      <Section title="Who else sees any of it">
        <p>
          Nobody. It is not shared, sold or handed to anybody. The app runs on
          Railway, which stores the database and therefore holds the data as an
          infrastructure provider. If you sign in with Google, Google knows you
          signed in — that is the whole of what they are told, and it happens
          only if you press the button.
        </p>
      </Section>

      <Section title="Keeping it and getting rid of it">
        <p>
          Your account and what you have played are kept for as long as the app
          runs, because a league table with a player missing out of the middle of
          it is not a league table. There is no button that deletes an account:
          write to {CONTACT} and it will be done by hand, along with your
          results if you want those gone too. Ask what is held about you and you
          will be sent it.
        </p>
      </Section>

      <Section title="Keeping it safe">
        <p>
          Everything goes over HTTPS. Passwords and recovery codes are hashed
          with Django's own hashing, never stored in a form anybody can read. It
          is an honest effort rather than a certified one: this is a friends'
          poker app run by one person, and it should not be trusted with a
          password you use anywhere else.
        </p>
      </Section>

      <Section title="Who this is for">
        <p>
          Adults. Poker, even for nothing, is not for children, and accounts are
          for people over eighteen.
        </p>
      </Section>

      <Section title="Changes">
        <p>
          If this changes, the date at the top changes with it. Nothing here will
          quietly start describing something else.
        </p>
      </Section>

      <Section title="Contact">
        <p>{CONTACT}</p>
      </Section>
    </LegalDocument>
  );
}
