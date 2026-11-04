/**
 * Public routing API (domain/routing). Ported from Indooro:
 *  - backend/.../customer/route.js + layout.js (grid, A*, nearest-neighbour ordering)
 *  - swift/.../Utilities/TourPlanner.swift (nearest neighbour + 2-opt, maxPasses 50, min gain 0.01)
 *  - swift/.../Utilities/IndoorGraph.swift (turn-penalty idea)
 * Units: 1 cell = 1 m.
 */
export type { Grid } from "./grid";
export { buildGrid, isWalkable, snapToWalkable, rectCells } from "./grid";
export { accessCellFor } from "./access";
export { findPath, countTurns, distancesFrom, DEFAULT_TURN_PENALTY } from "./astar";
export type { PathOptions } from "./astar";
export { planRoute } from "./plan";
export type { PlanOptions } from "./plan";
export { entranceCell, checkoutCell } from "./anchors";
export { nearestNeighbour, twoOpt, optimiseOrder, tourLength } from "./tour";
export { buildRouteGeometry, simplifyPath, roundedPathD } from "./geometry";
export type { RouteGeometry, Pose, Point } from "./geometry";
