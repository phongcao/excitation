import {
    adjacent,
  onSameLine,
  Bounds,
  CitationRegionsPerPage,
  DocIntResponse,
  Line,
  Polygon4,
  PolygonC,
  Word,
  excerptToSummary,
  flattenPolygon4,
  combinePolygons,
  PolygonOnPage,
  DocIntResponse,
  Line,
  Word,
  Column,
  Bounds,
  PolygonC,
  toPolygon4,
} from "./di";

//TODO: This may not be necessary if we build the excerpt differently?
export interface Column {
  polygon: number[];
  lines: Line[];
}


export const createCitationId = (formId: number, creator: string) => {
  return formId + "-" + creator + "-" + Date.now();
};

// Rounds a number to the given precision
const round = (value: number, precision = 0) => {
  const multiplier = Math.pow(10, precision);
  return Math.round(value * multiplier) / multiplier;
};

// // Return true if polygons overlap (including sharing borders); false otherwise
// // delta controls the amount of space that can be between polygons without them
// // being considered non-adjacent (i.e. accounts for spaces between words)
// const adjacent = (poly0: number[], poly1: number[], delta = 0.2) => {
//   const x0 = [round(poly0[0], 1), round(poly0[2], 1)];
//   const y0 = [round(poly0[1], 1), round(poly0[5], 1)];

//   const x1 = [round(poly1[0], 1), round(poly1[2], 1)];
//   const y1 = [round(poly1[1], 1), round(poly1[5], 1)];

//   // The rectangles don't overlap if one rectangle's minimum in some
//   // dimension is greater than the other's maximum in that dimension
//   const noOverlap =
//     x0[0] > x1[1] + delta ||
//     x1[0] > x0[1] + delta ||
//     y0[0] > y1[1] + delta ||
//     y1[0] > y0[1] + delta;
//   return !noOverlap;
// };

// from x(x0, x1) and y(y0, y1) create an 8 value polygon
const polygonize = (x: number[], y: number[]) => {
  return [x[0], y[0], x[1], y[0], x[1], y[1], x[0], y[1]];
};

/**
 * Converts an array of `CitationRegionsPerPage` objects into an array of `Bounds`,
 * representing citation bounding polygons on document pages.
 *
 * Each `CitationRegionsPerPage` contains citation regions (`head`, `body`, `tail`),
 * which are processed as follows:
 *  - The `head`, `body`, and `tail` polygons are copied and potentially adjusted.
 *  - If `forceOverlap` is `true`, overlapping adjustments ensure continuity:
 *    - If `head` exists but `body` is missing, and `tail` exists, the `head` is extended downward.
 *    - If `body` exists, it is adjusted to align with `head` (above) and `tail` (below).
 *    - `tail` remains unchanged except for being flattened.
 *
 * @param citationRegionsPerPage - An array of `CitationRegionsPerPage` objects,
 *   each containing a `page` number and associated `citationRegions` (polygon structures).
 * @param forceOverlap - (Optional, default: `false`) If `true`, modifies polygons to ensure
 *   vertical alignment between `head`, `body`, and `tail` regions.
 * @returns An array of `Bounds`, where each entry contains a `pageNumber` and a modified `polygon`.
 */
