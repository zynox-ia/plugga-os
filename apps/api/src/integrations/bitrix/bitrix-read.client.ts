export interface BitrixListParams {
  [key: string]: unknown;
}

export interface BitrixListResponse {
  /** One page of records. */
  result: unknown[];
  /** Total count reported by Bitrix, when present. */
  total?: number;
  /** Offset of the next page, or undefined when this is the last page. */
  next?: number;
}

/**
 * Read-only client to the Bitrix REST API. Implementations MUST only issue read
 * methods (list/get/fields) — there is no write path by construction (ADR-0009).
 */
export abstract class BitrixReadClient {
  abstract callList(
    method: string,
    params: BitrixListParams,
    start: number,
  ): Promise<BitrixListResponse>;
}
