import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {Anuncio} from './Anuncio';
import claves from '../estilos/claves.json';

const demoWords = 'Tenemos más información que nunca e irónicamente estamos menos informados que nunca.'.split(' ')
  .map((text, i) => ({text, start: 0.3 + i * 0.32, end: 0.3 + i * 0.32 + 0.3}));

const Root = () => (
  <Composition id="Anuncio" component={Anuncio} fps={25} width={1080} height={1920}
    durationInFrames={150}
    defaultProps={{video: null, fondo: 'linear-gradient(160deg,#4a4038,#1d1a17)', words: demoWords,
      gancho: 'Más información que nunca. Menos contexto que nunca.',
      grandes: [{text: 'Apagón cultural', start: 3.0, dur: 1.5}], zooms: [], estilo: claves}}
    calculateMetadata={({props}) => props.duracion ? {durationInFrames: Math.round(props.duracion * 25)} : {}} />
);
registerRoot(Root);
