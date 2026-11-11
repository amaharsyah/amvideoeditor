import { Composition, staticFile, Still } from "remotion";
import { BrandPreview } from "./BrandPreview";
import { MyComposition } from "./Composition";
import { CoinReel, CoinReelProps } from "./reel/CoinReel";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Still id="BrandPreview" component={BrandPreview} width={1080} height={1920} />
      <Composition
        id="CoinReel"
        component={CoinReel}
        width={1080}
        height={1920}
        fps={30}
        durationInFrames={300}
        defaultProps={{ reel: "01-dana-darurat" } satisfies CoinReelProps}
        calculateMetadata={async ({ props }) => {
          const meta = await fetch(staticFile(`reels/${props.reel}/sim.json`)).then((r) => r.json());
          return { durationInFrames: meta.frames, fps: meta.fps };
        }}
      />
    </>
  );
};
