// Registro de estilos de edición (cómo se monta), independientes de la paleta de marca (plantillas/).
// Cada anuncio elige el suyo en props.json con "edicion": "clasico" | "impacto".
import clasico from './clasico.json';
import impacto from './impacto.json';

export const ediciones = {clasico, impacto};
