import { loadFont } from "@remotion/fonts";
import { staticFile } from "remotion";

/**
 * Brand tokens: personal finance educator, maroon identity.
 * See brand/STYLE.md for how each one is used.
 */
export const colors = {
  /** Primary brand colour: keyword highlight pills, bars, CTA. */
  maroon: "#7B1E2B",
  /** Darker maroon for gradients, shadows and full-screen title cards. */
  maroonDeep: "#4A0E17",
  /** Lighter maroon for thin lines and hover-style accents. */
  maroonLight: "#A8344A",
  /** Gold accent: money figures, percentages, the "result" in a sentence. */
  gold: "#D4A857",
  /** Warm off-white: caption text and backgrounds of title cards. */
  cream: "#F7F0E6",
  /** Near-black: text on cream, caption outline/shadow. */
  ink: "#141012",
} as const;

// Fonts are bundled in public/fonts (SIL Open Font License) so renders never
// depend on network access to Google Fonts.
for (const weight of ["600", "800", "900"]) {
  loadFont({
    family: "Montserrat",
    url: staticFile(`fonts/Montserrat-${weight}.woff2`),
    weight,
    style: "normal",
  });
}
loadFont({
  family: "Playfair Display",
  url: staticFile("fonts/PlayfairDisplay-700-italic.woff2"),
  weight: "700",
  style: "italic",
});

export const fonts = {
  /** Captions, hooks, labels. */
  sans: "Montserrat, sans-serif",
  /** Occasional elegant emphasis (one word per hook, at most). */
  serif: "'Playfair Display', serif",
} as const;

/** 1080x1920 frame layout. Keep text inside the safe area. */
export const layout = {
  width: 1080,
  height: 1920,
  fps: 30,
  /** Instagram UI covers roughly the top 220px and bottom 420px, right 140px. */
  safe: { top: 220, bottom: 420, left: 72, right: 140 },
  /** Vertical centre line for captions (just above the bottom UI). */
  captionY: 1240,
} as const;

export const captionStyle = {
  fontFamily: fonts.sans,
  fontWeight: 900,
  fontSize: 78,
  color: colors.cream,
  /** Max words visible at once. */
  maxWords: 3,
  textShadow: `0 4px 0 ${colors.ink}, 0 0 24px rgba(20,16,18,0.55)`,
  /** Keyword highlight: cream text on a maroon pill. */
  highlight: { background: colors.maroon, color: colors.cream, padding: "4px 18px", radius: 14 },
  /** Money/number highlight. */
  numberColor: colors.gold,
} as const;
