import { test, expect } from "vitest";
import { createPerPageRegions } from "../../Preprocess";
import { DocIntResponse, Polygon4 } from "../../Types";

/** A mock polygon for lines/words. */
const poly: Polygon4 = [100, 100, 200, 100, 200, 150, 100, 150];

test("createPerPageRegions assigns correct wordIndices using real page.words", () => {
  const fakeDoc: DocIntResponse = {
    status: "succeeded",
    createdDateTime: "",
    lastUpdatedDateTime: "",
    analyzeResult: {
      apiVersion: "2023-07-31",
      modelId: "mockModel",
      stringIndexType: "utf16CodeUnit",
      pages: [
        {
          pageNumber: 1,
          angle: 0,
          width: 612,
          height: 792,
          unit: "pixel",
          words: [
            {
              content: "First",
              polygon: poly,
              confidence: 1,
              span: { offset: 0, length: 5 },
            },
            {
              content: "line",
              polygon: poly,
              confidence: 1,
              span: { offset: 6, length: 4 },
            },
            {
              content: "of",
              polygon: poly,
              confidence: 1,
              span: { offset: 11, length: 2 },
            },
            {
              content: "text,",
              polygon: poly,
              confidence: 1,
              span: { offset: 14, length: 5 }, // includes comma
            },
            {
              content: "second",
              polygon: poly,
              confidence: 1,
              span: { offset: 20, length: 6 },
            },
            {
              content: "line",
              polygon: poly,
              confidence: 1,
              span: { offset: 27, length: 4 },
            },
            {
              content: "of",
              polygon: poly,
              confidence: 1,
              span: { offset: 32, length: 2 },
            },
            {
              content: "text",
              polygon: poly,
              confidence: 1,
              span: { offset: 35, length: 4 },
            },
          ],
          // The lines mention offsets that encompass the full string
          lines: [
            {
              content: "First line   of text,",
              polygon: poly,
              spans: [{ offset: 0, length: 19 }],
            },
            {
              content: "second line of text",
              polygon: poly,
              spans: [{ offset: 20, length: 19 }],
            },
          ],
          spans: [],
        },
      ],
      paragraphs: [
        {
          content: "First line   of text, second line of text",
          spans: [{ offset: 0, length: 39 }],
          boundingRegions: [
            {
              pageNumber: 1,
              polygon: poly,
            },
          ],
        },
      ],
      tables: [],
      styles: [],
    },
  };

  createPerPageRegions(fakeDoc);

  // Validate that we have a single region on page 1 that covers the entire paragraph
  const page1 = fakeDoc.analyzeResult.pages[0];
  expect(page1.regions).toBeDefined();
  expect(page1.regions?.length).toBe(1);

  const region = page1.regions![0];
  // lineIndices => [0, 1] because both lines are included
  expect(region.lineIndices).toEqual([0, 1]);

  // wordIndices => should cover all words from 0..7
  expect(region.wordIndices).toEqual([0, 7]);

  // Confirm it references paragraphIndex=0
  expect(region.paragraphIndex).toBe(0);
});