const convertCitationRegionsToBounds = (
  citationRegionsPerPage: CitationRegionsPerPage[],
  forceOverlap: boolean = false
): Bounds[] => {
  const bounds: Bounds[] = [];

  citationRegionsPerPage.forEach(({ page, citationRegions }) => {
    console.log("what is a citation region?", citationRegions)
        for (const region of citationRegions) {
            for (const polyC of region) {
                // Process head.
                console.log("ENTER THE FORLOOP", typeof(polyC))
                const head = polyC.head
                const body = polyC.body
                const tail = polyC.tail
                if (head) {
                    console.log("ENTER THE HEAD")
                    // Create a copy of the head polygon.
                    const modifiedHead = [...head];
                    // If body is missing, tail exists, and forceOverlap is true,
                    // extend the bottom edge of head to meet the tail.
                    if (forceOverlap && !body && tail) {
                    // For a Polygon4, the bottom edge y–values are at indices 5 and 7.
                    const headBottom = Math.max(modifiedHead[5], modifiedHead[7]);
                    // The tail's top edge y–values are at indices 1 and 3.
                    const tailTop = Math.min(tail[1], tail[3]);
                    // If the head's bottom is above the tail's top, extend it downward.
                    if (headBottom < tailTop) {
                        modifiedHead[5] = tailTop;
                        modifiedHead[7] = tailTop;
                    }
                    }
                    console.log("do we get here?", { pageNumber: page, polygon: modifiedHead })
                    bounds.push({ pageNumber: page, polygon: modifiedHead });
                }

                // Process body.
                if (body) {
                    // Create a copy of the body polygon.
                    const modifiedBody = [...body];

                    if (forceOverlap) {
                    // Adjust the top of the body relative to head.
                    if (head) {
                        // For a Polygon4, the head's bottom edge is at indices 5 and 7.
                        const headBottom = Math.max(head[5], head[7]);
                        // The top edge of the body is at indices 1 and 3.
                        const bodyTop = Math.min(modifiedBody[1], modifiedBody[3]);
                        if (headBottom < bodyTop) {
                        modifiedBody[1] = headBottom;
                        modifiedBody[3] = headBottom;
                        }
                    }
                    // Adjust the bottom of the body relative to tail.
                    if (tail) {
                        // The tail's top edge is at indices 1 and 3.
                        const tailTop = Math.min(tail[1], tail[3]);
                        // The bottom edge of the body is at indices 5 and 7.
                        const bodyBottom = Math.max(modifiedBody[5], modifiedBody[7]);
                        if (bodyBottom < tailTop) {
                        modifiedBody[5] = tailTop;
                        modifiedBody[7] = tailTop;
                        }
                    }
                    }
                    bounds.push({ pageNumber: page, polygon: modifiedBody });
                }

                // Process tail.
                if (tail) {
                    bounds.push({ pageNumber: page, polygon: flattenPolygon4(tail) });
                }
            };
        }
  });

  console.log("BOUNDS ON THE INSIDE", bounds)

  return bounds;
};

/**
 * Extracts citation text polygons from a `DocIntResponse` (DI output),
 * returning structured citation regions per page.
 *
 * This function:
 *  - Finds the excerpt text within the document.
 *  - Groups detected polygons by page.
 *  - Constructs `CitationRegionsPerPage` objects with citation region polygons.
 *  - Converts them into `Bounds`, applying `forceOverlap = true` for better highlighting experience.
 *
 * @param text - The citation text to locate within the document.
 * @param di - The `DocumentIntelligenceResponse`, containing recognized text and polygon data.
 * @returns An array of `Bounds`, each representing a citation region's bounding polygon
 *   with an associated `pageNumber`. Returns an empty array if the text is not found.
 */
export const returnTextPolygonsFromDI = (
  text: string,
  di: DocIntResponse
): Bounds[] => {
  // Attempt to find the excerpt in the document
  const summary = excerptToSummary(text, di);

  // If no excerpt or empty excerpt was found, return an empty array
  if (!summary.excerpt || summary.excerpt.trim().length === 0) {
    console.log("NO MATCH:", text);
    return [];
  }

  console.log("MATCH:", text);

  // Group polygons by page
  // summary.polygons already splits the text by region (paragraph), so each
  // `PolygonOnPage` is effectively a separate paragraph if the excerpt spans multiple paragraphs.
  const map = new Map<number, PolygonC[]>();
  console.log(summary.polygons)

  for (const { polygon, page } of summary.polygons) {
    if (!map.has(page)) {
      map.set(page, []);
    }
    map.get(page)!.push(polygon);
  }

  // Transform into the CitationRegionsPerPage structure
  const results: CitationRegionsPerPage[] = [];
  for (const [page, citationRegions] of map.entries()) {
    results.push({ page, citationRegions });
  }
  console.log("how about citationregionsperpage", results)

  // Sort by page ascending
  results.sort((a, b) => a.page - b.page);
  return convertCitationRegionsToBounds(results, false);
};

