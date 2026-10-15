import React from "react";
import { Composition } from "remotion";
import {
  calculateMontageMetadata,
  MONTAGE_SIZES,
  MontageComposition,
  totalFrames,
} from "../montage/composition/MontageComposition";
import { SAMPLE_MONTAGE } from "../montage/sample";
import { DynamicComp } from "./DynamicComp";

const defaultCode = `import { AbsoluteFill } from "remotion";
export const MyAnimation = () => <AbsoluteFill style={{ backgroundColor: "#000" }} />;`;

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="DynamicComp"
        component={DynamicComp}
        durationInFrames={180}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{ code: defaultCode }}
        calculateMetadata={({ props }) => ({
          durationInFrames: props.durationInFrames as number,
          fps: props.fps as number,
        })}
      />
      <Composition
        id="AiMontage"
        component={MontageComposition}
        durationInFrames={totalFrames(SAMPLE_MONTAGE)}
        fps={SAMPLE_MONTAGE.fps}
        {...MONTAGE_SIZES[SAMPLE_MONTAGE.aspect]}
        defaultProps={{ montage: SAMPLE_MONTAGE }}
        calculateMetadata={calculateMontageMetadata}
      />
    </>
  );
};
