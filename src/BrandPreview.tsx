import { AbsoluteFill } from "remotion";
import { captionStyle, colors, fonts, layout } from "./brand";

/**
 * A single still that shows the brand look on a 1080x1920 frame:
 * hook title, word-by-word caption with keyword + number highlight,
 * and the colour palette. The grey area stands in for the speaker footage.
 */
export const BrandPreview: React.FC = () => {
  const swatches: [string, string][] = [
    ["Maroon", colors.maroon],
    ["Maroon Deep", colors.maroonDeep],
    ["Gold", colors.gold],
    ["Cream", colors.cream],
    ["Ink", colors.ink],
  ];

  return (
    <AbsoluteFill style={{ background: colors.ink, fontFamily: fonts.sans }}>
      {/* Stand-in for the talking-head footage */}
      <AbsoluteFill
        style={{
          background: `radial-gradient(ellipse at 50% 45%, #5b5250 0%, #2b2526 55%, ${colors.ink} 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: 560,
          transform: "translateX(-50%)",
          width: 460,
          height: 620,
          borderRadius: "230px 230px 60px 60px",
          background: "rgba(255,255,255,0.06)",
          color: "rgba(255,255,255,0.35)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: 34,
          fontWeight: 600,
        }}
      >
        (video Anda)
      </div>

      {/* Hook */}
      <div
        style={{
          position: "absolute",
          top: layout.safe.top + 40,
          left: layout.safe.left,
          right: layout.safe.left,
          textAlign: "center",
        }}
      >
        <div
          style={{
            display: "inline-block",
            background: colors.maroon,
            color: colors.cream,
            fontWeight: 800,
            fontSize: 30,
            letterSpacing: 4,
            padding: "10px 26px",
            borderRadius: 999,
            marginBottom: 28,
          }}
        >
          KEUANGAN · BISNIS
        </div>
        <div style={{ color: colors.cream, fontWeight: 900, fontSize: 92, lineHeight: 1.05 }}>
          3 kesalahan yang bikin{" "}
          <span style={{ fontFamily: fonts.serif, fontStyle: "italic", fontWeight: 700, color: colors.gold }}>
            bisnismu
          </span>{" "}
          rugi
        </div>
      </div>

      {/* Caption, word-by-word style */}
      <div
        style={{
          position: "absolute",
          top: layout.captionY,
          left: layout.safe.left,
          right: layout.safe.left,
          textAlign: "center",
          fontWeight: captionStyle.fontWeight,
          fontSize: captionStyle.fontSize,
          color: captionStyle.color,
          textShadow: captionStyle.textShadow,
          lineHeight: 1.3,
        }}
      >
        omzet naik{" "}
        <span style={{ color: captionStyle.numberColor }}>40%</span>
        <br />
        tapi{" "}
        <span
          style={{
            background: captionStyle.highlight.background,
            color: captionStyle.highlight.color,
            padding: captionStyle.highlight.padding,
            borderRadius: captionStyle.highlight.radius,
            textShadow: "none",
          }}
        >
          kas kosong
        </span>
      </div>

      {/* Palette */}
      <div
        style={{
          position: "absolute",
          bottom: 90,
          left: layout.safe.left,
          right: layout.safe.left,
          display: "flex",
          gap: 16,
        }}
      >
        {swatches.map(([name, hex]) => (
          <div key={name} style={{ flex: 1, textAlign: "center" }}>
            <div
              style={{
                height: 110,
                borderRadius: 18,
                background: hex,
                border: "2px solid rgba(255,255,255,0.15)",
              }}
            />
            <div style={{ color: colors.cream, fontSize: 22, fontWeight: 800, marginTop: 10 }}>{name}</div>
            <div style={{ color: "rgba(247,240,230,0.6)", fontSize: 20, fontWeight: 600 }}>{hex}</div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
};