// compares a bounding regions polygon to a reference polygon
// both polys are assumed to be in the same column
// returns:
// - if poly is situated earlier in the page than refPoly
// 0 if poly is situated within/about refPoly
// + if poly is situated later in the page than refPoly
const comparePolygons = (poly: number[], refPoly: number[]) => {
  const x = [poly[0], poly[2]];
  const y = [poly[1], poly[5]];

  const refX = [refPoly[0], refPoly[2]];
  const refY = [refPoly[1], refPoly[5]];

  // first: how do they compare vertically?
  // poly is earlier in the column
  if (y[1] < refY[0]) return -1;
  // poly is later in the column
  if (y[0] > refY[1]) return 1;

  // then: how do they compare horizontally within the line?
  // poly is earlier in the line
  if (x[1] < refX[0]) return -2;
  // poly is later in the line
  if (x[0] > refX[1]) return 2;

  // if we're still here, poly overlaps refPoly
  return 0;
};

// starting from lines[axis] and working backward, find the first entry
// in lines that intersects with poly
const getFirstPolyIntersectionIndex = (
  lines: Line[],
  poly: number[],
  axis: number
) => {
  do axis--;
  while (axis >= 0 && comparePolygons(poly, lines[axis].polygon) == 0);
  return ++axis;
};

// starting from lines[axis] and working forward, find the last entry in
// lines that intersects with poly
const getLastPolyIntersectionIndex = (
  lines: Line[],
  poly: number[],
  axis: number
) => {
  do axis++;
  while (
    axis < lines.length &&
    comparePolygons(poly, lines[axis].polygon) == 0
  );
  return --axis;
};

// searches lines[start, end) (that is, inclusive of start and exclusive of end)
// for poly, in a binary search - compare against midpoint and move from there
const polygonBinarySearch = (
  lines: Line[],
  start: number,
  end: number,
  poly: number[]
) => {
  // no data whatsoever
  if (end == 0) {
    console.log("polygon search | no lines to search");
    return [];
  }
  // no intersections :(
  if (start == end) {
    console.log("polygon search | no further lines to search");
    return [];
  }

  // find the midpoint of the given range [start, end)
  const axis = Math.floor((end - start) / 2) + start;
  console.log(`polygon search | axis [${axis}]:`, lines[axis].content);

  // compare poly to the midpoint
  switch (comparePolygons(poly, lines[axis].polygon)) {
    case -2:
    case -1:
      return polygonBinarySearch(lines, start, axis, poly);

    case 0:
      return lines.slice(
        getFirstPolyIntersectionIndex(lines, poly, axis),
        getLastPolyIntersectionIndex(lines, poly, axis) + 1
      );

    case 1:
    case 2:
      return polygonBinarySearch(lines, axis + 1, end, poly);
  }
};

// compares offsetRange against refOffset. returns:
// - if offsetRange is earlier in the page than refOffset
// 0 if offsetRange contains refOffset
// + if offsetRange is later in the page than refOffset
const compareOffsets = (offsetRange: number[], refOffset: number) => {
  if (offsetRange[1] < refOffset) return -1;
  if (offsetRange[0] > refOffset) return 1;
  return 0;
};

// starting from words[axis] and working backward, find the first entry
// in words that overlaps with offsetRange
const getFirstOffsetIntersectionIndex = (
  words: Word[],
  axis: number,
  offsetRange: number[]
) => {
  do axis--;
  while (
    axis >= 0 &&
    compareOffsets(offsetRange, words[axis].span.offset) == 0
  );
  return ++axis;
};

// starting from words[axis] and working forward, find the last entry
// in words that overlaps with offsetRange
const getLastOffsetIntersectionIndex = (
  words: Word[],
  axis: number,
  offsetRange: number[]
) => {
  do axis++;
  while (
    axis < words.length &&
    compareOffsets(offsetRange, words[axis].span.offset) == 0
  );
  return --axis;
};

