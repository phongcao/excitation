// client/src/debugUtils.ts
export function computeDebugPolygon(
  range: Range,
  pageNumber: number
): number[] | undefined {
  // This snippet is nearly identical to the bounding-rectangle calculation
  // in your findUserSelection function. The difference is that we only want
  // the polygon from .getBoundingClientRect() – no excerpt or docInt needed.

  const rect = range.getBoundingClientRect();
  let { top, left, bottom, right } = rect;

  const multiplier = 72; // 1 inch => 72 PDF points

  // If you have any offset logic, replicate it:
  // e.g. your topDiv, midDiv, etc.
  const topDiv = document.getElementById("answer-container")?.offsetHeight || 0;
  const midDiv = document.getElementById("navbar")?.offsetHeight || 0;
  const lowerDiv = document.getElementById("breadcrumbs")?.offsetHeight || 0;
  const sideDiv = document.getElementById("sidebar")?.offsetWidth || 0;
  const viewScrollTop = document.getElementById("viewer")?.scrollTop || 0;
  const scrollLeft = document.getElementById("review-panel")?.scrollLeft || 0;
  const dy =
    Math.round(window.scrollY) + (topDiv + midDiv + lowerDiv) - viewScrollTop;
  const dx = Math.round(window.scrollY) + sideDiv - scrollLeft;

  top = (top - dy) / multiplier;
  bottom = (bottom - dy) / multiplier;
  left = (left - dx) / multiplier;
  right = (right - dx) / multiplier;

  // You might want to clamp or round
  // e.g. round to 4 decimal places or check for negative
  if (top < 0 && bottom < 0) return undefined;
  if (left < 0 && right < 0) return undefined;

  // Return a simple 8-value array in PDF “page coordinate” space
  return [left, top, right, top, right, bottom, left, bottom];
}
