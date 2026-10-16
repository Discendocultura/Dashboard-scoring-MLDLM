import React from 'react';
import {registerRoot, Composition} from 'remotion';
import {Anuncio} from './Anuncio';
import {plantillas} from '../plantillas';
import {ediciones} from '../ediciones';

const FPS = 25;
const demoWords = 'Tenemos más información que nunca e irónicamente estamos menos informados que nunca.'.split(' ')
  .map((text, i) => ({text, start: 0.3 + i * 0.32, end: 0.3 + i * 0.32 + 0.3}));

// La paleta se elige en props.json con "plantilla" (claves, discendo, mldlm…) y el estilo de edición con "edicion" (clasico, impacto)
const Root = () => (
  <Composition id="Anuncio" component={Anuncio} fps={FPS} width={1080} height={1920}
    durationInFrames={150}
    defaultProps={{plantilla: 'claves', video: null, fondo: 'linear-gradient(160deg,#4a4038,#1d1a17)', words: demoWords,
      gancho: 'Más información que nunca. Menos contexto que nunca.',
      grandes: [{text: 'Apagón cultural', start: 3.0, dur: 1.5}], zooms: []}}
    calculateMetadata={({props}) => {
      const estilo = plantillas[props.plantilla];
      if (!estilo) throw new Error(`Plantilla desconocida: ${props.plantilla}. Disponibles: ${Object.keys(plantillas).join(', ')}`);
      const ed = ediciones[props.edicion || 'clasico'];
      if (!ed) throw new Error(`Estilo de edición desconocido: ${props.edicion}. Disponibles: ${Object.keys(ediciones).join(', ')}`);
      return {props: {...props, estilo, ed}, ...(props.duracion ? {durationInFrames: Math.round(props.duracion * FPS)} : {})};
    }} />
);
registerRoot(Root);