// searches words[start, end) (that is, inclusive of start and exclusive of end)
// for the words contained within the offset range
const offsetBinarySearch = (
  words: Word[],
  start: number,
  end: number,
  offsetRange: number[]
) => {
  if (end == 0) {
    console.log("offset search | no words to search");
    return [];
  }

  if (start == end) {
    console.log("offset search | no further words to search");
    return [];
  }

  const axis = Math.floor((end - start) / 2) + start;
  console.log(
    `offset search | axis [${axis}]: offset ${words[axis].span.offset}`
  );

  switch (compareOffsets(offsetRange, words[axis].span.offset)) {
    case -1:
      return offsetBinarySearch(words, start, axis, offsetRange);

    case 0:
      return words.slice(
        getFirstOffsetIntersectionIndex(words, axis, offsetRange),
        getLastOffsetIntersectionIndex(words, axis, offsetRange) + 1
      );

    case 1:
      return offsetBinarySearch(words, axis + 1, end, offsetRange);
  }
};

// Takes an array of lines and returns an array of Column items
// each of which is a polygon and an array of lines
const splitIntoColumns = (lines: Line[]) => {
  // no lines
  if (lines.length == 0)
    return [
      {
        polygon: [],
        lines: [],
      },
    ];
  // single line
  if (lines.length == 1)
    return [
      {
        polygon: lines[0].polygon,
        lines: lines,
      },
    ];

  const cols = [];
  let firstLineOfCol = 0;

  for (let currentLine = 0; currentLine < lines.length; currentLine++) {
    // is this the last line and therefore the end of the last column?
    // OR, is lines[currentLine + 1] a new column/section?
    if (
      currentLine == lines.length - 1 ||
      !adjacent(lines[currentLine + 1].polygon, lines[currentLine].polygon)
    ) {
      // let's wrap up the current column.
      const colLines = lines.slice(firstLineOfCol, currentLine + 1);
      // we combine all polys to make sure we capture the full width of the column
      // and don't accidentally just grab, say, a header (short) and a last line of
      // a paragraph (also short)
      const polygon = combinePolygons(
        colLines.map((line) => line.polygon as Polygon4)
      );
      cols.push({
        polygon: polygon,
        lines: colLines,
      });
      firstLineOfCol = currentLine + 1;
    }
  }

  console.log(`split ${lines.length} lines into ${cols.length} columns`);
  for (let index = 0; index < cols.length; index++) {
    const col = cols[index];
    console.log(
      `col [${index}]: "${col.lines[0].content}" ... ${
        col.lines.length - 2
      } more lines ... "${col.lines[col.lines.length - 1].content}"`
    );
  }

  return cols;
};

// from an array of Columns, find any where col.polygon intersects with poly
const getRelevantColumns = (columns: Column[], poly: number[]) => {
  return columns.filter((col) => comparePolygons(col.polygon, poly) == 0);
};

// Given bounds and a doc int response, find the most likely excerpt text
const findTextFromBoundingRegions = (
  response: DocIntResponse,
  bounds: Bounds[]
) => {
  const excerptWords = [];
  for (const bound of bounds) {
    console.log(
      `searching for bounds x(${bound.polygon[0]},${bound.polygon[2]}) y(${bound.polygon[1]},${bound.polygon[5]})`
    );
    // page numbers are 1-indexed, thus the subtraction
    const page = response.analyzeResult.pages[bound.pageNumber - 1];
    const lines = page.lines;
    const words = page.words;

    const columns = splitIntoColumns(lines) as Column[];
    const relevantColumns = getRelevantColumns(columns, bound.polygon);
    if (relevantColumns.length == 0)
      console.log("no relevant columns to search");

    const intersectingLines = [];
    for (const col of relevantColumns) {
      const index = columns.indexOf(col);
      console.log(`SEARCHING col [${index}]`);

      intersectingLines.push(
        ...polygonBinarySearch(col.lines, 0, col.lines.length, bound.polygon)
      );
    }

    if (intersectingLines.length == 0) continue;

    const offsetStart = intersectingLines[0].spans[0].offset;
    const lastLine = intersectingLines[intersectingLines.length - 1];
    const offsetEnd = lastLine.spans[0].offset + lastLine.spans[0].length;
    console.log("offset range for search:", offsetStart, offsetEnd);

    const intersectingWords = offsetBinarySearch(words, 0, words.length, [
      offsetStart,
      offsetEnd,
    ]);
    excerptWords.push(
      ...intersectingWords.filter(
        (word) => comparePolygons(word.polygon, bound.polygon) == 0
      )
    );
  }

  const excerpts = excerptWords.map((word) => word.content);
  let excerpt = excerpts.join(" ");
  if (excerpt === "") excerpt = "could not find matching line(s)";
  return excerpt;
};


