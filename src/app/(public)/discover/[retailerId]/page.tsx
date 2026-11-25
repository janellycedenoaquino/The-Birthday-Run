import type { Metadata } from "next";
import { BrandDetails } from "@/components/retailers/brand-details";
import { msg } from "@/lib/messages";
import { loadBrand } from "@/server/catalog/brand";

// S-104 Retailer details (SPEC §3.3, BUILD F-3: FR-4, FR-8, FR-49; look: decision 0016): the full
// page search engines and shared links open. Public for every non-retired retailer (D3, decision
// 0017); retired and unknown IDs are a 404 (loadBrand). Signed in with a birthday: the user's
// dates (M-279) and the report dialog (C-107, F-13: FR-48).

export async function generateMetadata({
  params,
}: PageProps<"/discover/[retailerId]">): Promise<Metadata> {
  const { retailer } = await loadBrand((await params).retailerId);
  return {
    title: msg("M-298").replace("{brand}", retailer.name),
    description: retailer.reward_description,
  };
}

export default async function RetailerPage({
  params,
}: PageProps<"/discover/[retailerId]">) {
  const brand = await loadBrand((await params).retailerId);
  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-10 sm:px-6">
      <BrandDetails brand={brand} variant="page" />
    </div>
  );
}
