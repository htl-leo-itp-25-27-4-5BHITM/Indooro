import "./index.css";
import {Composition,Folder} from 'remotion';
import {Film} from './Film';
import {Problem,Reveal,Search,Position,Route,List,Admin,Hero,Poster} from './scenes/Scenes';
import {scenes} from './design/tokens';

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="IndooroFilm" component={Film} durationInFrames={1950} fps={30} width={1920} height={1080}/>
      <Composition id="IndooroPoster" component={Poster} durationInFrames={1} fps={30} width={1920} height={1080}/>
      <Folder name="Scenes">{[Problem,Reveal,Search,Position,Route,List,Admin,Hero].map((component,i)=><Composition key={scenes[i].name} id={`IndooroScene${i+1}`} component={component} durationInFrames={scenes[i].duration} fps={30} width={1920} height={1080}/>)}</Folder>
    </>
  );
};
