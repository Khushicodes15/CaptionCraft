import { Composition } from "remotion";
import { CaptionedVideo } from "../modules/remotion/CaptionedVideo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="CaptionedVideo"
        component={CaptionedVideo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={async ({ props }: { props: any }) => {
          const fps = props.fps || 30;
          let durationInFrames = props.durationInFrames;
          if (!durationInFrames && props.durationSec) {
            durationInFrames = Math.max(1, Math.round(props.durationSec * fps));
          }
          if (!durationInFrames && Array.isArray(props.captions) && props.captions.length > 0) {
            const maxEndMs = Math.max(...props.captions.map((c: any) => c.endMs || 0));
            if (maxEndMs > 0) {
              durationInFrames = Math.max(1, Math.ceil((maxEndMs / 1000) * fps));
            }
          }
          return {
            durationInFrames: durationInFrames || 300,
            fps,
            width: props.width || 1080,
            height: props.height || 1920,
            props,
          };
        }}
        defaultProps={{
          videoSrc: "",
          captions: [],
          emphasis: {},
          style: {} as any,
          position: { xPercent: 50, yPercent: 50, widthPercent: 80 },
          wordsPerLine: 4,
          styleOverrides: {},
          behindHeadMasks: {},
        }}
      />
    </>
  );
};
