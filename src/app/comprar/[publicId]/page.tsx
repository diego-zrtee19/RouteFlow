import { CatalogCheckout } from "@/components/checkout/CatalogCheckout";

export default async function ConversationCheckoutPage({
  params,
}: {
  params: Promise<{ publicId: string }>;
}) {
  const { publicId } = await params;
  return <CatalogCheckout salePublicId={publicId} />;
}
