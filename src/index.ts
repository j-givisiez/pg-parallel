/**
 * @file Entry point for the pg-parallel package.
 *
 * This file exports the primary `PgParallel` class and its associated types,
 * making them available for consumption by other modules. By centralizing the
 * exports, it provides a clean and consistent public API for the package.
 */

export { PgParallel } from "./pg-parallel";
export type { IPgParallel, PgParallelConfig, IParallelClient } from "./types";
