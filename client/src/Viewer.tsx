import { useState, useCallback, useEffect, useRef } from "react";
import { Document, Page } from "react-pdf";
import { TextContent } from "pdfjs-dist/types/src/display/api";
import polygonClipping from "polygon-clipping";
import { CursorRange, Point, Summary } from "./di";
import { rangeToSummary } from "./di/DI";

import {
  CheckmarkCircleFilled,
  CheckmarkCircleRegular,
  DismissCircleFilled,
  DismissCircleRegular,
  MoreCircleRegular,
  MoreCircleFilled,
} from "@fluentui/react-icons";

import { useDocFromId, useAppState, useAppStateValue } from "./State";
import { useDispatchHandler } from "./Hooks";
import { HoverableIcon } from "./Hooks.tsx";
import { LoadedState, Review } from "./Types";

const colors = ["#00acdc", "#00ac00", "#f07070"];
const multiple = 72;

// this type is defined deep in react-pdf and I can't figure out how to import it
// so here I just define the parts I need
interface PageCallback {
  height: number;
  width: number;
}

// Component for rendering the text-based selection highlights
const SelectionHighlight = ({
  summary,
  viewerWidth,
  viewerHeight,
}: {
  summary: Summary;
  viewerWidth: number;
  viewerHeight: number;
}) => {
  if (!summary.polygons || summary.polygons.length === 0) return null;

  // Convert polygons to paths for SVG rendering
  const allPaths: string[] = [];

  summary.polygons.forEach(({ polygon }) => {
    // Process head, body, and tail parts of the polygon
    const parts = [polygon.head, polygon.body, polygon.tail].filter(Boolean);

    parts.forEach((part) => {
      if (!part) return;

      // Convert polygon coordinates to SVG path
      const x1 = part[0];
      const y1 = part[1];
      const x2 = part[4];
      const y2 = part[5];

      // Create a rectangle path
      const path = `M ${x1 * multiple},${y1 * multiple} L ${x2 * multiple},${
        y1 * multiple
      } L ${x2 * multiple},${y2 * multiple} L ${x1 * multiple},${
        y2 * multiple
      } Z`;
      allPaths.push(path);
    });
  });

  return (
    <div
      className="viewer-citations"
      style={{
        width: viewerWidth,
        height: viewerHeight,
        zIndex: 999,
      }}
    >
      <svg
        className="highlight-svg"
        style={{
          width: viewerWidth,
          height: viewerHeight,
        }}
      >
        {allPaths.map((d, i) => (
          <path
            key={i}
            d={d}
            fill="rgba(0, 172, 220, 0.3)"
            stroke="var(--color-highlight)"
            strokeWidth={1}
          />
        ))}
      </svg>
    </div>
  );
};