//TODO: docstring
const findTextFromPolygonC = (
  response: DocIntResponse,
  incomingPolygonC: PolygonOnPage,
  incomingPolygonCParagraph: number,
) => {
  const excerptWords = [];
  const regionPage = response.analyzeResult.pages[incomingPolygonC.page - 1]
  const polygonRegion = regionPage.regions[incomingPolygonCParagraph]
  const regionPossibleWords = regionPage.words.slice(polygonRegion.wordIndices[0], polygonRegion.wordIndices[1]+1)
  console.log("these are the possible words?", regionPossibleWords)


  for (const word of regionPossibleWords){
    if ((incomingPolygonC.polygon.head !== undefined &&
        adjacent(word.polygon, incomingPolygonC.polygon.head, -0.05) &&
        onSameLine(word.polygon, incomingPolygonC.polygon.head, 0.9)
      ) || (incomingPolygonC.polygon.body !== undefined &&
        adjacent(word.polygon, incomingPolygonC.polygon.body, -0.1) &&
        onSameLine(word.polygon, incomingPolygonC.polygon.body, 0.9)
      ) || (incomingPolygonC.polygon.tail !== undefined &&
        adjacent(word.polygon, incomingPolygonC.polygon.tail, -0.05) &&
        onSameLine(word.polygon, incomingPolygonC.polygon.tail, 0.9)
      )) {
        excerptWords.push(word)
    }
    else { continue }
  }
  const excerpts = excerptWords.map((word) => word.content)
  return excerpts.join(" ");
}

const findParagraphFromBoundingPolygonC = (
  response: DocIntResponse,
  polyC: PolygonOnPage
) => {
  // PolygonC will have a head, a body, and a tail
  // find the paragraph(s) for each part
  const found_paragraphs: Set<number> = new Set();

    console.log("so what is the polygononpage", polyC)
  for (const pg of response.analyzeResult.pages) {

    if (pg.pageNumber !== polyC.page) { continue }
    else {
      // If the polygon for the paragraph from DI is adjacent/overlaps, add it to the set!
      pg.regions?.map((region, index) => {
        if (
          polyC.polygon.head !== undefined &&
            onSameLine(polyC.polygon.head, region.polygon, 0.9) &&
            adjacent(polyC.polygon.head, region.polygon, .1)
        ) {

          found_paragraphs.add(index)
        }
        else if (
            polyC.polygon.body !== undefined &&
          onSameLine(region.polygon, polyC.polygon.body, 0.9 ) &&
          adjacent(polyC.polygon.body, region.polygon, .1)
        ) {

          found_paragraphs.add(index)
        }
        else if (
            polyC.polygon.tail !== undefined &&
          onSameLine(region.polygon,polyC.polygon.tail, 0.9) &&
          adjacent(polyC.polygon.tail, region.polygon, .1)
        ) {
          found_paragraphs.add(index)
        }
      })

    }

  }
  if (found_paragraphs.size > 1) {
    console.log("weird, it should only be one paragraph-region per PolygonC. Found paragraph ids:", found_paragraphs)
  }
  else if (found_paragraphs.size <= 0) {
    console.log("weird, the selection should intersect with some paragraph-region, somehow. Found paragarphs:", found_paragraphs)
  }
  else {
    return found_paragraphs.values().next().value;
  }

};

