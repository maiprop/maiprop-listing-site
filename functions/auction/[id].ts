import { renderListingDetailSeo, type SeoEnv } from "../_seo";

export const onRequestGet: PagesFunction<SeoEnv, "id"> = (ctx) => renderListingDetailSeo(ctx);
