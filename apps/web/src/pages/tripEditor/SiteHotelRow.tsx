import { HotelRow, type HotelRowProps } from "@wayline/ui";
import { useSiteInfo } from "../../data/queries";

/** Website checks per hotel list. Each one is a request to the server. */
export const SITE_CHECKS = 8;

/**
 * HotelRow with the website's image. Hides the link when the site is gone.
 * check: false skips the lookup, for long lists.
 */
export function SiteHotelRow({
  check = true,
  ...props
}: HotelRowProps & { check?: boolean }) {
  const site = useSiteInfo(check ? props.website : undefined);
  return (
    <HotelRow
      {...props}
      {...(site?.ok === false && { website: undefined })}
      {...(site?.image && { image: site.image })}
    />
  );
}