// Takes in user selection information and a doc int response
// creates bounds from selection info
// and finds the most likely excerpt text
export function findUserSelection(
  pageNumber: number,
  range: Range,
  response: DocIntResponse
) {
  // Grab the rectangles from the selection
  const selectionRects = range.getClientRects();
  const selectionPolygons = [];

  for (const rect of selectionRects) {
    if (rect.width > 0) {
        const rectCoords = [
            rect.x, rect.y, // top left
            (rect.x + rect.width), rect.y, //top right
            (rect.x + rect.width), (rect.y + rect.height), //bottom right
            rect.x, (rect.y + rect.height) // bottom left
        ]

        selectionPolygons.push(toPolygon4(rectCoords))
    }
  }
  console.log("what are the detected polygons again?", selectionPolygons)

  // convert the pixel locations to inches for document intelligence
  const multiplier = 72;

  const topDiv = document.getElementById("answer-container")?.offsetHeight;
  const midDiv = document.getElementById("navbar")?.offsetHeight;
  const lowerDiv = document.getElementById("breadcrumbs")?.offsetHeight;
  const viewScrollTop = document.getElementById("viewer")?.scrollTop || 0;

  const dy =
    Math.round(window.scrollY) +
    (topDiv! + midDiv! + lowerDiv!) -
    viewScrollTop;

  const sideDiv = document.getElementById("sidebar")?.offsetWidth;
  const scrollLeft = document.getElementById("review-panel")?.scrollLeft || 0;

  const dx = Math.round(window.scrollY) + sideDiv! - scrollLeft;

  // Adjust coordinates to be in inches rather than pixels
  for (const poly of selectionPolygons) {
    // adjust the y coordinates on the top edge
    poly[1] = round((poly[1] - dy) / multiplier, 4);
    poly[3] = round((poly[3] - dy) / multiplier, 4);

  // adjust the x coordinates of the top edge
    poly[0] = round((poly[0] - dx) / multiplier, 4);
    poly[2] = round((poly[2] - dx) / multiplier, 4);

    //adjust the y coordinates of the bottom edge
    poly[5] = round((poly[5] - dy) / multiplier, 4);
    poly[7] = round((poly[7] - dy) / multiplier, 4);

    // adjust the x coordinates of the bottom edge
    poly[4] = round((poly[4] - dx) / multiplier, 4);
    poly[6] = round((poly[6] - dx) / multiplier, 4);
  }

  console.log("before we make them complex, here are the polygons in inches ", selectionPolygons)
  // Convert the collection of polygons (now in inches) to a complex polygon (PolygonC)
  const complexSelection: PolygonC[] = combinePolygons(selectionPolygons)

  console.log('complex polygon (with math done to it): ', complexSelection)

//   let bounds: Bounds[] = []
    let excerpt = ""
  for (const c of complexSelection){
    const complexSelectionOnPage: PolygonOnPage= {
        page: pageNumber,
        polygon: c,
    }
    const paragraphId = findParagraphFromBoundingPolygonC(response, complexSelectionOnPage);
    console.log('the highlighted text comes from the following paragraph(s):', paragraphId)
    excerpt += findTextFromPolygonC(response, complexSelectionOnPage, paragraphId)


    // if (c.head !== undefined) {
    //     bounds.push({
    //       pageNumber: pageNumber,
    //       polygon: c.head
    //     })
    // }
    // if (c.body !== undefined) {
    //     bounds.push({
    //       pageNumber: pageNumber,
    //       polygon: c.body
    //     })
    //   }
    // if (c.tail !== undefined) {
    //     bounds.push({
    //       pageNumber: pageNumber,
    //       polygon: c.tail
    //     })
    // }
  }
  const bounds: Bounds[] = returnTextPolygonsFromDI(excerpt, response)



//   const excerpt = findTextFromPolygonC(response, complexSelectionsOnPage, paragraphId)
//   console.log("found excerpt:", excerpt);
  console.log("the bounds are", bounds)






  return { excerpt, bounds };
}
