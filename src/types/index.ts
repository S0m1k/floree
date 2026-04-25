export interface CatalogCategory {
  id: string;
  type: string;
  attributes: {
    title: string;
    slug: string;
    imageUrl?: string;
    position?: number;
  };
}

export interface CatalogItem {
  id: string;
  type: string;
  attributes: {
    itemId: string;
    itemType: 'item' | 'service';
    title: string;
    globalId?: string;
    activePoints?: number;
    minPrice: number;
    maxPrice: number;
    updatedAt: string;
    public: boolean;
    fractional: boolean;
    imageUrl?: string;
    description?: string;
  };
}

export interface BouquetImage {
  id: string;
  type: 'images';
  attributes: {
    hash: string;
    file: string;
    fileSmall: string;
    fileMedium: string;
    fileShop: string;
  };
}

export interface Bouquet {
  id: string;
  type: 'bouquets';
  attributes: {
    title: string;
    description: string;
    amount: number;
    saleAmount: number;
    status: 'created' | 'demonstrated' | 'purchased' | 'deleted' | 'cancelled';
    onWindowAt: string | null;
    docNo: string;
    height: number;
    width: number;
    barcode?: string;
  };
  relationships: {
    logo: { data: { type: 'images'; id: string } | null };
    store: { data: { type: 'stores'; id: string } };
  };
}

export interface BouquetsResponse {
  meta: { page: { number: number; size: number }; total: number };
  data: Bouquet[];
  included?: BouquetImage[];
}

export interface CartItem {
  id: string;        // bouquet id
  title: string;
  price: number;
  quantity: number;
  imageUrl?: string;
}

export interface OrderFormData {
  customerName: string;
  phone: string;
  address: string;
  deliveryDate: string;
  deliveryTime: string;
  comment: string;
}
