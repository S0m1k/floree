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
    budget: number;
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
    // «Быстрые теги» — order-tags ids; titles resolve via the response's
    // top-level `included` (see adminOrders.ts tagsById helpers).
    tags?: { data: { type: 'order-tags'; id: string }[] };
  };
}

// meta.aggregates of GET /v1/orders — итоговая строка под таблицей заказов
// (admin-map §2.2), computed over every order matching the current filters.
export interface AdminOrderAggregates {
  ordersTotal: number;
  budgetTotal: number;
  paidTotal: number;
  creditTotal: number;
  bonusTotal: number;
  discountTotal: number;
  markupTotal: number;
}

export interface AdminOrderPayment {
  id: string;
  type: 'order-payments';
  attributes: {
    date: string | null;
    amount: number;
    posted: boolean;
    terminalTransactionId: string | null;
    // Manual advance metadata (order card «Продукты», admin-map §2.2.1).
    // Optional so older consumers keep compiling.
    paymentType?: 'payment' | 'advance';
    method?: 'cash' | 'card' | 'sbp' | 'transfer' | null;
    createdAt?: string | null;
    fiscalized?: boolean;
    prepayment?: boolean;
  };
}

// GET /v1/orders/{id}/items — one «Состав заказа» line. A `bouquet` row may own
// component rows nested via the parent relationship.
export interface AdminOrderCompositionLine {
  id: string;
  type: 'order-items';
  attributes: {
    kind: 'bouquet' | 'item' | 'delivery' | 'custom';
    title: string;
    unitPrice: number;
    quantity: number;
    measure: string;
    markup: number;
    discount: number;
    originalSum: number;
    sum: number;
    createdAt: string | null;
  };
  relationships: {
    parent?: { data: { type: 'order-items'; id: string } | null };
    bouquet?: { data: { type: 'bouquets'; id: string } | null };
    inventoryItem?: { data: { type: 'inventory-items'; id: string } | null };
  };
}

// meta.totals of GET /v1/orders/{id}/items — итоговая панель (admin-map §2.2.1).
export interface AdminOrderTotals {
  productsCount: number;
  bouquetsCount: number;
  itemsTotal: number;
  discount: number;
  discountBreakdown: { flowers: number; bouquets: number; order: number };
  markup: number;
  markupBreakdown: { flowers: number; bouquets: number; order: number };
  bonusPaid: number;
  advances: number;
  grandTotal: number;
  toPay: number;
}

// GET /v1/bouquets — showcase bouquet: the «Добавить продукт» picker
// (order composition) and the /admin/showcase «Букеты в магазине» grid both
// use this shape; the grid additionally reads `createdAt`.
export interface AdminShowcaseBouquet {
  id: string;
  type: 'bouquets';
  attributes: {
    title: string;
    status: string;
    amount: number;
    saleAmount: number;
    createdAt: string | null;
  };
  relationships?: {
    store?: { data: { type: 'stores'; id: string } | null };
  };
}

// meta of GET /v1/bouquets — summary tabs on /admin/showcase.
export interface AdminShowcaseMeta {
  total: number;
  count: number;
  minPrice: number;
  maxPrice: number;
  totalSum: number;
}

