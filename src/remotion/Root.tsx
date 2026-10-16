import React from "react";
import { Composition } from "remotion";
import { TimelineComposition, type TimelineCompositionProps } from "../editor/composition/TimelineComposition";
import { ASPECTS } from "../editor/presets";
import { projectDuration } from "../editor/utils";
import { DynamicComp } from "./DynamicComp";

const defaultCode = `import { AbsoluteFill } from "remotion";
export const MyAnimation = () => <AbsoluteFill style={{ backgroundColor: "#000" }} />;`;

/** Composition id the editor's server export renders (see /api/lambda/render-timeline). */
export const TIMELINE_COMP = "Timeline";

const emptyTimeline: TimelineCompositionProps = {
  project: {
    name: "",
    aspect: "16:9",
    fps: 30,
    tracks: [],
    clips: [],
    grade: { filter: "none", letterbox: false, vignette: false, grain: false },
  },
  assets: [],
};

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
        id={TIMELINE_COMP}
        component={TimelineComposition}
        durationInFrames={30}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={emptyTimeline}
        calculateMetadata={({ props }) => {
          const { project } = props as TimelineCompositionProps;
          const scale = Number((props as { scale?: number }).scale) || 1;
          const { width, height } = ASPECTS[project.aspect] ?? ASPECTS["16:9"];
          const even = (v: number) => Math.max(2, Math.round((v * scale) / 2) * 2);
          return {
            fps: project.fps,
            durationInFrames: Math.max(1, Math.ceil(projectDuration(project) * project.fps)),
            width: even(width),
            height: even(height),
          };
        }}
      />
    </>
  );
};
