// form https://github.com/marp-team/marp-cli/blob/67c92d146996e1ec1cd5b3aa536540e96047d7ff/src/utils/pdf.ts
const PdfLib = require('pdf-lib/dist/pdf-lib.min.js');

exports.PdfLib = PdfLib;

/**
 * @typedef {Object} PDFOutlineItem
 * @property {string} title
 * @property {number | [number, number, number]} [to]
 * @property {boolean} [italic]
 * @property {boolean} [bold]
 */

/**
 * @typedef {Object} PDFOutlineItemWithChildren
 * @property {string} title
 * @property {number | [number, number, number]} [to]
 * @property {boolean} [italic]
 * @property {boolean} [bold]
 * @property {PDFOutline[]} children
 * @property {boolean} open
 */

/**
 * @typedef {PDFOutlineItem | PDFOutlineItemWithChildren} PDFOutline
 */

/**
 * Walk through the outline items recursively.
 * @param {readonly PDFOutline[]} outlines
 * @param {Function} callback
 */
const walk = (outlines, callback) => {
  for (const outline of outlines) {
    const ret = callback(outline);
    if ('children' in outline && ret !== false) walk(outline.children, callback);
  }
};

/**
 * Flatten the outline structure into a single array.
 * @param {readonly PDFOutline[]} outlines
 * @returns {PDFOutline[]}
 */
const flatten = (outlines) => {
  const result = [];

  walk(outlines, (outline) => void result.push(outline));
  return result;
};

/**
 * Count the number of open items in the outline.
 * @param {readonly PDFOutline[]} outlines
 * @returns {number}
 */
const getOpeningCount = (outlines) => {
  let count = 0;

  walk(outlines, (outline) => {
    count += 1;
    return !('open' in outline && !outline.open);
  });

  return count;
};

/**
 * Set the outline for a PDF document.
 * @param {PDFDocument} doc
 * @param {readonly PDFOutline[]} outlines
 */
exports.setOutline = async (doc, outlines) => {
  const { PDFHexString } = PdfLib;

  // Refs
  const rootRef = doc.context.nextRef();
  const refMap = new WeakMap();

  for (const outline of flatten(outlines)) {
    refMap.set(outline, doc.context.nextRef());
  }

  const pageRefs = (() => {
    const refs = []

    doc.catalog.Pages().traverse((kid, ref) => {
      if (kid.get(kid.context.obj('Type'))?.toString() === '/Page') {
        refs.push(ref)
      }
    })

    return refs
  })()

  // Outlines
  const createOutline = (outlines, parent) => {
    const { length } = outlines

    for (let i = 0; i < length; i += 1) {
      const outline = outlines[i]
      const outlineRef = refMap.get(outline)

      const destOrAction = (() => {
        // if (typeof outline.to === 'string') {
        //   // URL
        //   return { A: { S: 'URI', URI: PDFHexString.fromText(outline.to) } }
        // } else
        if (typeof outline.to === 'number') {
          return { Dest: [pageRefs[outline.to], 'Fit'] }
        } else if (Array.isArray(outline.to)) {
          const page = doc.getPage(outline.to[0])
          const width = page.getWidth()
          const height = page.getHeight()

          return {
            Dest: [
              pageRefs[outline.to[0]],
              'XYZ',
              width * outline.to[1],
              height * outline.to[2],
              null,
            ],
          }
        }
        return {}
      })()

      const childrenDict = (() => {
        if ('children' in outline && outline.children.length > 0) {
          createOutline(outline.children, outlineRef)

          return {
            First: refMap.get(outline.children[0]),
            Last: refMap.get(outline.children[outline.children.length - 1]),
            Count: getOpeningCount(outline.children) * (outline.open ? 1 : -1),
          }
        }
        return {}
      })()

      doc.context.assign(
        outlineRef,
        doc.context.obj({
          Title: PDFHexString.fromText(outline.title),
          Parent: parent,
          ...(i > 0 ? { Prev: refMap.get(outlines[i - 1]) } : {}),
          ...(i < length - 1 ? { Next: refMap.get(outlines[i + 1]) } : {}),
          ...childrenDict,
          ...destOrAction,
          F: (outline.italic ? 1 : 0) | (outline.bold ? 2 : 0),
        })
      )
    }
  }

  createOutline(outlines, rootRef)

  // Root
  const rootCount = getOpeningCount(outlines)

  doc.context.assign(
    rootRef,
    doc.context.obj({
      Type: 'Outlines',
      ...(rootCount > 0
        ? {
            First: refMap.get(outlines[0]),
            Last: refMap.get(outlines[outlines.length - 1]),
          }
        : {}),
      Count: rootCount,
    })
  )

  doc.catalog.set(doc.context.obj('Outlines'), rootRef)
};
