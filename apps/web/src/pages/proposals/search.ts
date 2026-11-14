import { GenerateRequest } from "@wayline/domain";
import { z } from "zod";

export type ProposalsSearch = {
  request?: GenerateRequest;
  /** More requests from other starts. The best proposals of all are kept. */
  also?: GenerateRequest[];
  /** Area the requests came from. Back opens its Area step. */
  area?: string;
  /** Selected proposal id. */
  selected?: string;
};

/** Search params of /proposals. Owned by the proposals screen. */
export function validateProposalsSearch(
  search: Record<string, unknown>,
): ProposalsSearch {
  const request = GenerateRequest.safeParse(search.request);
  const also = z.array(GenerateRequest).safeParse(search.also);
  return {
    request: request.success ? request.data : undefined,
    ...(request.success && also.success && also.data.length
      ? { also: also.data }
      : {}),
    ...(typeof search.area === "string" ? { area: search.area } : {}),
    selected: typeof search.selected === "string" ? search.selected : undefined,
  };
}
