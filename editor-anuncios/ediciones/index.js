// Registro de estilos de edición (cómo se monta), independientes de la paleta de marca (plantillas/).
// Cada anuncio elige el suyo en props.json con "edicion": clasico | impacto | nativo | documental | noticiero | explicador | intimo.
import clasico from './clasico.json';
import impacto from './impacto.json';
import nativo from './nativo.json';
import documental from './documental.json';
import noticiero from './noticiero.json';
import explicador from './explicador.json';
import intimo from './intimo.json';

export const ediciones = {clasico, impacto, nativo, documental, noticiero, explicador, intimo};
