export const PERMISSIONS = {
  overview: "overview.view",
  purchaseTrips: "purchase.trips",
  purchaseContainers: "purchase.containers",
  sales: "sales.view",
  inventory: "inventory.view",
  expensify: "expensify.view",
  finance: "finance.view",
  partnership: "partnership.view",
  reports: "reports.view",
  requestbox: "requestbox.view",
  admin: "admin.access",
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
