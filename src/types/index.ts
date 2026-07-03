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

export interface RecipeImage {
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

export interface RecipeVariant {
  swvId: string;          // specification-with-variants id (used for ordering)
  title: string | null;   // quantity label, e.g. "9 штук"
  qty: number | null;     // parsed quantity
  price: number | null;   // priceValue — sale price for this variant
  isDefault: boolean;
}

export interface Recipe {
  id: string;
  type: 'specifications';
  attributes: {
    title: string;
    description: string | null;
    status: 'on' | 'off' | 'deleted';
    public: boolean;
    minPrice: number;
    maxPrice: number;
    videoUrl: string | null;
    createdAt: string;
    updatedAt: string;
  };
  relationships: {
    category?: { data: { type: 'categories'; id: string } | null };
    logo?: { data: { type: 'images'; id: string } | null };
    images?: { data: { type: 'images'; id: string }[] };
    tags?: { data: { type: 'tags'; id: string }[] };
  };
  // Added by backend for convenience
  imageUrl?: string | null;
  imageUrls?: string[];
  variants?: RecipeVariant[];
}

export interface RecipeDetail extends Recipe {
  included?: {
    images?: Record<string, RecipeImage>;
    tags?: Record<string, { id: string; type: 'tags'; attributes: { title: string } }>;
    categories?: Record<string, RecipeCategory>;
  };
}

export interface RecipeCategory {
  id: string;
  type: 'categories';
  attributes: {
    title: string;
    status: 'on' | 'off';
    color: string;
    path: string[];
    pathIds: string[];
    slug?: string; // derived on the backend for /catalog/<slug> URLs
  };
  relationships: {
    parent: { data: { type: 'categories'; id: string } | null };
  };
}

export interface CartItem {
  id: string;          // unique cart-line key: recipeId, or `recipeId:swvId` when a variant is chosen
  recipeId: string;    // real recipe id sent to the order API
  swvId?: string;      // chosen quantity-variant (specification-with-variants)
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

// ---------- Admin (Posiflora 1:1 clone) ----------

export type OrderWorkflowStatus =
  | 'new' | 'assembled' | 'courier' | 'completed' | 'cancelled' | 'return' | 'credit';

export interface AdminOrderItem {
  recipe_id: string;
  title: string;
  price: number;
  qty: number;
  swv_id?: string | null;
}

export interface AdminOrder {
  id: string;
  type: 'orders';
  attributes: {
    status: OrderWorkflowStatus;
    paymentStatus: string;
    date: string | null;
    docNo: string | null;
    description: string;
    dueTime: string | null;
    deliveryContact: string;
    deliveryPhoneNumber: string;
    createdAt: string;
    closedAt: string | null;
    totalAmount: number;
    paymentsAmount: number;
    items: AdminOrderItem[];
  };
  relationships: {
    store?: { data: { type: 'stores'; id: string } | null };
    source?: { data: { type: 'order-sources'; id: string } | null };
    florist?: { data: { type: 'users'; id: string } | null };
    createdBy?: { data: { type: 'users'; id: string } | null };
    closedBy?: { data: { type: 'users'; id: string } | null };
  };
}

export interface AdminOrderPayment {
  id: string;
  type: 'order-payments';
  attributes: {
    date: string | null;
    amount: number;
    posted: boolean;
    terminalTransactionId: string | null;
  };
}

export interface AdminOrderStatusHistoryEntry {
  id: string;
  type: 'order-status-history';
  attributes: { status: OrderWorkflowStatus; changedAt: string | null };
  relationships: { worker?: { data: { type: 'users'; id: string } | null } };
}

export interface SimpleDictEntry {
  id: string;
  type: string;
  attributes: { title: string };
}

export interface Worker {
  id: string;
  type: 'workers';
  attributes: { name: string; login: string | null; status: string };
}

export interface MoneyDashboard {
  period: { from: string; to: string };
  updatedAt: string;
  revenueByShipment: { amount: number; changePct: number | null };
  revenueByPayment: { amount: number; changePct: number | null };
  grossProfit: null;
  totalDiscount: null;
  receiptsPrinted: null;
  marginPct: null;
  ordersCount: number;
  avgCheck: number;
  returnsCount: number;
  returnsAmount: number;
  employees: { workerId: string | null; name: string; avgCheck: number; sales: number; sharePct: number }[];
  paymentMethods: { title: string; amount: number; sharePct: number }[];
  dealSources: { title: string; amount: number; sharePct: number }[];
  upcomingWeek: { date: string; ordersCount: number }[];
}