// GET /v1/stores — full store resource (id/title/address) for the showcase
// store selector; SimpleDictEntry elsewhere only carries the title.
export interface AdminStore {
  id: string;
  type: 'stores';
  attributes: {
    title: string;
    address: string | null;
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
  attributes: {
    name: string;
    login: string | null;
    status: string;
    // Extended staff-control fields (admin-map §2.6.2). Optional so older
    // consumers (order filter selects) keep compiling unchanged.
    surname?: string | null;
    patronymic?: string | null;
    phone?: string | null;
    email?: string | null;
    accessRights?: string[];
    storeIds?: string[];
    hasPassword?: boolean;
    hasPin?: boolean;
    createdAt?: string | null;
  };
  relationships?: {
    role?: { data: { type: 'roles'; id: string } | null };
    store?: { data: { type: 'stores'; id: string } | null };
    stores?: { data: { type: 'stores'; id: string }[] };
  };
}

// Role permission flags for the POS/Florist apps (admin-map §2.6.3).
export interface RolePermissions {
  orderDiscount?: boolean;
  orderMarkup?: boolean;
  bouquetDiscount?: boolean;
  bouquetMarkup?: boolean;
  customItemPrice?: boolean;
}

export interface AdminRole {
  id: string;
  type: 'roles';
  attributes: {
    title: string;
    permissions: RolePermissions | null;
    isSystem: boolean;
  };
}

export interface AdminShift {
  id: string;
  type: 'shifts';
  attributes: {
    deviceName: string | null;
    openedAt: string | null;
    closedAt: string | null;
    openDiscrepancy: number;
    closeDiscrepancy: number;
  };
  relationships: {
    store?: { data: { type: 'stores'; id: string } | null };
    openedBy?: { data: { type: 'workers'; id: string } | null };
    closedBy?: { data: { type: 'workers'; id: string } | null };
  };
}

export interface AdminDevice {
  id: string;
  type: 'devices';
  attributes: { name: string | null; createdAt: string | null };
  relationships: { worker?: { data: { type: 'workers'; id: string } | null } };
}

export interface AdminCustomer {
  id: string;
  type: 'customers';
  attributes: {
    title: string | null;
    phone: string;
    email: string;
    birthday: string | null;
    notes: string;
    averageCheck: number;
    ordersAmount: number;
    ordersQty: number;
    currentPoints: number;
    gender: 'male' | 'female' | 'other';
    bonusCard: string | null;
    instagram: string | null;
    customerType: 'person' | 'company';
    isPerson: boolean;
    cardNumber: string | null;
    preferences: string | null;
    createdAt: string | null;
  };
  relationships?: {
    source?: { data: { type: 'order-sources'; id: string } | null };
  };
}

// GET /v1/customers/{id}/stats — плитки статистики карточки клиента.
export interface AdminCustomerStats {
  ordersCount: number;
  ordersTotal: number;
  avgCheck: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
}

// GET /v1/customers/{id}/spend — бар-чарт «Траты клиента».
export interface AdminCustomerSpend {
  from: string;
  to: string;
  days: { date: string; amount: number }[];
  total: number;
}

// GET /v1/customers/{id}/bonus-history — история списаний/начислений бонусов.
export interface AdminBonusHistoryEntry {
  id: string;
  type: 'customer-bonus-history';
  attributes: { amount: number; comment: string; createdAt: string | null };
  relationships: {
    worker?: { data: { type: 'users'; id: string } | null };
    order?: { data: { type: 'orders'; id: string } | null };
  };
}

export interface AdminCategory {
  id: string;
  type: 'categories';
  attributes: { title: string; status: 'on' | 'off'; deleted: boolean };
  relationships: { parent: { data: { type: 'categories'; id: string } | null } };
}

export interface AdminSpecification {
  id: string;
  type: 'specifications';
  attributes: {
    title: string;
    status: string;
    public: boolean;
    minPrice: number;
    maxPrice: number;
    variantsCount: number;
  };
  relationships: {
    category?: { data: { type: 'categories'; id: string } | null };
    logo?: { data: { type: 'images'; id: string } | null };
    author?: { data: { type: 'workers'; id: string } | null };
    recipeTags?: { data: { type: 'recipe-tags'; id: string }[] };
  };
}

// GET/POST/PATCH /v1/specifications/{id} — full recipe card
// (/admin/specifications/{id}, admin-map §2.3.2).
export interface AdminSpecificationDetail {
  id: string;
  type: 'specifications';
  attributes: {
    title: string;
    status: string;
    description: string;
    public: boolean;
    minPrice: number;
    maxPrice: number;
    videoUrl: string | null;
    createdAt: string | null;
    updatedAt: string | null;
  };
  relationships: {
    category?: { data: { type: 'categories'; id: string } | null };
    logo?: { data: { type: 'images'; id: string } | null };
    images?: { data: { type: 'images'; id: string }[] };
    author?: { data: { type: 'workers'; id: string } | null };
    recipeTags?: { data: { type: 'recipe-tags'; id: string }[] };
    specVariants?: { data: { type: 'specification-with-variants'; id: string }[] };
  };
}

// One quantity variant («19 штук») — a specification-with-variants (SWV) row.
export interface AdminSpecificationVariant {
  id: string;
  type: 'specification-with-variants';
  attributes: {
    status: string;
    isDefault: boolean;
    compositionTotal: number;
  };
  relationships: {
    variant?: { data: { type: 'specification-variants'; id: string } | null };
    specVariantPrices?: { data: { type: 'specification-variant-prices'; id: string }[] };
    composition?: { data: { type: 'specification-compositions'; id: string }[] };
  };
}

// The variant's display label (its title, e.g. "19 штук").
export interface AdminSpecificationVariantLabel {
  id: string;
  type: 'specification-variants';
  attributes: { title: string };
}

export interface AdminSpecificationVariantPrice {
  id: string;
  type: 'specification-variant-prices';
  attributes: {
    priceValue: number | null;
    effectivePrice: number;
    isDefaultPrice: boolean;
    compositionPrice: number;
    status: string;
  };
  relationships: {
    specVariants: { data: { type: 'specification-with-variants'; id: string } | null };
    store: { data: { type: 'stores'; id: string } | null };
  };
}

export interface AdminSpecificationComposition {
  id: string;
  type: 'specification-compositions';
  attributes: { quantity: number; retailPrice: number; sum: number; position: number };
  relationships: {
    specVariants: { data: { type: 'specification-with-variants'; id: string } | null };
    item: { data: { type: 'inventory-items'; id: string } | null };
  };
}

// ---------- Учёт и финансы (склад, каталог товаров, поставщики) ----------

export interface AdminMeasure {
  id: string;
  type: 'measures';
  attributes: { title: string; deleted: boolean };
}

export interface AdminInventoryItem {
  id: string;
  type: 'inventory-items';
  attributes: {
    title: string;
    itemType: 'item' | 'service';
    globalId?: string | null;
    barcode?: string | null;
    status: 'on' | 'off' | 'deleted';
    priceMin: number;
    priceMax: number;
    public: boolean;
    fractional: boolean;
    updatedAt: string;
    deleted: boolean;
  };
  relationships: {
    category?: { data: { type: 'categories'; id: string } | null };
    measure?: { data: { type: 'measures'; id: string } | null };
    logo?: { data: { type: 'images'; id: string } | null };
  };
}

export interface AdminVendor {
  id: string;
  type: 'vendors';
  attributes: {
    title: string;
    description: string | null;
    email: string | null;
    phone: string | null;
    isSystem?: boolean;
  };
}

export type AdminWarehouseDocType =
  | 'packing-invoices'
  | 'write-off-invoices'
  | 'markdown-acts'
  | 'sorting-acts'
  | 'inventory-acts'
  | 'movement-acts';

export interface AdminWarehouseDoc {
  id: string;
  type: AdminWarehouseDocType;
  attributes: {
    date: string | null;
    docNo: string | null;
    amount: number;
    linesCount: number;
    createdAt: string;
    posted: boolean;
    postedAt?: string | null;
    status: string;
    reason?: string | null;
  };
  relationships: {
    store?: { data: { type: 'stores'; id: string } | null };
    fromStore?: { data: { type: 'stores'; id: string } | null };
    toStore?: { data: { type: 'stores'; id: string } | null };
    vendor?: { data: { type: 'vendors'; id: string } | null };
    createdBy?: { data: { type: 'workers'; id: string } | null };
  };
}

export interface AdminWarehouseDocLine {
  id: string;
  type: string;
  attributes: {
    qty?: number;
    amount?: number;
    cost?: number;
    costPrice?: number;
    oldPrice?: number;
    newPrice?: number;
    expectedQty?: number;
  };
  relationships: {
    item?: { data: { type: 'inventory-items'; id: string } | null };
    itemFrom?: { data: { type: 'inventory-items'; id: string } | null };
    itemTo?: { data: { type: 'inventory-items'; id: string } | null };
  };
}

export interface DashboardPeriod {
  period: { from: string; to: string };
  updatedAt: string;
}

export interface DaySeriesPoint { date: string; amount: number }

export interface MoneyDashboard extends DashboardPeriod {
  revenueByShipment: { amount: number; changePct: number | null };
  revenueByPayment: { amount: number; changePct: number | null };
  grossProfit: null;
  totalDiscount: number;
  receiptsPrinted: number;
  marginPct: null;
  ordersCount: number;
  avgCheck: number;
  returnsCount: number;
  returnsAmount: number;
  employees: { workerId: string | null; name: string; avgCheck: number; sales: number; sharePct: number }[];
  paymentMethods: { title: string; amount: number; sharePct: number }[];
  dealSources: { title: string; amount: number; sharePct: number }[];
  upcomingWeek: { date: string; ordersCount: number }[];
  dailySeries: { shipment: DaySeriesPoint[]; payment: DaySeriesPoint[]; margin: DaySeriesPoint[] };
}

export interface CustomersDashboard extends DashboardPeriod {
  segments: {
    onceOnly: { count: number };
    noPurchases: { count: number };
    churnRisk: { count: number };
    activeRegular: { count: number };
  };
  newCustomers: { count: number; days: DaySeriesPoint[] };
  ordersWithCustomerPct: number;
  allTime: {
    customersCount: number;
    bonusesTotal: number;
    bonusEfficiencyPct: number | null;
    eventsTotal: number;
    eventsCoveragePct: number;
  };
  buyerTypes: { type: 'regular' | 'new' | 'anon'; title: string; count: number; sales: number; avgCheck: number; sharePct: number }[];
  salesBySegment: Record<'regular' | 'new' | 'anon', { total: number; days: DaySeriesPoint[] }>;
  bonusSystem: {
    accrued: { total: number; days: DaySeriesPoint[] };
    spent: { total: number; days: DaySeriesPoint[] };
    efficiencyPct: number | null;
  };
}

export interface BouquetsDashboard extends DashboardPeriod {
  revenue: number;
  avgPrice: number;
  marginPct: null;
  bouquetsSold: number;
  soldWithDelivery: number;
  avgPerDay: number;
  weekday: { label: string; count: number; isWeekend: boolean }[];
  hourly: { hour: number; revenue: number }[];
  priceRanking: { label: string; sold: number; revenue: number }[];
  topProducts: { title: string; sold: number; revenue: number }[];
}

export interface WarehouseDashboard extends DashboardPeriod {
  purchasesByCategory: { category: string; amount: number }[];
  totalPurchases: number;
  writeOffsByReason: { reason: string; amount: number; sharePct: number }[];
  totalWriteOffs: number;
  inventoryResult: { surplus: number; shortage: number; net: number };
  writtenOffTop: {
    byAmount: { title: string; quantity: number; amount: number; sharePct: number }[];
    byQuantity: { title: string; quantity: number; amount: number; sharePct: number }[];
    reasons: string[];
  };
  right: {
    stockRetailValue: number;
    writeOffPct: number;
    stockFlowersCost: number;
    stockOtherCost: number;
    writeOffInvoicesCount: number;
    packingInvoicesCount: number;
    inventoryActsCount: number;
  };
}
