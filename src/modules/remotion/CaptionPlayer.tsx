import { Player, type PlayerRef } from "@remotion/player";
import { forwardRef, useEffect, useState } from "react";
import { delayRender, continueRender } from "remotion";

import { CaptionedVideo, type CaptionedVideoProps } from "./CaptionedVideo";

type Props = CaptionedVideoProps & {
  durationSec: number;
  width: number;
  height: number;
  fps?: number;
};

const CaptionPlayer = forwardRef<PlayerRef, Props>(function CaptionPlayer(
  { durationSec, width, height, fps = 30, ...composition },
  ref,
) {
  const [handle] = useState(() => delayRender());

  useEffect(() => {
    document.fonts.ready.then(() => {
      continueRender(handle);
    });
  }, [handle]);

  const safeWidth = width > 0 ? width : 1080;
  const safeHeight = height > 0 ? height : 1920;

  return (
    <Player
      ref={ref}
      component={CaptionedVideo}
      inputProps={composition}
      durationInFrames={Math.max(1, Math.round(durationSec * fps))}
      fps={fps}
      compositionWidth={safeWidth}
      compositionHeight={safeHeight}
      controls
      style={{ width: "100%", height: "100%", borderRadius: 14, overflow: "hidden" }}
      acknowledgeRemotionLicense
    />
  );
});

export default CaptionPlayer;