export function Viewer() {
  const [state, dispatch] = useAppState();
  const { ux } = state as LoadedState;
  const { documentId, selectedCitation } = ux;
  const editing = selectedCitation?.editing;
  const docFromId = useDocFromId();
  const viewerRef = useRef<HTMLDivElement>(null);
  const [cursorStart, setCursorStart] = useState<Point | null>(null);

  // State for selection overlay
  const [isSelecting, setIsSelecting] = useState(false);
  const [selectionSummary, setSelectionSummary] = useState<Summary | null>(
    null
  );
  const [showAddCitation, setShowAddCitation] = useState(false);

  useEffect(() => {
    const viewerElem = viewerRef.current;
    if (!viewerElem) return;

    // Helper to check if the event target is inside a citation control element.
    const isCitationControl = (e: Event) => {
      return (e.target as HTMLElement).closest(".citation-control");
    };

    const handleMouseDown = (e: MouseEvent) => {
      // If the event target is part of a citation control, do nothing.
      if (isCitationControl(e)) return;

      // Get the viewer's bounding rectangle
      const rect = viewerElem.getBoundingClientRect();

      // Calculate the start point in PDF coordinates
      const startPoint: Point = {
        x: (e.clientX - rect.left) / multiple,
        y: (e.clientY - rect.top) / multiple,
      };

      // Start the selection process
      setIsSelecting(true);
      setCursorStart(startPoint);
      setSelectionSummary(null);
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Only update if we're in the middle of a selection
      if (
        !isSelecting ||
        !cursorStart ||
        ux.pageNumber === undefined ||
        ux.documentId === undefined
      )
        return;

      // Get the viewer's bounding rectangle
      const rect = viewerElem.getBoundingClientRect();

      // Calculate the current mouse position in PDF coordinates
      const currentPoint: Point = {
        x: (e.clientX - rect.left) / multiple,
        y: (e.clientY - rect.top) / multiple,
      };

      // Create a temporary cursor range for the current selection
      const tempCursorRange: CursorRange = {
        start: { page: ux.pageNumber, point: cursorStart },
        end: { page: ux.pageNumber, point: currentPoint },
      };

      // Get the text summary for the current selection
      const summary = rangeToSummary(
        tempCursorRange,
        docFromId[ux.documentId].di
      );

      // Update the selection summary
      setSelectionSummary(summary);
    };

    const handleMouseUp = (e: MouseEvent) => {
      // If the event target is part of a citation control, ignore it.
      if (isCitationControl(e)) return;
      if (!cursorStart || ux.pageNumber === undefined) return;

      // End the selection process
      setIsSelecting(false);

      // Get the viewer's bounding rectangle
      const rect = viewerElem.getBoundingClientRect();

      // Calculate the end point in PDF coordinates
      const endPoint: Point = {
        x: (e.clientX - rect.left) / multiple,
        y: (e.clientY - rect.top) / multiple,
      };

      // Only create a selection if it has a meaningful size
      if (
        Math.abs(endPoint.x - cursorStart.x) > 0.01 ||
        Math.abs(endPoint.y - cursorStart.y) > 0.01
      ) {
        // Build a CursorRange from the captured points.
        const cursorRange: CursorRange = {
          start: { page: ux.pageNumber, point: cursorStart },
          end: { page: ux.pageNumber, point: endPoint },
        };

        // Dispatch the action to store the new cursorRange.
        dispatch({ type: "setCursorRange", cursorRange });

        // Show the add citation button
        setShowAddCitation(true);
      }
    };

    // Add event listeners
    viewerElem.addEventListener("mousedown", handleMouseDown);
    viewerElem.addEventListener("mousemove", handleMouseMove);
    viewerElem.addEventListener("mouseup", handleMouseUp);

    // Also handle case where mouse leaves the viewer
    viewerElem.addEventListener("mouseleave", () => {
      if (isSelecting) {
        setIsSelecting(false);
      }
    });

    return () => {
      // Remove event listeners
      viewerElem.removeEventListener("mousedown", handleMouseDown);
      viewerElem.removeEventListener("mousemove", handleMouseMove);
      viewerElem.removeEventListener("mouseup", handleMouseUp);
      viewerElem.removeEventListener("mouseleave", () => {});
    };
  }, [
    cursorStart,
    isSelecting,
    ux.pageNumber,
    ux.documentId,
    docFromId,
    dispatch,
  ]);

  // Handler for adding a citation
  const handleAddCitation = useCallback(() => {
    if (ux.cursorRange) {
      dispatch({ type: "addSelection" });
      setShowAddCitation(false);
    }
  }, [dispatch, ux.cursorRange]);

  // Handler for canceling citation addition
  const handleCancelCitation = useCallback(() => {
    // Just hide the citation button without changing the cursor range
    // This allows the user to cancel the citation action
    setShowAddCitation(false);
  }, []);

  // Hide the add citation button when the cursor range changes or is cleared
  useEffect(() => {
    if (!ux.cursorRange) {
      setShowAddCitation(false);
    } else if (ux.documentId !== undefined) {
      // When cursor range is set, calculate the selection summary
      const summary = rangeToSummary(
        ux.cursorRange,
        docFromId[ux.documentId].di
      );
      setSelectionSummary(summary);
    }
  }, [ux.cursorRange, ux.documentId, docFromId]);

  const onDocumentLoadSuccess = useCallback(() => {}, []);

  const onTextLayerRender = useCallback(
    (text: TextContent) => {
      dispatch({
        type: "emptyTextLayer",
        isTextLayerEmpty: text.items.length == 0,
      });
    },
    [dispatch]
  );

  const updateViewerSize = useCallback(
    ({ height, width }: PageCallback) => {
      dispatch({
        type: "setViewerSize",
        width,
        height,
      });
    },
    [dispatch]
  );

  if (documentId !== undefined)
    console.log("pdf", docFromId[documentId].pdfUrl);

  return (
    <div ref={viewerRef} id="viewer-viewport">
      {documentId == undefined ? (
        <div>
          <p>You can select a document in the sidebar.</p>
        </div>
      ) : ux.pageNumber == undefined ? (
        <div>
          <p>
            The selected citation could not be found on the document. You may
            explore this document using the page navigation above.
          </p>
        </div>
      ) : (
        <>
          <Document
            file={docFromId[documentId].pdfUrl}
            onLoadSuccess={onDocumentLoadSuccess}
          >
            <Page
              pageNumber={ux.pageNumber}
              onRenderSuccess={updateViewerSize}
              className="viewer-page"
              renderAnnotationLayer={false}
              onGetTextSuccess={onTextLayerRender}
            />
          </Document>

          {/* Selection overlay - text-based highlighting */}
          {((isSelecting && selectionSummary) ||
            (showAddCitation && selectionSummary)) &&
            selectionSummary.polygons &&
            selectionSummary.polygons.length > 0 && (
              <SelectionHighlight
                summary={selectionSummary}
                viewerWidth={(state as LoadedState).viewer.width}
                viewerHeight={(state as LoadedState).viewer.height}
              />
            )}

          {/* Add citation button */}
          {showAddCitation &&
            !isSelecting &&
            ux.cursorRange &&
            selectionSummary &&
            selectionSummary.polygons &&
            selectionSummary.polygons.length > 0 && (
              <div
                className="citation-buttons-container"
                style={{
                  position: "absolute",
                  left: selectionSummary.polygons[0].polygon.head
                    ? ((selectionSummary.polygons[0].polygon.head[0] +
                        selectionSummary.polygons[0].polygon.head[4]) *
                        multiple) /
                        2 -
                      120 // Increased width to accommodate both buttons
                    : selectionSummary.polygons[0].polygon.body
                    ? ((selectionSummary.polygons[0].polygon.body[0] +
                        selectionSummary.polygons[0].polygon.body[4]) *
                        multiple) /
                        2 -
                      120
                    : selectionSummary.polygons[0].polygon.tail
                    ? ((selectionSummary.polygons[0].polygon.tail[0] +
                        selectionSummary.polygons[0].polygon.tail[4]) *
                        multiple) /
                        2 -
                      120
                    : 0,
                  top: selectionSummary.polygons[0].polygon.head
                    ? selectionSummary.polygons[0].polygon.head[1] * multiple -
                      40
                    : selectionSummary.polygons[0].polygon.body
                    ? selectionSummary.polygons[0].polygon.body[1] * multiple -
                      40
                    : selectionSummary.polygons[0].polygon.tail
                    ? selectionSummary.polygons[0].polygon.tail[1] * multiple -
                      40
                    : 0,
                  display: "flex",
                  gap: "10px",
                  zIndex: 1000,
                }}
              >
                <div
                  className="add-citation-button citation-control"
                  style={{
                    backgroundColor: "var(--color-highlight)",
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleAddCitation();
                  }}
                >
                  Add New Citation
                </div>
                <div
                  className="cancel-citation-button citation-control"
                  style={{
                    backgroundColor: "#6c757d", // Gray color for cancel button
                    color: "white",
                    padding: "8px 12px",
                    borderRadius: "4px",
                    cursor: "pointer",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleCancelCitation();
                  }}
                >
                  Cancel
                </div>
              </div>
            )}

          <ViewerCitations />
        </>
      )}
    </div>
  );
}

