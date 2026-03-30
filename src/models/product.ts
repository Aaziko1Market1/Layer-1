import { ObjectId } from 'mongodb';

/**
 * Product catalog entry — matches build_product_index.py output.
 */
export interface ProductCatalog {
  _id?: ObjectId;
  product_name: string;
  product_name_2: string;
  source: 'aaziko' | 'indiamart';
  source_id: string;
  hs_code: string | null;
  categories: string[];
  keywords: string[];
  description: string;
  main_image_url: string;
  min_price_usd: number | null;
  min_quantity: number | null;
  company_id: string;
  company_name?: string;
  vendor_id: string;
  seller_name?: string;
  company_website?: string;
  company_nature?: string;
  gst_number?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;
  product_url?: string;
  category_raw?: string;
  subcategory_raw?: string;
  is_active: boolean;
  created_at?: Date;
  updated_at?: Date;
}
