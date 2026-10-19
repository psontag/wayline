import { GenerateRequest } from "@wayline/domain";

export type ProposalsSearch = {
  request?: GenerateRequest;
  /** Selected proposal id. */
  selected?: string;
};

/** Search params of /proposals. Owned by the proposals screen. */
export function validateProposalsSearch(
  search: Record<string, unknown>,
): ProposalsSearch {
  const request = GenerateRequest.safeParse(search.request);
  return {
    request: request.success ? request.data : undefined,
    selected: typeof search.selected === "string" ? search.selected : undefined,
  };
}
