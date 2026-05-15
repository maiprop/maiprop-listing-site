import { Composition } from "remotion";
import { MainVideo } from "./MainVideo";
import { StakeholderVideo } from "./StakeholderVideo";
import { stakeholderVideos } from "./stakeholderData";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="main"
        component={MainVideo}
        durationInFrames={978}
        fps={30}
        width={1920}
        height={1080}
      />
      {stakeholderVideos.map((spec) => (
        <Composition
          key={spec.id}
          id={`stakeholder-${spec.id}`}
          component={StakeholderVideo}
          durationInFrames={2100}
          fps={30}
          width={1920}
          height={1080}
          defaultProps={{ spec }}
        />
      ))}
    </>
  );
};
