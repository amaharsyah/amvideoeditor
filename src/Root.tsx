import { Still } from "remotion";
import { BrandPreview } from "./BrandPreview";
import { MyComposition } from "./Composition";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <MyComposition />
      <Still id="BrandPreview" component={BrandPreview} width={1080} height={1920} />
    </>
  );
};
