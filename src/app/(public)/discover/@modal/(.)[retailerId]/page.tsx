import { BrandDetails } from "@/components/retailers/brand-details";
import { BrandSheet } from "@/components/retailers/brand-sheet";
import { loadBrand } from "@/server/catalog/brand";

// S-104 opened from Discover (decision 0016): the same content as the full page, stacked, in a
// pop-up. Same data and checks as the full page (loadBrand).
export default async function BrandPopup({
  params,
}: PageProps<"/discover/[retailerId]">) {
  const brand = await loadBrand((await params).retailerId);
  return (
    <BrandSheet>
      <BrandDetails brand={brand} variant="sheet" />
    </BrandSheet>
  );
}
