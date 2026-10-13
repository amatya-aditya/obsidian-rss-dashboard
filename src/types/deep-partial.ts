/**
 * A recursive partial of `T`: every property is optional, and nested objects
 * and array elements are themselves deep-partial. It describes settings as
 * they are read from disk or an import file, where any group or element may be
 * missing or only partly populated.
 */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends Array<infer U>
    ? Array<DeepPartial<U>>
    : T[K] extends ReadonlyArray<infer U>
      ? ReadonlyArray<DeepPartial<U>>
      : T[K] extends object
        ? DeepPartial<T[K]>
        : T[K];
};
