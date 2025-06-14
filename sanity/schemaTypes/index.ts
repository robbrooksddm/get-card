/* sanity/schemaTypes/index.ts
   – central export for all document / object types
   -------------------------------------------------------------- */

import cardTemplate  from './cardTemplate'
import cardProduct   from './cardProduct'
import productMockup from './productMockup'
import sitePage      from './sitePage'

/* AI-related ---------------------------------------------------- */
import aiPlaceholder from './aiPlaceholder'
import aiLayer       from './aiLayer'

/* core editable objects ---------------------------------------- */
import editableImage from './editableImage'
import editableText  from './editableText'
import heroSection   from './heroSection'
import printSpec     from './printSpec'

/* facet look-ups ----------------------------------------------- */
import occasion from './occasion'   // ← RE-ADDED ✔
import audience from './audience'   // ← RE-ADDED ✔
import theme    from './theme'      // ← RE-ADDED ✔
import relation from './relation'   // ← RE-ADDED ✔

/* one flat array that Studio expects --------------------------- */
export const schemaTypes = [
  /* documents */
  cardTemplate,
  cardProduct,
  productMockup,
  sitePage,
  aiPlaceholder,
  printSpec,

  /* objects */
  aiLayer,
  editableImage,
  editableText,
  heroSection,

  /* facets */
  occasion,
  audience,
  theme,
  relation,
]

export default schemaTypes