const ViewerCitations = () => {
  const { dispatchUnlessAsyncing } = useDispatchHandler();
  const { ux, questions, viewer } = useAppStateValue() as LoadedState;
  const { questionIndex, pageNumber, selectedCitation } = ux;

  if (!selectedCitation) return null;

  const { citationIndex, citationHighlights } = selectedCitation;

  const citation = questions[questionIndex].citations[citationIndex];
  const { review } = citation;
  const color = colors[review || 0];

  const polygons = citationHighlights.filter(
    (citationHighlight) => citationHighlight.pageNumber == ux.pageNumber
  )[0]?.polygons;

  if (!polygons) return null;
  const rectsForUnion: [number, number][][][] = polygons.map((poly) => {
    const x1 = poly[0];
    const y1 = poly[1];
    const x2 = poly[4];
    const y2 = poly[5];
    return [
      [
        [x1, y1],
        [x2, y1],
        [x2, y2],
        [x1, y2],
      ],
    ];
  });
  const unioned = polygonClipping.union(rectsForUnion);
  const ringToPath = (ring: number[][]) => {
    return (
      ring
        .map(
          (coords, i) =>
            `${i === 0 ? "M" : "L"} ${coords[0] * multiple},${
              coords[1] * multiple
            }`
        )
        .join(" ") + " Z"
    );
  };
  const allPaths: string[] = [];
  unioned.forEach((polygon) => {
    polygon.forEach((ring) => {
      allPaths.push(ringToPath(ring));
    });
  });

  const highlightSvg = (
    <svg
      className="highlight-svg"
      style={{
        width: viewer.width,
        height: viewer.height,
      }}
    >
      {allPaths.map((d, i) => (
        <path key={i} d={d} fill="none" stroke={color} strokeWidth={2} />
      ))}
    </svg>
  );

  const polygon = polygons[0];

  // for now we'll center the floater on top of the top polygon
  const height = 32;
  const highlightWidth = (polygon[4] - polygon[0]) * multiple;
  const highlightMiddle = polygon[0] * multiple + highlightWidth / 2;
  const width = Math.max(160, highlightWidth);
  const top = polygon[1] * multiple - height;
  const left = highlightMiddle - width / 2;

  const reviewCitation = (review: Review) =>
    dispatchUnlessAsyncing({
      type: "reviewCitation",
      review,
      citationIndex,
    });

  const Approved = () => (
    <HoverableIcon
      DefaultIcon={CheckmarkCircleFilled}
      HoverIcon={CheckmarkCircleRegular}
      key="approved"
      classes="approved on"
      onClick={reviewCitation(Review.Unreviewed)}
      floating={true}
    />
  );

  const Rejected = () => (
    <HoverableIcon
      DefaultIcon={DismissCircleFilled}
      HoverIcon={DismissCircleRegular}
      key="rejected"
      classes="rejected on"
      onClick={reviewCitation(Review.Unreviewed)}
      floating={true}
    />
  );

  const Approve = () => (
    <HoverableIcon
      DefaultIcon={CheckmarkCircleRegular}
      HoverIcon={CheckmarkCircleFilled}
      key="approve"
      classes="approved off citation-control"
      onClick={reviewCitation(Review.Approved)}
      floating={true}
    />
  );

  const Reject = () => (
    <HoverableIcon
      DefaultIcon={DismissCircleRegular}
      HoverIcon={DismissCircleFilled}
      key="reject"
      classes="rejected off citation-control"
      onClick={reviewCitation(Review.Rejected)}
      floating={true}
    />
  );

  const pageNumbers = citationHighlights.map(({ pageNumber }) => pageNumber);
  const citationPrev = pageNumbers.includes(pageNumber! - 1);
  const citationNext = pageNumbers.includes(pageNumber! + 1);

  const Prev = () => (
    <HoverableIcon
      DefaultIcon={MoreCircleRegular}
      HoverIcon={MoreCircleFilled}
      key="prev"
      classes="prev"
      onClick={dispatchUnlessAsyncing({ type: "prevPage" })}
      floating={true}
    />
  );

  const Next = () => (
    <HoverableIcon
      DefaultIcon={MoreCircleRegular}
      HoverIcon={MoreCircleFilled}
      key="next"
      classes="next"
      onClick={dispatchUnlessAsyncing({ type: "nextPage" })}
      floating={true}
    />
  );

  return (
    <div
      className="viewer-citations"
      style={{
        ...viewer,
        zIndex: 1000, //isError ? 1000 : 1,
      }}
    >
      {highlightSvg}
      <div
        id="floater"
        className={review === Review.Unreviewed ? "review" : "reviewed"}
        style={{ top, left, width, height, color }}
      >
        <div />
        {citationPrev ? <Prev /> : <div />}
        {review === Review.Unreviewed ? (
          <>
            <Approve /> <Reject />
          </>
        ) : review === Review.Approved ? (
          <Approved />
        ) : (
          <Rejected />
        )}
        {citationNext ? <Next /> : <div />}
        <div />
      </div>
    </div>
  );
};
